import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseTaxInvoice } from './js/modules/invoiceChecker.js';

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

async function debugPTR(filename) {
    console.log(`\n=== Debugging PTR Invoice: ${filename} ===\n`);

    const data = new Uint8Array(fs.readFileSync(filename));
    const pdf = await getDocument({ data }).promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = normalizeText(reconstructTextWithLines(textContent.items));
        pages.push(pageText);
    }

    const combinedText = pages.join('\n\n');
    const lines = combinedText.split('\n');

    // Show date-related lines
    console.log('Date-related lines:');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Date') || lines[i].includes('Venc') || lines[i].match(/\d{4}-\d{2}-\d{2}/)) {
            console.log(`  ${i}: ${lines[i]}`);
        }
    }

    // Parse the invoice
    const taxRecord = parseTaxInvoice(combinedText, filename);

    console.log('\nParsed Result:');
    console.log(`  Invoice Date: ${taxRecord.invoice_date}`);
    console.log(`  Due Date: ${taxRecord.due_date}`);

    // Compare with expected
    console.log('\nExpected from CSV:');
    console.log(`  Invoice Date: 2026-01-05`);
    console.log(`  Due Date: ?`);
}

debugPTR('/Users/qichao/invoice/test_data/Fatura FT PTR.2026_1 Original.pdf').catch(console.error);
