// ZIP archive generation using JSZip

/**
 * Create ZIP archive with renamed PDFs and CSV report
 * @param {Array<File>} renamedFiles - Array of renamed PDF files
 * @param {Blob} csvBlob - CSV report blob
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Blob>} ZIP file as Blob
 */
export async function createZipArchive(renamedFiles, csvBlob, onProgress) {
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip library not loaded');
    }

    const zip = new JSZip();

    // Add CSV report
    zip.file('invoice_check_results.csv', csvBlob);

    if (onProgress) {
        onProgress(0, renamedFiles.length + 1, 'Adding CSV report');
    }

    // Add renamed PDF files
    for (let i = 0; i < renamedFiles.length; i++) {
        const file = renamedFiles[i];

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Add to ZIP
        zip.file(file.name, arrayBuffer);

        if (onProgress) {
            onProgress(i + 1, renamedFiles.length + 1, `Adding ${file.name}`);
        }
    }

    // Generate ZIP blob
    if (onProgress) {
        onProgress(renamedFiles.length + 1, renamedFiles.length + 1, 'Generating ZIP file');
    }

    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 6, // Medium compression
        },
    });

    return zipBlob;
}

/**
 * Add files to existing ZIP instance
 * @param {JSZip} zip - JSZip instance
 * @param {Array<File>} files - Files to add
 * @param {string} folder - Optional folder path within ZIP
 */
export async function addFilesToZip(zip, files, folder = '') {
    for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const path = folder ? `${folder}/${file.name}` : file.name;
        zip.file(path, arrayBuffer);
    }
}

/**
 * Generate ZIP blob from JSZip instance
 * @param {JSZip} zip - JSZip instance
 * @param {Object} options - Generation options
 * @returns {Promise<Blob>} ZIP blob
 */
export async function generateZipBlob(zip, options = {}) {
    const defaultOptions = {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 6,
        },
    };

    const mergedOptions = { ...defaultOptions, ...options };

    return await zip.generateAsync(mergedOptions);
}

/**
 * Create ZIP with progress tracking
 * @param {Array<File>} renamedFiles - Renamed PDF files
 * @param {Blob} csvBlob - CSV report
 * @returns {Promise<Blob>} ZIP blob
 */
export async function createZipWithProgress(renamedFiles, csvBlob) {
    const zip = new JSZip();

    // Add CSV
    zip.file('invoice_check_results.csv', csvBlob);

    // Add PDFs
    for (const file of renamedFiles) {
        const arrayBuffer = await file.arrayBuffer();
        zip.file(file.name, arrayBuffer);
    }

    // Generate with progress
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 6,
        },
    }, (metadata) => {
        // Progress callback from JSZip
        console.log(`ZIP Progress: ${metadata.percent.toFixed(2)}%`);
    });

    return zipBlob;
}
