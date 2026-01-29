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

async function main() {
    console.log('=== Testing Tax Invoice Parsing with Updated CONFIG.TAX_INVOICE Patterns ===\n');

    const testFile = 'test_data/Fatura FT OM.2026_1 Original.pdf';
    console.log(`Test file: ${testFile}\n`);

    const data = new Uint8Array(fs.readFileSync(testFile));
    const pdf = await getDocument({ data }).promise;

    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = normalizeText(reconstructTextWithLines(textContent.items));

    console.log('--- Extracted Text (first 500 chars) ---');
    console.log(pageText.substring(0, 500));
    console.log('\n--- Parsing Tax Invoice ---');

    const taxRecord = parseTaxInvoice(pageText, testFile);

    if (taxRecord) {
        console.log('\n✅ Tax Invoice Parsed Successfully:');
        console.log(`  Tax Invoice Number: ${taxRecord.tax_invoice_number}`);
        console.log(`  Sales Order: ${taxRecord.sales_order}`);
        console.log(`  Customer Code: ${taxRecord.customer_code}`);
        console.log(`  Customer Name: ${taxRecord.customer_name}`);
        console.log(`  Invoice Date: ${taxRecord.invoice_date}`);
        console.log(`  Due Date: ${taxRecord.due_date}`);
        console.log(`  Currency: ${taxRecord.currency}`);
        console.log(`  Total Amount: ${taxRecord.total_amount}`);
        console.log(`  Source File: ${taxRecord.file}`);
    } else {
        console.log('\n❌ Failed to parse tax invoice');
    }

    // Check for missing fields
    if (taxRecord) {
        const missingFields = [];
        if (!taxRecord.tax_invoice_number) missingFields.push('tax_invoice_number');
        if (!taxRecord.sales_order) missingFields.push('sales_order');
        if (!taxRecord.customer_code) missingFields.push('customer_code');
        if (!taxRecord.customer_name) missingFields.push('customer_name');
        if (!taxRecord.invoice_date) missingFields.push('invoice_date');
        if (!taxRecord.currency) missingFields.push('currency');
        if (taxRecord.total_amount === null) missingFields.push('total_amount');

        if (missingFields.length > 0) {
            console.log('\n⚠️  Missing fields:');
            missingFields.forEach(field => console.log(`  - ${field}`));
        } else {
            console.log('\n✅ All required fields extracted successfully!');
        }
    }
}

main().catch(console.error);
