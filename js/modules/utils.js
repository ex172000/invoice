// Utility functions ported from Python

/**
 * Normalize sales order number (from check_invoices.py)
 * Removes non-digits and strips leading zeros
 */
export function normalizeSalesOrder(val) {
    if (!val) return '';
    const digits = val.toString().replace(/\D/g, '');
    const stripped = digits.replace(/^0+/, '');
    return stripped || digits;
}

/**
 * Normalize customer name (from check_invoices.py)
 * Removes non-alphanumeric characters and converts to lowercase
 */
export function normalizeName(val) {
    if (!val) return '';
    return val.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

/**
 * Parse amount from string (from check_invoices.py)
 * Handles various formats: €1,500.00, $1500.00, 1.500,00, etc.
 */
export function parseAmount(val) {
    if (val === null || val === undefined) return null;

    let s = val.toString().trim();
    // Remove currency symbols
    s = s.replace(/[€$]/g, '').replace(/\s/g, '');
    // Remove other non-numeric chars except . and ,
    s = s.replace(/[^0-9,.]/g, '');

    if (!s) return null;

    // Handle mixed . and , (determine which is decimal separator)
    if (s.includes('.') && s.includes(',')) {
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');

        if (lastDot > lastComma) {
            // Dot is decimal separator, comma is thousands
            s = s.replace(/,/g, '');
        } else {
            // Comma is decimal separator, dot is thousands
            s = s.replace(/\./g, '').replace(',', '.');
        }
    } else if (s.includes(',') && !s.includes('.')) {
        // Only comma, assume it's decimal separator
        s = s.replace(',', '.');
    }

    try {
        return parseFloat(s);
    } catch (e) {
        return null;
    }
}

/**
 * Parse date in multiple formats (from check_invoices.py)
 * Supports: dd.mm.yyyy and yyyy-mm-dd
 * Returns: yyyy-mm-dd format
 */
export function parseDateAny(val) {
    if (!val) return '';

    const str = val.toString().trim();

    // Try dd.mm.yyyy format
    const ddmmyyyyMatch = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        return `${year}-${month}-${day}`;
    }

    // Try yyyy-mm-dd format
    const yyyymmddMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmddMatch) {
        return str; // Already in correct format
    }

    return '';
}

/**
 * Format date from yyyy-mm-dd to dd.mm (from rename_watcher.py)
 */
export function formatDate(rawDate) {
    if (!rawDate) return null;

    try {
        const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;

        const [, , month, day] = match;
        return `${day}.${month}`;
    } catch (e) {
        return null;
    }
}

/**
 * Extract customer name from existing filename (from check_invoices.py)
 * Pattern: dd.mm_CustomerName_OrderNumber_Code.pdf
 */
export function nameFromFilename(filename) {
    const stem = filename.replace(/\.pdf$/i, '');
    const match = stem.match(/^\d{2}\.\d{2}_(.+)_\d+_/);

    if (!match) return '';

    const name = match[1].replace(/_/g, ' ');
    return name.trim();
}

/**
 * Sanitize filename part (from rename_watcher.py)
 * Removes unsafe characters and normalizes spaces
 */
export function safePart(part) {
    if (!part) return '';

    let cleaned = part.toString().trim();
    // Remove unsafe characters
    cleaned = cleaned.replace(/[^A-Za-z0-9._ -]+/g, ' ');
    // Normalize multiple spaces to single space
    cleaned = cleaned.replace(/\s+/g, ' ');
    // Replace spaces with underscores
    return cleaned.replace(/ /g, '_');
}

/**
 * Check if line looks like a customer name (from rename_watcher.py)
 */
export function looksLikeName(line) {
    if (!line) return false;

    // Exclude if contains email or URL
    if (/@/.test(line) || /https?:\/\//.test(line)) {
        return false;
    }

    // Exclude if contains certain keywords
    if (/\b(Tax ID|Capital Social|Contribuinte|Rua|Lisboa|Lisbon|Morada|Payment|Date)\b/i.test(line)) {
        return false;
    }

    // Exclude if contains long number sequences
    if (/\d{6,}/.test(line)) {
        return false;
    }

    // Must contain at least one letter
    return /[A-Za-z]/.test(line);
}

/**
 * Format amount to 2 decimal places
 */
export function formatAmount(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return '';
    }
    return amount.toFixed(2);
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if filename matches Finance invoice pattern
 */
export function isFinanceInvoice(filename) {
    return /^finance\s*invoice\.pdf$/i.test(filename);
}

/**
 * Sanitize text for display (prevent XSS)
 */
export function sanitizeText(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Deep clone an object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for specified milliseconds (for delays if needed)
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
