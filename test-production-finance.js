import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancePage } from './js/modules/invoiceChecker.js';

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
    console.log('=== Testing PRODUCTION parseFinancePage() from invoiceChecker.js ===\n');

    const data = new Uint8Array(fs.readFileSync('test_data/Finance invoice.pdf'));
    const pdf = await getDocument({ data }).promise;

    console.log(`Total pages: ${pdf.numPages}\n`);

    const records = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = normalizeText(reconstructTextWithLines(textContent.items));

        // Use PRODUCTION parseFinancePage function
        const rec = parseFinancePage(pageText);

        if (rec) {
            records.push(rec);
            console.log(`Page ${pageNum}:`);
            console.log(`  Sales Order: ${rec.sales_order}`);
            console.log(`  Customer Code: ${rec.customer_code}`);
            console.log(`  Customer Name: ${rec.customer_name}`);
            console.log(`  Invoice Date: ${rec.invoice_date}`);
            console.log(`  Total Due: ${rec.total_due}`);
            console.log(`  Currency: ${rec.currency}`);
            console.log(`  Prepayment: ${rec.prepayment}`);
            console.log(`  Total Amount: ${rec.total_amount}`);
            console.log('');
        }
    }

    console.log(`\n✅ Parsed ${records.length} Finance invoice records`);

    // Check if all records have the expected fields
    const missingFields = [];
    records.forEach((rec, i) => {
        if (!rec.sales_order) missingFields.push(`Page ${i+1}: missing sales_order`);
        if (!rec.customer_code) missingFields.push(`Page ${i+1}: missing customer_code`);
        if (!rec.customer_name) missingFields.push(`Page ${i+1}: missing customer_name`);
        if (!rec.invoice_date) missingFields.push(`Page ${i+1}: missing invoice_date`);
        if (rec.total_due === null) missingFields.push(`Page ${i+1}: missing total_due`);
        if (!rec.currency) missingFields.push(`Page ${i+1}: missing currency`);
        if (rec.total_amount === null) missingFields.push(`Page ${i+1}: missing total_amount`);
    });

    if (missingFields.length > 0) {
        console.log('\n❌ Missing fields:');
        missingFields.forEach(msg => console.log(`  ${msg}`));
    } else {
        console.log('\n✅ All records have complete data!');
    }
}

main().catch(console.error);
