// CSV generation from comparison results

import { CSV_HEADERS } from '../config.js';

/**
 * Escape CSV field value
 * Handles quotes, commas, and newlines
 */
export function escapeCSVField(field) {
    if (field === null || field === undefined) {
        return '';
    }

    const str = field.toString();

    // Check if escaping is needed
    const needsEscape = str.includes(',') || str.includes('"') || str.includes('\n');

    if (needsEscape) {
        // Escape double quotes by doubling them
        const escaped = str.replace(/"/g, '""');
        return `"${escaped}"`;
    }

    return str;
}

/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data - Array of result objects
 * @param {Array<string>} headers - Column headers (optional, uses CSV_HEADERS by default)
 * @returns {string} CSV string
 */
export function arrayToCSV(data, headers = CSV_HEADERS) {
    if (!data || data.length === 0) {
        // Return just headers if no data
        return headers.join(',') + '\n';
    }

    const rows = [];

    // Add header row
    rows.push(headers.map(escapeCSVField).join(','));

    // Add data rows
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header];
            return escapeCSVField(value);
        });
        rows.push(values.join(','));
    }

    return rows.join('\n');
}

/**
 * Generate CSV Blob from results
 * @param {Array<Object>} results - Array of comparison results
 * @returns {Blob} CSV file as Blob
 */
export function generateCSVBlob(results) {
    const csvString = arrayToCSV(results);

    // Create Blob with UTF-8 BOM for Excel compatibility
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], {
        type: 'text/csv;charset=utf-8;',
    });

    return blob;
}

/**
 * Generate CSV file and trigger download
 * @param {Array<Object>} results - Array of comparison results
 * @param {string} filename - CSV filename (default: invoice_check_results.csv)
 */
export function downloadCSV(results, filename = 'invoice_check_results.csv') {
    const blob = generateCSVBlob(results);

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Parse CSV string to array of objects
 * (Utility function for testing/debugging)
 */
export function parseCSV(csvString) {
    const lines = csvString.trim().split('\n');
    if (lines.length === 0) return [];

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};

        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j] || '';
        }

        data.push(row);
    }

    return data;
}
