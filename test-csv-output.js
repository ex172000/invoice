import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { crossCheckInvoices, parseFinanceInvoice } from './js/modules/invoiceChecker.js';
import { generateCSVBlob } from './js/modules/csvGenerator.js';

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

async function extractPdfText(filepath) {
    const data = new Uint8Array(fs.readFileSync(filepath));
    const pdf = await getDocument({ data }).promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = normalizeText(reconstructTextWithLines(textContent.items));
        pages.push(pageText);
    }

    return pages;
}

async function main() {
    console.log('=== Testing CSV Output ===\n');

    // Extract Finance invoice
    const financePages = await extractPdfText('/Users/qichao/invoice/test_data/Finance invoice.pdf');

    // Get all tax invoice files
    const testDataDir = '/Users/qichao/invoice/test_data';
    const files = fs.readdirSync(testDataDir)
        .filter(f => f.startsWith('Fatura') && f.endsWith('.pdf'))
        .sort();

    // Extract tax invoices
    const taxInvoices = [];
    for (const file of files) {
        const filepath = path.join(testDataDir, file);
        const pages = await extractPdfText(filepath);
        const combinedText = pages.join('\n\n');
        taxInvoices.push({
            file: { name: file },
            text: combinedText,
            renamedFile: { name: file },
        });
    }

    // Cross-check
    const results = crossCheckInvoices(taxInvoices, financePages);

    // Generate CSV
    const csvBlob = generateCSVBlob(results);
    const csvText = await csvBlob.text();

    console.log('=== CSV Output ===\n');
    console.log(csvText);

    // Show only MISMATCH rows
    console.log('\n=== MISMATCH Rows Only ===\n');
    const lines = csvText.split('\n');
    console.log(lines[0]); // Header
    for (const line of lines.slice(1)) {
        if (line.includes('MISMATCH')) {
            console.log(line);
        }
    }
}

main().catch(console.error);
