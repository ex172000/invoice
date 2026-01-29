import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

function reconstructTextWithLines(items) {
    if (!items || items.length === 0) return '';
    const lines = [];
    let currentLine = '';
    let lastY = null;
    const lineHeightTolerance = 5;

    for (const item of items) {
        if (!item.str) continue;
        const y = item.transform[5];
        const text = item.str;

        if (lastY !== null && Math.abs(y - lastY) > lineHeightTolerance) {
            if (currentLine.trim()) {
                lines.push(currentLine.trim());
            }
            currentLine = text;
        } else {
            if (currentLine && !currentLine.endsWith(' ') && !text.startsWith(' ')) {
                currentLine += ' ';
            }
            currentLine += text;
        }
        lastY = y;
    }

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

async function debugInvoice(filename) {
    console.log(`\n=== Debugging: ${filename} ===\n`);

    const data = new Uint8Array(fs.readFileSync(filename));
    const pdf = await getDocument({ data }).promise;

    console.log(`Total pages: ${pdf.numPages}\n`);

    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = normalizeText(reconstructTextWithLines(textContent.items));

    const lines = pageText.split('\n');
    console.log(`Total lines: ${lines.length}\n`);

    // Find lines with large numbers (possible total amounts)
    console.log('Lines with amounts (5+ digits or decimal amounts):');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/\d{5,}|\d+[.,]\d{3}[.,]\d{2}|\d+,\d{3}\.\d{2}/)) {
            console.log(`  ${i}: ${lines[i]}`);
        }
    }

    // Check for EUR patterns
    console.log('\nLines with EUR:');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('EUR')) {
            console.log(`  ${i}: ${lines[i]}`);
        }
    }

    // Show last 20 lines (totals usually at end)
    console.log('\nLast 20 lines of invoice:');
    for (let i = Math.max(0, lines.length - 20); i < lines.length; i++) {
        console.log(`  ${i}: ${lines[i]}`);
    }
}

debugInvoice('/Users/qichao/invoice/test_data/Fatura FT OM.2026_5 Original.pdf').catch(console.error);
