// Invoice renaming logic (ported from rename_watcher.py)

import { CONFIG } from '../config.js';
import { formatDate, safePart, looksLikeName } from './utils.js';
import { textToLines } from './pdfExtractor.js';
import { renameFile } from './fileHandler.js';

/**
 * Parse invoice code from filename
 * Looks for patterns: OM.xxxx_xx or PTR.xxxx_xx
 */
export function parseInvoiceCode(filename) {
    const match = filename.match(CONFIG.INVOICE_CODE_PATTERN);
    return match ? match[1] : null;
}

/**
 * Find date in PDF text
 * Exactly matches Python rename_watcher.py logic
 */
export function findDate(text, lines) {
    // Match Python patterns exactly
    // Note: In JavaScript, \s matches whitespace including newlines
    const patterns = [
        /\bDate\s+(\d{4}-\d{2}-\d{2})/i,
        /\bData\s+(\d{4}-\d{2}-\d{2})/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }

    // Fallback: look for any yyyy-mm-dd pattern
    const fallback = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    return fallback ? fallback[1] : null;
}

/**
 * Find customer name in PDF text
 * Exactly matches Python rename_watcher.py logic
 */
export function findCustomer(lines) {
    // Method 1: Look for "Exmo Sr" pattern
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (/Exmo.*Sr/i.test(line)) {
            // Check adjacent lines for customer name
            const candidates = [];

            if (i > 0) candidates.push(lines[i - 1]);
            if (i + 1 < lines.length) candidates.push(lines[i + 1]);

            for (const cand of candidates) {
                if (looksLikeName(cand)) {
                    return cand.trim();
                }
            }
        }
    }

    // Method 2: Look for "Dear Sir" or "Dear Madam"
    // Use substring check (not regex) to match Python code
    let lastDear = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Use includes() to match Python's "in" operator
        if (line.includes("Dear Sir") || line.includes("Dear Madam")) {
            if (i > 0 && looksLikeName(lines[i - 1])) {
                lastDear = lines[i - 1];
            }
        }
    }

    if (lastDear) return lastDear;

    // Method 3: Look for company suffixes (LLC, UAB, LDA, etc.)
    for (const line of lines) {
        if (line.length <= 60 && !/\d{5,}/.test(line)) {
            if (CONFIG.CUSTOMER_PATTERNS.COMPANY_SUFFIXES.test(line)) {
                return line.trim();
            }
        }
    }

    return null;
}

/**
 * Find order number in PDF text
 * Exactly matches Python rename_watcher.py logic
 */
export function findOrder(text) {
    // Match Python patterns exactly
    const patterns = [
        /Order\/Quote\s+([A-Za-z0-9_.-]+)/i,
        /Order\s*[:#]?\s*([A-Za-z0-9_.-]+)/i,
    ];

    let raw = null;
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            raw = match[1];
            break;
        }
    }

    // If not found, look for 6+ digit numbers (Python uses \b(\d{6,})\b)
    if (!raw) {
        const allDigits = text.match(/\b(\d{6,})\b/g);
        raw = allDigits ? allDigits[0] : null;
    }

    // Normalize: extract main numeric sequence, trim to 8 digits if longer
    // Exactly matches Python logic
    if (raw) {
        const digitChunks = raw.match(/\d+/g);
        if (digitChunks && digitChunks.length > 0) {
            // Get the longest digit sequence
            const best = digitChunks.reduce((a, b) => a.length >= b.length ? a : b);
            return best.length > 8 ? best.substring(0, 8) : best;
        }
    }

    return raw;
}

/**
 * Build new filename from metadata
 * Format: dd.mm_Customer_Order_Code.pdf
 */
export function buildNewName(code, dateDDMM, customer, orderNo, extension) {
    const parts = [
        safePart(dateDDMM),
        safePart(customer),
        safePart(orderNo),
        code, // Code is already in correct format
    ];

    return parts.join('_') + extension;
}

/**
 * Rename invoice based on extracted metadata
 * @param {File} file - Invoice PDF file
 * @param {string} pdfText - Extracted PDF text
 * @returns {Object} Renaming result
 */
export async function renameInvoice(file, pdfText) {
    const result = {
        originalFile: file,
        renamedFile: null,
        metadata: {},
        errors: [],
        success: false,
    };

    try {
        // Step 1: Parse invoice code from filename
        const code = parseInvoiceCode(file.name);
        if (!code) {
            result.errors.push({
                field: 'invoice_code',
                message: 'No invoice code found in filename (expected OM.xxxx_xx or PTR.xxxx_xx)',
            });
            return result;
        }
        result.metadata.code = code;

        // Convert text to lines for analysis
        const lines = textToLines(pdfText);

        // Step 2: Extract date
        const rawDate = findDate(pdfText, lines);
        const dateDDMM = formatDate(rawDate);

        if (!dateDDMM) {
            result.errors.push({
                field: 'date',
                message: `Date not found in PDF (raw: ${rawDate})`,
            });
        }
        result.metadata.rawDate = rawDate;
        result.metadata.date = dateDDMM;

        // Step 3: Extract customer name
        const customer = findCustomer(lines);
        if (!customer) {
            result.errors.push({
                field: 'customer',
                message: 'Customer name not found in PDF',
            });
        }
        result.metadata.customer = customer;

        // Step 4: Extract order number
        const orderNo = findOrder(pdfText);
        if (!orderNo) {
            result.errors.push({
                field: 'order',
                message: 'Order number not found in PDF',
            });
        }
        result.metadata.orderNo = orderNo;

        // Check if all required fields are present
        if (!dateDDMM || !customer || !orderNo) {
            result.success = false;
            return result;
        }

        // Step 5: Build new filename
        const extension = '.pdf';
        const newName = buildNewName(code, dateDDMM, customer, orderNo, extension);
        result.metadata.newName = newName;

        // Step 6: Create renamed file
        result.renamedFile = renameFile(file, newName);
        result.success = true;

    } catch (error) {
        result.errors.push({
            field: 'general',
            message: `Unexpected error: ${error.message}`,
        });
        result.success = false;
    }

    return result;
}

/**
 * Batch rename invoices
 * @param {Array} extractedData - Array of {file, text, pages}
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array>} Array of rename results
 */
export async function batchRenameInvoices(extractedData, onProgress) {
    const results = [];

    for (let i = 0; i < extractedData.length; i++) {
        const { file, text } = extractedData[i];

        if (onProgress) {
            onProgress(i + 1, extractedData.length, file.name);
        }

        const result = await renameInvoice(file, text);
        results.push(result);
    }

    return results;
}
