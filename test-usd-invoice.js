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

async function testInvoice(filename, expectedCurrency) {
    console.log(`\n=== Testing: ${filename} ===`);
    console.log(`Expected currency: ${expectedCurrency}\n`);

    const data = new Uint8Array(fs.readFileSync(filename));
    const pdf = await getDocument({ data }).promise;

    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = normalizeText(reconstructTextWithLines(textContent.items));

    // Show currency-related text
    const lines = pageText.split('\n');
    console.log('Currency-related lines:');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('USD') || lines[i].includes('EUR') || lines[i].includes('Currency')) {
            console.log(`  ${i}: ${lines[i]}`);
        }
    }

    const taxRecord = parseTaxInvoice(pageText, filename);

    console.log('\nParsed Result:');
    console.log(`  Currency: ${taxRecord.currency}`);
    console.log(`  Total Amount: ${taxRecord.total_amount}`);
    console.log(`  Sales Order: ${taxRecord.sales_order}`);

    const match = taxRecord.currency === expectedCurrency ? '✅' : '❌';
    console.log(`\n${match} Currency ${match === '✅' ? 'matches' : 'DOES NOT match'} expected: ${expectedCurrency}`);
}

async function main() {
    // Test EUR invoice
    await testInvoice('/Users/qichao/invoice/test_data/Fatura FT OM.2026_1 Original.pdf', 'EUR');

    // Test USD invoice
    await testInvoice('/Users/qichao/invoice/test_data/Fatura FT OM.2026_9 Original.pdf', 'USD');

    // Test another USD invoice
    await testInvoice('/Users/qichao/invoice/test_data/Fatura FT OM.2026_11 Original.pdf', 'USD');
}

main().catch(console.error);
