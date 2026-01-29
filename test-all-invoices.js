import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { crossCheckInvoices, parseFinanceInvoice } from './js/modules/invoiceChecker.js';

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
    console.log('=== Testing All Invoices Against Expected Results ===\n');

    // Extract Finance invoice
    console.log('1. Parsing Finance invoice...');
    const financePages = await extractPdfText('/Users/qichao/invoice/test_data/Finance invoice.pdf');
    console.log(`   ✅ Extracted ${financePages.length} pages\n`);

    // Get all tax invoice files
    const testDataDir = '/Users/qichao/invoice/test_data';
    const files = fs.readdirSync(testDataDir)
        .filter(f => f.startsWith('Fatura') && f.endsWith('.pdf'))
        .sort();

    console.log(`2. Found ${files.length} tax invoices\n`);

    // Extract tax invoices
    const taxInvoices = [];
    for (const file of files) {
        const filepath = path.join(testDataDir, file);
        const pages = await extractPdfText(filepath);
        // Combine all pages for multi-page invoices
        const combinedText = pages.join('\n\n');
        taxInvoices.push({
            file: { name: file },
            text: combinedText,
            renamedFile: { name: file }, // Use original name for now
        });
    }

    console.log('3. Running cross-check...\n');
    const results = crossCheckInvoices(taxInvoices, financePages);

    // Filter to only tax invoice results (exclude FINANCE_ONLY)
    const taxResults = results.filter(r => r.tax_invoice_number);

    console.log('=== Results Summary ===');
    console.log(`Total results: ${taxResults.length}`);
    console.log(`OK: ${taxResults.filter(r => r.check_status === 'OK').length}`);
    console.log(`MISMATCH: ${taxResults.filter(r => r.check_status === 'MISMATCH').length}`);
    console.log(`NOT_FOUND: ${taxResults.filter(r => r.check_status === 'NOT_FOUND').length}`);
    console.log('');

    // Show detailed results
    console.log('=== Detailed Results ===\n');
    for (const result of taxResults) {
        const status = result.check_status === 'OK' ? '✅' :
                      result.check_status === 'MISMATCH' ? '⚠️' : '❌';

        console.log(`${status} ${result.tax_invoice_number}`);
        console.log(`   SO: ${result.sales_order_number}, Customer: ${result.customer_code}`);
        console.log(`   Tax: ${result.invoice_amount} ${result.currency}`);
        console.log(`   Finance: ${result.finance_invoice_amount} ${result.finance_invoice_currency}`);
        console.log(`   Diff: ${result.amount_difference}`);
        console.log(`   Status: ${result.check_status}${result.mismatch_fields ? ' (' + result.mismatch_fields + ')' : ''}`);
        console.log('');
    }

    // Compare with expected results
    console.log('=== Comparing with Expected Results ===\n');
    const expectedCSV = fs.readFileSync('/Users/qichao/invoice/completed/invoice_check_results.csv', 'utf-8');
    const expectedLines = expectedCSV.split('\n').slice(1).filter(l => l.trim()); // Skip header

    console.log(`Expected records: ${expectedLines.length}`);
    console.log(`Our records: ${taxResults.length}`);

    if (taxResults.length !== expectedLines.length) {
        console.log(`\n⚠️ Record count mismatch!`);
    } else {
        console.log(`\n✅ Record count matches`);
    }

    // Check a few key records
    console.log('\n=== Spot Check Key Records ===\n');

    const spotChecks = [
        { invoice: 'FT OM.2026/1', expectedCurrency: 'EUR', expectedAmount: '3364.93', expectedStatus: 'OK' },
        { invoice: 'FT OM.2026/9', expectedCurrency: 'USD', expectedAmount: '29700.96', expectedStatus: 'OK' },
        { invoice: 'FT OM.2026/11', expectedCurrency: 'USD', expectedAmount: '515.91', expectedStatus: 'OK' },
        { invoice: 'FT OM.2026/3', expectedCurrency: 'USD', expectedAmount: '37002.55', expectedStatus: 'MISMATCH' },
    ];

    for (const check of spotChecks) {
        const result = taxResults.find(r => r.tax_invoice_number === check.invoice);
        if (!result) {
            console.log(`❌ ${check.invoice}: NOT FOUND`);
            continue;
        }

        const currencyMatch = result.currency === check.expectedCurrency;
        const amountMatch = result.invoice_amount === check.expectedAmount;
        const statusMatch = result.check_status === check.expectedStatus;

        const allMatch = currencyMatch && amountMatch && statusMatch;
        const icon = allMatch ? '✅' : '❌';

        console.log(`${icon} ${check.invoice}`);
        console.log(`   Currency: ${result.currency} (expected ${check.expectedCurrency}) ${currencyMatch ? '✅' : '❌'}`);
        console.log(`   Amount: ${result.invoice_amount} (expected ${check.expectedAmount}) ${amountMatch ? '✅' : '❌'}`);
        console.log(`   Status: ${result.check_status} (expected ${check.expectedStatus}) ${statusMatch ? '✅' : '❌'}`);
        console.log('');
    }
}

main().catch(console.error);
