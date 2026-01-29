import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');

// Same extraction functions...
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

function parseAmount(val) {
    if (val === null || val === undefined) return null;
    let s = val.toString().trim();
    s = s.replace(/[€$]/g, '').replace(/\s/g, '');
    s = s.replace(/[^0-9,.]/g, '');
    if (!s) return null;

    if (s.includes('.') && s.includes(',')) {
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        if (lastDot > lastComma) {
            s = s.replace(/,/g, '');
        } else {
            s = s.replace(/\./g, '').replace(',', '.');
        }
    } else if (s.includes(',') && !s.includes('.')) {
        s = s.replace(',', '.');
    }

    try {
        return parseFloat(s);
    } catch (e) {
        return null;
    }
}

function parseDateAny(val) {
    if (!val) return '';
    const str = val.toString().trim();
    const ddmmyyyyMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        return `${year}-${month}-${day}`;
    }
    const yyyymmddMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmddMatch) {
        return str;
    }
    return '';
}

function parseFinancePage(pageText) {
    console.log('=== parseFinancePage called ===');
    console.log('Text contains "Invoice Date":', pageText.includes('Invoice Date'));
    console.log('Text contains "InvoiceDate":', pageText.includes('InvoiceDate'));

    // Update check to handle both formats (with and without space)
    if (!pageText.includes('Invoice Date') && !pageText.includes('InvoiceDate')) {
        console.log('❌ No invoice date marker found, returning null');
        return null;
    }
    console.log('✅ Invoice date marker found');

    const result = {};

    function extract(pattern, label) {
        const match = pageText.match(pattern);
        console.log(`Extracting ${label}: pattern=${pattern}, match=${match ? match[1] : 'null'}`);
        return match ? match[1] : '';
    }

    // Update patterns to handle spaces
    const invoiceDate = extract(/Invoice\s*Date:\s*(\d{2}\.\d{2}\.\d{4})/i, 'invoice date');
    result.invoice_date = parseDateAny(invoiceDate);
    console.log('  → invoice_date:', result.invoice_date);

    const dueDate = extract(/Payment\s*Due\s*Date:\s*(\d{2}\.\d{2}\.\d{4})/i, 'due date');
    result.due_date = parseDateAny(dueDate);
    console.log('  → due_date:', result.due_date);

    result.sales_order = extract(/Sales\s*Order:\s*(\d+)/i, 'sales order');
    console.log('  → sales_order:', result.sales_order);

    result.customer_code = extract(/Account#:\s*(\d+)/i, 'customer code');
    console.log('  → customer_code:', result.customer_code);

    // Extract customer name from BillTo
    result.customer_name = '';
    const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
    console.log(`DEBUG test: Total lines = ${lines.length}`);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Bill To:')) {  // Changed from startsWith('BillTo:')
            console.log(`DEBUG test: Found 'Bill To:' at line ${i}: "${lines[i]}"`);
            if (i + 1 < lines.length) {
                const nameLine = lines[i + 1].trim();
                console.log(`DEBUG test: Next line (${i+1}): "${nameLine}"`);
                if (nameLine) {
                    const words = nameLine.split(/\s+/);
                    if (words.length >= 2) {
                        const mid = Math.floor(words.length / 2);
                        const firstHalf = words.slice(0, mid);
                        const secondHalf = words.slice(mid);
                        if (firstHalf.join(' ') === secondHalf.join(' ')) {
                            result.customer_name = firstHalf.join(' ');
                        } else {
                            result.customer_name = words[0];
                        }
                    } else {
                        result.customer_name = nameLine;
                    }
                    console.log(`DEBUG test: Extracted customer_name = "${result.customer_name}"`);
                }
            }
            break;
        }
    }

    result.total_due = null;
    result.currency = '';

    let match = pageText.match(/Total\s*Due:\s*([€$])?\s*([0-9,]+\.[0-9]{2})\s*(USD|EUR)/i);
    if (match) {
        result.total_due = parseAmount(match[2]);
        result.currency = match[3];
    } else {
        match = pageText.match(/Total\s*Due:\s*([€$])?\s*([0-9,]+\.[0-9]{2})/i);
        if (match) {
            result.total_due = parseAmount(match[2]);
            const symbol = match[1];
            result.currency = symbol === '€' ? 'EUR' : (symbol === '$' ? 'USD' : '');
        }
    }

    result.prepayment = null;
    match = pageText.match(/Prepayment:\s*([€$])?\s*([0-9,]+\.[0-9]{2})/i);
    if (match) {
        result.prepayment = parseAmount(match[2]);
    }

    result.total_amount = null;
    if (result.total_due !== null) {
        result.total_amount = result.total_due + (result.prepayment || 0.0);
    }

    return result;
}

async function extractText(filepath) {
    const data = new Uint8Array(fs.readFileSync(filepath));
    const pdf = await getDocument({ data }).promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = reconstructTextWithLines(textContent.items);
        pages.push(normalizeText(pageText));
    }

    return pages;
}

async function main() {
    console.log('=== Testing Finance Invoice Parsing ===\n');
    
    const pages = await extractText('test_data/Finance invoice.pdf');
    console.log(`Total pages: ${pages.length}\n`);

    const records = [];
    for (let i = 0; i < pages.length; i++) {
        const rec = parseFinancePage(pages[i]);
        if (rec) {
            records.push(rec);
            console.log(`Page ${i+1} - SO: ${rec.sales_order}, Customer: ${rec.customer_name} (${rec.customer_code}), Amount: ${rec.total_amount} ${rec.currency}`);
        }
    }

    console.log(`\n✅ Parsed ${records.length} finance invoice records`);
}

main().catch(console.error);
