// File upload and download handling

import { isFinanceInvoice, formatFileSize, sanitizeText } from './utils.js';

/**
 * Initialize drop zone for file uploads
 * @param {HTMLElement} dropZone - Drop zone element
 * @param {HTMLInputElement} fileInput - File input element
 * @param {Function} onFilesAdded - Callback when files are added
 */
export function initializeDropZone(dropZone, fileInput, onFilesAdded) {
    // Click to browse
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            onFilesAdded(files);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    });

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            onFilesAdded(files);
        }
    });
}

/**
 * Validate uploaded files
 * @param {File[]} files - Array of files to validate
 * @returns {{valid: File[], invalid: Array}} Validation result
 */
export function validateFiles(files) {
    const valid = [];
    const invalid = [];

    for (const file of files) {
        // Check if PDF
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            invalid.push({
                file,
                reason: 'Not a PDF file',
            });
            continue;
        }

        // Check file size (max 20MB)
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) {
            invalid.push({
                file,
                reason: 'File too large (max 20MB)',
            });
            continue;
        }

        valid.push(file);
    }

    return { valid, invalid };
}

/**
 * Identify Finance invoice from file list
 * @param {File[]} files - Array of files
 * @returns {{financeInvoice: File|null, taxInvoices: File[]}}
 */
export function identifyFinanceInvoice(files) {
    let financeInvoice = null;
    const taxInvoices = [];

    for (const file of files) {
        if (isFinanceInvoice(file.name)) {
            financeInvoice = file;
        } else {
            taxInvoices.push(file);
        }
    }

    return { financeInvoice, taxInvoices };
}

/**
 * Create file preview element
 * @param {File} file - File to create preview for
 * @param {boolean} isFinance - Whether this is the Finance invoice
 * @param {Function} onRemove - Callback when remove button clicked
 * @returns {HTMLElement} File item element
 */
export function createFilePreview(file, isFinance, onRemove) {
    const item = document.createElement('div');
    item.className = 'file-item' + (isFinance ? ' finance-invoice' : '');

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';

    // File icon (SVG)
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'file-icon');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('stroke', 'currentColor');
    icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />';

    // File details
    const details = document.createElement('div');
    details.className = 'file-details';

    const nameLine = document.createElement('div');
    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    nameLine.appendChild(fileName);

    if (isFinance) {
        const badge = document.createElement('span');
        badge.className = 'file-badge finance';
        badge.textContent = 'Finance';
        nameLine.appendChild(badge);
    }

    const sizeLine = document.createElement('div');
    sizeLine.className = 'file-size';
    sizeLine.textContent = formatFileSize(file.size);

    details.appendChild(nameLine);
    details.appendChild(sizeLine);

    fileInfo.appendChild(icon);
    fileInfo.appendChild(details);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        onRemove(file);
    };

    item.appendChild(fileInfo);
    item.appendChild(removeBtn);

    return item;
}

/**
 * Trigger file download in browser
 * @param {Blob} blob - File blob to download
 * @param {string} filename - Download filename
 */
export function triggerDownload(blob, filename) {
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
 * Create a new File object with a different name
 * @param {File} originalFile - Original file
 * @param {string} newName - New filename
 * @returns {File} New File object with updated name
 */
export function renameFile(originalFile, newName) {
    return new File([originalFile], newName, {
        type: originalFile.type,
        lastModified: originalFile.lastModified,
    });
}

/**
 * Read file as ArrayBuffer
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error(`Failed to read file: ${e.target.error}`));
        reader.readAsArrayBuffer(file);
    });
}
