// Test script to run JavaScript extraction logic in Node.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure worker
GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

// Inline the extraction logic from our modules
function reconstructTextWithLines(items) {
    if (!items || items.length === 0) return '';

    // Use PDF's internal text order directly (like pypdf does)
    const lines = [];
    let currentLine = '';
    let lastY = null;
    const lineHeightTolerance = 5;

    for (const item of items) {
        if (!item.str) continue;

        const y = item.transform[5];
        const text = item.str;

        // Check if we're on a new line (Y position changed)
        if (lastY !== null && Math.abs(y - lastY) > lineHeightTolerance) {
            // New line - save current and start fresh
            if (currentLine.trim()) {
                lines.push(currentLine.trim());
            }
            currentLine = text;
        } else {
            // Same line - add space if needed
            if (currentLine && !currentLine.endsWith(' ') && !text.startsWith(' ')) {
                currentLine += ' ';
            }
            currentLine += text;
        }

        lastY = y;
    }

    // Add last line
    if (currentLine.trim()) {
        lines.push(currentLine.trim());
    }

    return lines.join('\n');
}

function normalizeText(text) {
    if (!text) return '';
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    normalized = normalized.replace(/[ \t]+/g, ' ');
    normalized = normalized.split('\n').map(line => line.trim()).join('\n');
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    return normalized.trim();
}

function textToLines(text) {
    if (!text) return [];
    return text.split('\n').filter(line => line.trim().length > 0);
}

function looksLikeName(line) {
    if (!line) return false;
    if (/@/.test(line) || /https?:\/\//.test(line)) return false;
    if (/\b(Tax ID|Capital Social|Contribuinte|Rua|Lisboa|Lisbon|Morada|Payment|Date)\b/i.test(line)) return false;
    if (/\d{6,}/.test(line)) return false;
    return /[A-Za-z]/.test(line);
}

function findCustomer(lines) {
    // Method 1: Look for "Exmo Sr"
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Exmo.*Sr/i.test(line)) {
            const candidates = [];
            if (i > 0) candidates.push(lines[i - 1]);
            if (i + 1 < lines.length) candidates.push(lines[i + 1]);
            for (const cand of candidates) {
                if (looksLikeName(cand)) {
                    return cand.trim();
                }
            }
        }
    }

    // Method 2: Look for "Dear Sir" or "Dear Madam"
    let lastDear = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("Dear Sir") || line.includes("Dear Madam")) {
            if (i > 0 && looksLikeName(lines[i - 1])) {
                lastDear = lines[i - 1];
            }
        }
    }
    if (lastDear) return lastDear;

    // Method 3: Look for company suffixes
    for (const line of lines) {
        if (line.length <= 60 && !/\d{5,}/.test(line)) {
            if (/\b(LLC|UAB|LDA|LDA\.|S\.A|S\.A\.|Ltda|SIA)\b/i.test(line)) {
                return line.trim();
            }
        }
    }

    return null;
}

function findDate(text, lines) {
    const patterns = [
        /\bDate\s+(\d{4}-\d{2}-\d{2})/i,
        /\bData\s+(\d{4}-\d{2}-\d{2})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }

    const fallback = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    return fallback ? fallback[1] : null;
}

function formatDate(rawDate) {
    if (!rawDate) return null;
    try {
        const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const [, , month, day] = match;
        return `${day}.${month}`;
    } catch (e) {
        return null;
    }
}

function findOrder(text) {
    const patterns = [
        /Order\/Quote\s+([A-Za-z0-9_.-]+)/i,
        /Order\s*[:#]?\s*([A-Za-z0-9_.-]+)/i,
    ];

    let raw = null;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            raw = match[1];
            break;
        }
    }

    if (!raw) {
        const allDigits = text.match(/\b(\d{6,})\b/g);
        raw = allDigits ? allDigits[0] : null;
    }

    if (raw) {
        const digitChunks = raw.match(/\d+/g);
        if (digitChunks && digitChunks.length > 0) {
            const best = digitChunks.reduce((a, b) => a.length >= b.length ? a : b);
            return best.length > 8 ? best.substring(0, 8) : best;
        }
    }

    return raw;
}

function parseInvoiceCode(filename) {
    const match = filename.match(/\b(OM\.\d{4}_\d+|PTR\.\d{4}_\d+)\b/i);
    return match ? match[1] : null;
}

async function extractText(filepath) {
    const data = new Uint8Array(fs.readFileSync(filepath));
    const pdf = await getDocument({ data }).promise;

    const pages = [];
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = reconstructTextWithLines(textContent.items);
        pages.push(pageText);
        fullText += pageText + '\n';
    }

    return {
        text: normalizeText(fullText),
        pages: pages.map(p => normalizeText(p)),
    };
}

async function testFile(filepath) {
    const filename = path.basename(filepath);
    console.log(`\n=== Testing: ${filename} ===`);

    const code = parseInvoiceCode(filename);
    if (!code) {
        console.log('  ❌ No invoice code found');
        return;
    }
    console.log(`  Code: ${code}`);

    const { text } = await extractText(filepath);
    const lines = textToLines(text);

    console.log(`  Total lines: ${lines.length}`);

    // Show first 10 lines
    console.log('\n  First 10 lines:');
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        console.log(`    ${i}: '${lines[i]}'`);
    }

    const rawDate = findDate(text, lines);
    const dateDDMM = formatDate(rawDate);
    console.log(`\n  Raw Date: ${rawDate}`);
    console.log(`  Formatted Date: ${dateDDMM}`);

    const customer = findCustomer(lines);
    console.log(`  Customer: ${customer || '(not found)'}`);

    const order = findOrder(text);
    console.log(`  Order: ${order || '(not found)'}`);

    if (dateDDMM && customer && order) {
        const newName = `${dateDDMM}_${customer.replace(/[^A-Za-z0-9._ -]+/g, ' ').replace(/\s+/g, '_')}_${order}_${code}.pdf`;
        console.log(`\n  ✅ New filename: ${newName}`);
    } else {
        console.log(`\n  ❌ Missing fields - cannot rename`);
    }
}

async function main() {
    const testDataDir = 'test_data';
    const files = fs.readdirSync(testDataDir)
        .filter(f => f.endsWith('.pdf') && !f.toLowerCase().includes('finance'))
        .slice(0, 3); // Test first 3 files

    for (const file of files) {
        await testFile(path.join(testDataDir, file));
    }
}

main().catch(console.error);
