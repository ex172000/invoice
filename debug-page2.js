import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

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

async function checkPage2(filename) {
    console.log(`\n=== Checking Page 2: ${filename} ===\n`);

    const data = new Uint8Array(fs.readFileSync(filename));
    const pdf = await getDocument({ data }).promise;

    console.log(`Total pages: ${pdf.numPages}\n`);

    if (pdf.numPages >= 2) {
        const page = await pdf.getPage(2);
        const textContent = await page.getTextContent();
        const pageText = normalizeText(reconstructTextWithLines(textContent.items));

        const lines = pageText.split('\n');

        // Show lines with "Total"
        console.log('Lines with "Total":');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Total')) {
                console.log(`  ${i}: ${lines[i]}`);
            }
        }

        // Show all lines
        console.log('\nAll lines on page 2:');
        for (let i = 0; i < lines.length; i++) {
            console.log(`  ${i}: ${lines[i]}`);
        }
    } else {
        console.log('Only 1 page in PDF');
    }
}

checkPage2('/Users/qichao/invoice/test_data/Fatura FT OM.2026_5 Original.pdf').catch(console.error);
