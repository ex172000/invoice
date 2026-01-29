// Main application controller

import { initializeDropZone, validateFiles, identifyFinanceInvoice, createFilePreview, triggerDownload } from './modules/fileHandler.js';
import { extractTextBatch } from './modules/pdfExtractor.js';
import { batchRenameInvoices } from './modules/invoiceRenamer.js';
import { crossCheckInvoices } from './modules/invoiceChecker.js';
import { generateCSVBlob } from './modules/csvGenerator.js';
import { createZipArchive } from './modules/zipGenerator.js';
import { CHECK_STATUS } from './config.js';

// Application state
const state = {
    files: [],
    financeInvoice: null,
    taxInvoices: [],
    extractedData: [],
    renameResults: [],
    checkResults: [],
    csvBlob: null,
    zipBlob: null,
};

// DOM elements
let dropZone, fileInput, fileList, fileItems, fileCount;
let clearAllBtn, processSection, processBtn;
let progressSection, resultsSection, errorSection;
let downloadBtn, resetBtn, retryBtn, aboutLink, aboutModal;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initializeDOM();
    initializeEventListeners();
});

function initializeDOM() {
    // File upload elements
    dropZone = document.getElementById('dropZone');
    fileInput = document.getElementById('fileInput');
    fileList = document.getElementById('fileList');
    fileItems = document.getElementById('fileItems');
    fileCount = document.getElementById('fileCount');
    clearAllBtn = document.getElementById('clearAllBtn');

    // Process elements
    processSection = document.getElementById('processSection');
    processBtn = document.getElementById('processBtn');

    // Progress elements
    progressSection = document.getElementById('progressSection');

    // Results elements
    resultsSection = document.getElementById('resultsSection');
    downloadBtn = document.getElementById('downloadBtn');
    resetBtn = document.getElementById('resetBtn');

    // Error elements
    errorSection = document.getElementById('errorSection');
    retryBtn = document.getElementById('retryBtn');

    // Modal
    aboutLink = document.getElementById('aboutLink');
    aboutModal = document.getElementById('aboutModal');
}

function initializeEventListeners() {
    // File upload
    initializeDropZone(dropZone, fileInput, handleFilesAdded);

    // Clear all button
    clearAllBtn.addEventListener('click', clearAllFiles);

    // Process button
    processBtn.addEventListener('click', processInvoices);

    // Download button
    downloadBtn.addEventListener('click', downloadResults);

    // Reset button
    resetBtn.addEventListener('click', resetApplication);

    // Retry button
    retryBtn.addEventListener('click', () => {
        hideError();
        showSection('upload');
    });

    // About modal
    aboutLink.addEventListener('click', (e) => {
        e.preventDefault();
        aboutModal.classList.remove('hidden');
    });

    const modalClose = aboutModal.querySelector('.modal-close');
    modalClose.addEventListener('click', () => {
        aboutModal.classList.add('hidden');
    });

    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            aboutModal.classList.add('hidden');
        }
    });
}

function handleFilesAdded(files) {
    // Validate files
    const { valid, invalid } = validateFiles(files);

    if (invalid.length > 0) {
        const reasons = invalid.map(i => `${i.file.name}: ${i.reason}`).join('\n');
        alert(`Some files were rejected:\n\n${reasons}`);
    }

    if (valid.length === 0) return;

    // Add valid files to state
    state.files = [...state.files, ...valid];

    // Identify Finance invoice and tax invoices
    updateFileIdentification();

    // Update UI
    updateFileList();
}

function updateFileIdentification() {
    const { financeInvoice, taxInvoices } = identifyFinanceInvoice(state.files);
    state.financeInvoice = financeInvoice;
    state.taxInvoices = taxInvoices;
}

function updateFileList() {
    // Clear existing list
    fileItems.innerHTML = '';

    if (state.files.length === 0) {
        fileList.classList.add('hidden');
        processSection.classList.add('hidden');
        return;
    }

    // Show file list
    fileList.classList.remove('hidden');
    fileCount.textContent = state.files.length;

    // Create file previews
    for (const file of state.files) {
        const isFinance = file === state.financeInvoice;
        const preview = createFilePreview(file, isFinance, removeFile);
        fileItems.appendChild(preview);
    }

    // Show process button if we have files
    if (state.files.length > 0) {
        processSection.classList.remove('hidden');

        // Warn if no Finance invoice
        if (!state.financeInvoice && state.taxInvoices.length > 0) {
            processBtn.title = 'Warning: No Finance invoice detected. Cross-checking will be skipped.';
        } else {
            processBtn.title = '';
        }
    }
}

function removeFile(file) {
    state.files = state.files.filter(f => f !== file);
    updateFileIdentification();
    updateFileList();
}

function clearAllFiles() {
    state.files = [];
    state.financeInvoice = null;
    state.taxInvoices = [];
    updateFileList();
}

function showSection(section) {
    // Hide all sections
    fileList.classList.add('hidden');
    processSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    errorSection.classList.add('hidden');

    // Show requested section
    switch (section) {
        case 'upload':
            if (state.files.length > 0) {
                fileList.classList.remove('hidden');
                processSection.classList.remove('hidden');
            }
            break;
        case 'progress':
            progressSection.classList.remove('hidden');
            break;
        case 'results':
            resultsSection.classList.remove('hidden');
            break;
        case 'error':
            errorSection.classList.remove('hidden');
            break;
    }
}

function updateProgress(stepId, status, counter = '') {
    const step = document.getElementById(stepId);
    if (!step) return;

    // Remove all status classes
    step.classList.remove('pending', 'processing', 'completed', 'error');

    // Add new status
    step.classList.add(status);

    // Update icon
    const icon = step.querySelector('.step-icon');
    switch (status) {
        case 'pending':
            icon.textContent = '⏳';
            break;
        case 'processing':
            icon.textContent = '⟳';
            break;
        case 'completed':
            icon.textContent = '✓';
            break;
        case 'error':
            icon.textContent = '✗';
            break;
    }

    // Update counter
    const counterEl = step.querySelector('.step-counter');
    counterEl.textContent = counter;
}

async function processInvoices() {
    try {
        // Disable process button
        processBtn.disabled = true;

        // Show progress section
        showSection('progress');

        // Reset progress steps
        for (let i = 1; i <= 5; i++) {
            updateProgress(`step${i}`, 'pending');
        }

        // Step 1: Extract text from PDFs
        updateProgress('step1', 'processing');

        const allFiles = state.financeInvoice
            ? [state.financeInvoice, ...state.taxInvoices]
            : state.taxInvoices;

        state.extractedData = await extractTextBatch(allFiles, (current, total, filename) => {
            updateProgress('step1', 'processing', `(${current}/${total})`);
        });

        // Check for extraction errors
        const extractErrors = state.extractedData.filter(r => !r.success);
        if (extractErrors.length > 0) {
            throw new Error(`Failed to extract text from ${extractErrors.length} file(s)`);
        }

        updateProgress('step1', 'completed', `(${state.extractedData.length})`);

        // Step 2: Rename invoices
        updateProgress('step2', 'processing');

        const taxExtracted = state.extractedData.filter(r => r.file !== state.financeInvoice);

        state.renameResults = await batchRenameInvoices(taxExtracted, (current, total, filename) => {
            updateProgress('step2', 'processing', `(${current}/${total})`);
        });

        const renameSuccesses = state.renameResults.filter(r => r.success).length;
        updateProgress('step2', 'completed', `(${renameSuccesses}/${state.renameResults.length})`);

        // Step 3: Cross-check with Finance invoice
        updateProgress('step3', 'processing');

        if (state.financeInvoice) {
            const financeData = state.extractedData.find(r => r.file === state.financeInvoice);

            // Prepare tax invoice data with renamed files
            const taxInvoicesData = state.renameResults.map(result => ({
                file: result.originalFile,
                text: taxExtracted.find(e => e.file === result.originalFile).text,
                renamedFile: result.renamedFile || result.originalFile,
            }));

            state.checkResults = crossCheckInvoices(taxInvoicesData, financeData.pages);

            updateProgress('step3', 'completed', `(${state.checkResults.length})`);
        } else {
            // No Finance invoice, skip cross-checking
            updateProgress('step3', 'completed', '(skipped)');
            state.checkResults = [];
        }

        // Step 4: Generate CSV report
        updateProgress('step4', 'processing');

        state.csvBlob = generateCSVBlob(state.checkResults);

        updateProgress('step4', 'completed');

        // Step 5: Create ZIP archive
        updateProgress('step5', 'processing');

        const renamedFiles = state.renameResults
            .filter(r => r.renamedFile)
            .map(r => r.renamedFile);

        state.zipBlob = await createZipArchive(renamedFiles, state.csvBlob, (current, total, message) => {
            updateProgress('step5', 'processing', `(${current}/${total})`);
        });

        updateProgress('step5', 'completed');

        // Show results
        showResults();

    } catch (error) {
        console.error('Error processing invoices:', error);
        showError(error.message);
    } finally {
        processBtn.disabled = false;
    }
}

function showResults() {
    // Filter out FINANCE_ONLY records (user only cares about their uploaded tax invoices)
    const taxInvoiceResults = state.checkResults.filter(r => r.check_status !== CHECK_STATUS.FINANCE_ONLY);

    // Calculate statistics
    const stats = {
        renamed: state.renameResults.filter(r => r.success).length,
        ok: taxInvoiceResults.filter(r => r.check_status === CHECK_STATUS.OK).length,
        mismatch: taxInvoiceResults.filter(r => r.check_status === CHECK_STATUS.MISMATCH).length,
        notFound: taxInvoiceResults.filter(r => r.check_status === CHECK_STATUS.NOT_FOUND).length,
        errors: state.renameResults.filter(r => !r.success).length,
    };

    // Update stats display
    document.getElementById('statRenamed').textContent = stats.renamed;
    document.getElementById('statOK').textContent = stats.ok;
    document.getElementById('statMismatch').textContent = stats.mismatch;
    document.getElementById('statNotFound').textContent = stats.notFound;
    document.getElementById('statErrors').textContent = stats.errors;

    // Show error details if any
    const errorDetails = document.getElementById('errorDetails');
    if (stats.errors > 0) {
        errorDetails.classList.remove('hidden');

        const errorList = document.createElement('ul');
        for (const result of state.renameResults) {
            if (!result.success) {
                const li = document.createElement('li');
                li.textContent = `${result.originalFile.name}: ${result.errors.map(e => e.message).join(', ')}`;
                errorList.appendChild(li);
            }
        }

        errorDetails.innerHTML = '<h4>Errors:</h4>';
        errorDetails.appendChild(errorList);
    } else {
        errorDetails.classList.add('hidden');
    }

    // Show results section
    showSection('results');
}

function downloadResults() {
    if (state.zipBlob) {
        triggerDownload(state.zipBlob, 'invoice_results.zip');
    }
}

function resetApplication() {
    // Clear state
    state.files = [];
    state.financeInvoice = null;
    state.taxInvoices = [];
    state.extractedData = [];
    state.renameResults = [];
    state.checkResults = [];
    state.csvBlob = null;
    state.zipBlob = null;

    // Reset UI
    updateFileList();
    showSection('upload');

    // Reset progress
    for (let i = 1; i <= 5; i++) {
        updateProgress(`step${i}`, 'pending', '');
    }
}

function showError(message) {
    const errorText = document.getElementById('errorText');
    errorText.textContent = message;
    showSection('error');
}

function hideError() {
    errorSection.classList.add('hidden');
}
