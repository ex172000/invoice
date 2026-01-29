import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinanceInvoice, parseTaxInvoice, crossCheckInvoices } from './js/modules/invoiceChecker.js';

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
    normalized = normalized.split('\\n').map(line => line.trim()).join('\n');
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

    return { pages, numPages: pdf.numPages };
}

async function main() {
    console.log('=== Testing Full Cross-Check Workflow ===\n');

    // Extract Finance invoice
    console.log('1. Parsing Finance invoice...');
    const financeResult = await extractPdfText('test_data/Finance invoice.pdf');
    const financeRecords = parseFinanceInvoice(financeResult.pages);
    console.log(`   ✅ Parsed ${financeRecords.length} Finance invoice records\n`);

    // Extract Tax invoice
    console.log('2. Parsing Tax invoice...');
    const taxFile = 'test_data/Fatura FT OM.2026_1 Original.pdf';
    const taxResult = await extractPdfText(taxFile);
    const taxText = taxResult.pages[0];

    // Simulate taxInvoices array structure expected by crossCheckInvoices
    const taxInvoices = [{
        file: { name: taxFile },
        text: taxText,
        renamedFile: { name: '26.01_TEMPUR_11051939_OM.2026_1.pdf' }
    }];

    console.log('   ✅ Parsed 1 Tax invoice\n');

    // Cross-check
    console.log('3. Running cross-check...');
    const results = crossCheckInvoices(taxInvoices, financeResult.pages);
    console.log(`   ✅ Generated ${results.length} comparison results\n`);

    // Display results
    console.log('=== Cross-Check Results ===\n');
    for (const result of results) {
        console.log(`Tax Invoice: ${result.tax_invoice_number}`);
        console.log(`  Sales Order: ${result.sales_order_number}`);
        console.log(`  Customer Code: ${result.customer_code}`);
        console.log(`  Customer Name: ${result.customer_name}`);
        console.log(`  Invoice Date: ${result.invoice_date}`);
        console.log(`  Tax Invoice Amount: ${result.invoice_amount} ${result.currency}`);
        console.log(`  Finance Invoice Amount: ${result.finance_invoice_amount} ${result.finance_invoice_currency}`);
        console.log(`  Amount Difference: ${result.amount_difference}`);
        console.log(`  Status: ${result.check_status}`);
        if (result.mismatch_fields) {
            console.log(`  Mismatch Fields: ${result.mismatch_fields}`);
        }
        console.log('');
    }

    // Summary
    const okCount = results.filter(r => r.check_status === 'OK').length;
    const mismatchCount = results.filter(r => r.check_status === 'MISMATCH').length;
    const notFoundCount = results.filter(r => r.check_status === 'NOT_FOUND').length;

    console.log('=== Summary ===');
    console.log(`  OK: ${okCount}`);
    console.log(`  MISMATCH: ${mismatchCount}`);
    console.log(`  NOT_FOUND: ${notFoundCount}`);

    if (okCount > 0) {
        console.log('\n✅ SUCCESS! Cross-check found matching Finance invoice record!');
    } else if (notFoundCount > 0) {
        console.log('\n⚠️  Tax invoice marked as NOT_FOUND - no matching Finance invoice record');
    }
}

main().catch(console.error);
