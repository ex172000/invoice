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

async function main() {
    const data = new Uint8Array(fs.readFileSync('test_data/Finance invoice.pdf'));
    const pdf = await getDocument({ data }).promise;

    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = reconstructTextWithLines(textContent.items);

    console.log('=== Searching for BillTo section ===');
    const lines = pageText.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('Bill') || line.includes('To:')) {
            console.log(`Line ${i}: "${line}"`);
            if (i > 0) console.log(`  Previous: "${lines[i-1]}"`);
            if (i + 1 < lines.length) console.log(`  Next: "${lines[i+1]}"`);
            if (i + 2 < lines.length) console.log(`  Next+1: "${lines[i+2]}"`);
        }
    }

    console.log('\n=== Searching for TotalDue section ===');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('Total') || line.includes('Due')) {
            console.log(`Line ${i}: "${line}"`);
            if (i > 0) console.log(`  Previous: "${lines[i-1]}"`);
            if (i + 1 < lines.length) console.log(`  Next: "${lines[i+1]}"`);
        }
    }

    console.log('\n=== Searching for currency/amount patterns ===');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('EUR') || line.includes('USD') || /\d{1,3},\d{3}\.\d{2}/.test(line)) {
            console.log(`Line ${i}: "${line}"`);
        }
    }
}

main().catch(console.error);
