// Invoice cross-checking logic (ported from check_invoices.py)

import { CONFIG, CHECK_STATUS, MISMATCH_FIELDS } from '../config.js';
import {
    normalizeSalesOrder,
    normalizeName,
    parseAmount,
    parseDateAny,
    nameFromFilename,
    formatAmount,
} from './utils.js';
import { textToLines } from './pdfExtractor.js';

/**
 * Parse a single Finance invoice page
 * @param {string} pageText - Text from one page of Finance invoice
 * @returns {Object|null} Parsed finance record or null if not a valid invoice page
 */
export function parseFinancePage(pageText) {
    // Check if this page contains invoice data
    // PDF.js extracts "Invoice Date" with space, pypdf extracts "InvoiceDate" without space
    if (!pageText.includes('Invoice Date') && !pageText.includes('InvoiceDate')) {
        return null;
    }

    const result = {};

    // Helper function to extract using regex
    function extract(pattern) {
        const match = pageText.match(pattern);
        return match ? match[1] : '';
    }

    // Extract invoice date (handle both "InvoiceDate:" and "Invoice Date:")
    let invoiceDate = extract(/Invoice\s*Date:\s*(\d{2}\.\d{2}\.\d{4})/i);
    result.invoice_date = parseDateAny(invoiceDate);

    // Extract due date (handle both formats)
    let dueDate = extract(/Payment\s*Due\s*Date:\s*(\d{2}\.\d{2}\.\d{4})/i);
    result.due_date = parseDateAny(dueDate);

    // Extract sales order (handle both "SalesOrder:" and "Sales Order:")
    result.sales_order = extract(/Sales\s*Order:\s*(\d+)/i);

    // Extract customer code (handle both formats)
    result.customer_code = extract(/Account#:\s*(\d+)/i);

    // Extract customer name from BillTo section
    result.customer_name = '';
    const lines = textToLines(pageText);

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Bill To:')) {
            if (i + 1 < lines.length) {
                const nameLine = lines[i + 1].trim();
                if (nameLine) {
                    const words = nameLine.split(/\s+/);
                    if (words.length >= 2) {
                        const mid = Math.floor(words.length / 2);
                        const firstHalf = words.slice(0, mid);
                        const secondHalf = words.slice(mid);

                        // Check if duplicated (e.g., "Acme Corp Acme Corp")
                        if (firstHalf.join(' ') === secondHalf.join(' ')) {
                            result.customer_name = firstHalf.join(' ');
                        } else {
                            result.customer_name = words[0];
                        }
                    } else {
                        result.customer_name = nameLine;
                    }
                }
            }
            break;
        }
    }

    // Extract total due and currency
    result.total_due = null;
    result.currency = '';

    // Try flexible patterns for Total Due (handle spaces)
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

    // Extract prepayment (handle spaces)
    result.prepayment = null;
    match = pageText.match(/Prepayment:\s*([€$])?\s*([0-9,]+\.[0-9]{2})/i);
    if (match) {
        result.prepayment = parseAmount(match[2]);
    }

    // Calculate total amount
    result.total_amount = null;
    if (result.total_due !== null) {
        result.total_amount = result.total_due + (result.prepayment || 0.0);
    }

    return result;
}

/**
 * Parse Finance invoice PDF (multi-page)
 * @param {Array<string>} pages - Array of page texts
 * @returns {Array<Object>} Array of finance invoice records
 */
export function parseFinanceInvoice(pages) {
    const records = [];

    for (const pageText of pages) {
        const record = parseFinancePage(pageText);
        if (record) {
            records.push(record);
        }
    }

    return records;
}

/**
 * Parse tax invoice PDF
 * @param {string} text - Full PDF text
 * @param {string} filename - Original filename
 * @returns {Object} Tax invoice record
 */
export function parseTaxInvoice(text, filename) {
    const result = {
        tax_invoice_number: '',
        customer_name: '',
        customer_code: '',
        sales_order: '',
        invoice_date: '',
        due_date: '',
        currency: '',
        total_amount: null,
        file: filename,
    };

    const lines = textToLines(text);

    // Extract tax invoice number (Fatura)
    const taxNumMatch = text.match(CONFIG.TAX_INVOICE.TAX_NUMBER);
    if (taxNumMatch) {
        result.tax_invoice_number = taxNumMatch[1];
    }

    // Extract customer name from filename
    result.customer_name = nameFromFilename(filename) || '';

    // Find data line (after "Order/Quote")
    let dataLine = '';
    for (let i = 0; i < lines.length; i++) {
        if (CONFIG.TAX_INVOICE.ORDER_QUOTE.test(lines[i])) {
            if (i + 1 < lines.length) {
                dataLine = lines[i + 1];
            }
            break;
        }
    }

    // Extract sales order from data line (first 5+ digit number)
    if (dataLine) {
        const soMatch = dataLine.match(/(\d{5,})/);
        if (soMatch) {
            result.sales_order = soMatch[1];
        }
    }

    // Extract customer code (find "Customer" label, next line is code)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === 'Customer') {
            if (i + 1 < lines.length) {
                result.customer_code = lines[i + 1].trim();
            }
            break;
        }
    }

    // Extract invoice date (find "Date" or "Data" label, next line is date)
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === 'Date' || trimmed === 'Data') {
            if (i + 1 < lines.length) {
                const dateMatch = lines[i + 1].match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    result.invoice_date = dateMatch[0];
                }
            }
            break;
        }
    }

    // Extract due date (find line containing "Due Date" or "Vencimento", then find next date in following lines)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Due Date') || lines[i].includes('Vencimento')) {
            // Search next few lines for a date
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
                const dateMatch = lines[j].match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) {
                    result.due_date = dateMatch[0];
                    break;
                }
            }
            break;
        }
    }

    // Extract currency (find line with just "USD" or "EUR" before "Currency" or "Moeda" label)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Currency') || lines[i].includes('Moeda')) {
            // Check previous line for currency code
            if (i > 0) {
                const prevLine = lines[i - 1].trim();
                if (prevLine === 'USD' || prevLine === 'EUR') {
                    result.currency = prevLine;
                    break;
                }
            }
        }
    }

    // Extract total amount
    const totals = [];
    let match;
    const totalRegex = new RegExp(CONFIG.TAX_INVOICE.TOTAL.source, 'gi');
    while ((match = totalRegex.exec(text)) !== null) {
        totals.push({
            currency: match[1],
            amount: match[2],
        });
    }

    if (totals.length > 0) {
        // Prefer total matching the currency we found
        if (result.currency) {
            for (const total of totals) {
                if (total.currency === result.currency) {
                    result.total_amount = parseAmount(total.amount);
                    break;
                }
            }
        }

        // If still not found, use first total
        if (result.total_amount === null) {
            result.total_amount = parseAmount(totals[0].amount);
            if (!result.currency) {
                result.currency = totals[0].currency;
            }
        }
    }

    return result;
}

/**
 * Compare two records and detect mismatches
 * @param {Object} taxRecord - Tax invoice record
 * @param {Object} finRecord - Finance invoice record
 * @returns {{status: string, mismatches: string}} Comparison result
 */
export function compareRecords(taxRecord, finRecord) {
    const mismatches = [];

    // Compare customer code
    if (normalizeSalesOrder(taxRecord.customer_code) !== normalizeSalesOrder(finRecord.customer_code)) {
        mismatches.push(MISMATCH_FIELDS.CUSTOMER_CODE);
    }

    // Compare customer name (only if both are present)
    const taxName = normalizeName(taxRecord.customer_name);
    const finName = normalizeName(finRecord.customer_name);
    if (taxName && finName && taxName !== finName) {
        mismatches.push(MISMATCH_FIELDS.CUSTOMER_NAME);
    }

    // Compare invoice date
    if (parseDateAny(taxRecord.invoice_date) !== parseDateAny(finRecord.invoice_date)) {
        mismatches.push(MISMATCH_FIELDS.INVOICE_DATE);
    }

    // Compare currency
    if (taxRecord.currency && finRecord.currency && taxRecord.currency !== finRecord.currency) {
        mismatches.push(MISMATCH_FIELDS.CURRENCY);
    }

    // Compare total amount (with tolerance of 0.5)
    const taxAmt = taxRecord.total_amount;
    const finAmt = finRecord.total_amount;

    if (taxAmt === null || finAmt === null) {
        mismatches.push(MISMATCH_FIELDS.TOTAL_AMOUNT);
    } else {
        if (Math.abs(taxAmt - finAmt) > CONFIG.AMOUNT_TOLERANCE) {
            mismatches.push(MISMATCH_FIELDS.TOTAL_AMOUNT);
        }
    }

    const status = mismatches.length === 0 ? CHECK_STATUS.OK : CHECK_STATUS.MISMATCH;
    return {
        status,
        mismatches: mismatches.join(','),
    };
}

/**
 * Cross-check tax invoices against finance invoices
 * @param {Array} taxInvoices - Array of {file, text, renamedFile}
 * @param {Array<string>} financePages - Finance invoice page texts
 * @returns {Array<Object>} Array of comparison results (for CSV)
 */
export function crossCheckInvoices(taxInvoices, financePages) {
    // Parse finance invoice
    const financeRecords = parseFinanceInvoice(financePages);

    // Build index by sales order
    const financeBySO = {};
    for (const rec of financeRecords) {
        const key = normalizeSalesOrder(rec.sales_order);
        if (key) {
            financeBySO[key] = rec;
        }
    }

    const results = [];
    const seenFinance = new Set();

    // Process each tax invoice
    for (const taxInv of taxInvoices) {
        const { renamedFile, text } = taxInv;
        const filename = renamedFile ? renamedFile.name : taxInv.file.name;

        const taxRecord = parseTaxInvoice(text, filename);
        const key = normalizeSalesOrder(taxRecord.sales_order);

        const finRecord = financeBySO[key];
        let status = CHECK_STATUS.NOT_FOUND;
        let mismatches = '';

        if (finRecord) {
            const comparison = compareRecords(taxRecord, finRecord);
            status = comparison.status;
            mismatches = comparison.mismatches;
            seenFinance.add(key);
        }

        // Build result row for CSV
        const finAmount = finRecord ? finRecord.total_amount : null;
        const finCurrency = finRecord ? finRecord.currency : '';
        const taxAmount = taxRecord.total_amount;

        let amountDiff = null;
        if (finAmount !== null && taxAmount !== null) {
            amountDiff = finAmount - taxAmount;
        }

        results.push({
            sales_order_number: taxRecord.sales_order || '',
            customer_code: taxRecord.customer_code || '',
            customer_name: taxRecord.customer_name || '',
            invoice_date: taxRecord.invoice_date || '',
            invoice_amount: formatAmount(taxAmount),
            currency: taxRecord.currency || '',
            finance_invoice_amount: formatAmount(finAmount),
            finance_invoice_currency: finCurrency,
            amount_difference: formatAmount(amountDiff),
            tax_invoice_number: taxRecord.tax_invoice_number || '',
            check_status: status,
            mismatch_fields: mismatches,
            source_file: filename,
        });
    }

    // Add finance-only records (not matched with any tax invoice)
    for (const [key, finRecord] of Object.entries(financeBySO)) {
        if (seenFinance.has(key)) continue;

        results.push({
            sales_order_number: finRecord.sales_order || '',
            customer_code: finRecord.customer_code || '',
            customer_name: finRecord.customer_name || '',
            invoice_date: finRecord.invoice_date || '',
            invoice_amount: '',
            currency: '',
            finance_invoice_amount: formatAmount(finRecord.total_amount),
            finance_invoice_currency: finRecord.currency || '',
            amount_difference: '',
            tax_invoice_number: '',
            check_status: CHECK_STATUS.FINANCE_ONLY,
            mismatch_fields: MISMATCH_FIELDS.TAX_INVOICE_MISSING,
            source_file: '',
        });
    }

    return results;
}
