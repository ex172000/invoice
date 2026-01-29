// PDF text extraction wrapper using PDF.js

import { PDF_CONFIG } from '../config.js';

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_CONFIG.workerSrc;
}

/**
 * Reconstruct text from PDF.js text items
 * Uses PDF's internal text order (like pypdf) instead of visual position
 */
function reconstructTextWithLines(items) {
    if (!items || items.length === 0) return '';

    // Use PDF's internal text order directly (like pypdf does)
    // Only add line breaks when Y position changes significantly
    const lines = [];
    let currentLine = '';
    let lastY = null;
    const lineHeightTolerance = 5; // Tolerance for same line

    for (const item of items) {
        if (!item.str) continue;

        const y = item.transform[5];
        const text = item.str;

        // Check if we're on a new line (Y position changed)
        if (lastY !== null && Math.abs(y - lastY) > lineHeightTolerance) {
            // New line - save current and start fresh
            if (currentLine.trim()) {
                lines.push(currentLine.trim());
            }
            currentLine = text;
        } else {
            // Same line - add space if needed
            if (currentLine && !currentLine.endsWith(' ') && !text.startsWith(' ')) {
                currentLine += ' ';
            }
            currentLine += text;
        }

        lastY = y;
    }

    // Add last line
    if (currentLine.trim()) {
        lines.push(currentLine.trim());
    }

    return lines.join('\n');
}

/**
 * Extract text from a PDF file
 * @param {File} file - PDF file object
 * @returns {Promise<{filename: string, text: string, pages: string[]}>}
 */
export async function extractText(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const pages = [];
        let fullText = '';

        // Extract text from all pages
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Reconstruct text with proper line breaks based on Y positions
            const pageText = reconstructTextWithLines(textContent.items);

            pages.push(pageText);
            fullText += pageText + '\n';
        }

        return {
            filename: file.name,
            text: normalizeText(fullText),
            pages: pages.map(p => normalizeText(p)),
        };
    } catch (error) {
        console.error(`Error extracting text from ${file.name}:`, error);
        throw new Error(`Failed to extract text from ${file.name}: ${error.message}`);
    }
}

/**
 * Extract text from all pages separately (useful for Finance invoice)
 * @param {File} file - PDF file object
 * @returns {Promise<string[]>} Array of page texts
 */
export async function extractPages(file) {
    const result = await extractText(file);
    return result.pages;
}

/**
 * Normalize text extracted from PDF
 * Handles whitespace and line breaks
 */
export function normalizeText(text) {
    if (!text) return '';

    // Normalize line breaks
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove excessive whitespace but preserve line structure
    normalized = normalized.replace(/[ \t]+/g, ' ');

    // Remove leading/trailing whitespace from each line
    normalized = normalized.split('\n').map(line => line.trim()).join('\n');

    // Remove multiple consecutive blank lines
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    return normalized.trim();
}

/**
 * Convert text to lines array
 */
export function textToLines(text) {
    if (!text) return [];
    return text.split('\n').filter(line => line.trim().length > 0);
}

/**
 * Extract text with progress callback
 * @param {File} file - PDF file object
 * @param {Function} onProgress - Callback with (current, total)
 * @returns {Promise<{filename: string, text: string, pages: string[]}>}
 */
export async function extractTextWithProgress(file, onProgress) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const pages = [];
        let fullText = '';
        const totalPages = pdf.numPages;

        // Extract text from all pages with progress
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Reconstruct text with proper line breaks
            const pageText = reconstructTextWithLines(textContent.items);

            pages.push(pageText);
            fullText += pageText + '\n';

            if (onProgress) {
                onProgress(pageNum, totalPages);
            }
        }

        return {
            filename: file.name,
            text: normalizeText(fullText),
            pages: pages.map(p => normalizeText(p)),
        };
    } catch (error) {
        console.error(`Error extracting text from ${file.name}:`, error);
        throw new Error(`Failed to extract text from ${file.name}: ${error.message}`);
    }
}

/**
 * Batch extract text from multiple files
 * @param {File[]} files - Array of PDF files
 * @param {Function} onFileProgress - Callback with (fileIndex, totalFiles, fileName)
 * @returns {Promise<Array>} Array of extraction results
 */
export async function extractTextBatch(files, onFileProgress) {
    const results = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (onFileProgress) {
            onFileProgress(i + 1, files.length, file.name);
        }

        try {
            const result = await extractText(file);
            results.push({
                success: true,
                file: file,
                ...result,
            });
        } catch (error) {
            results.push({
                success: false,
                file: file,
                filename: file.name,
                error: error.message,
            });
        }
    }

    return results;
}
