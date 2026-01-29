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
    const data = new Uint8Array(fs.readFileSync('/Users/qichao/invoice/test_data/Fatura FT PTR.2026_1 Original.pdf'));
    const pdf = await getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const text = reconstructTextWithLines(textContent.items);
    const lines = text.split('\n');

    console.log('Lines 15-30:');
    for (let i = 15; i < 30 && i < lines.length; i++) {
        console.log(`${i}: ${lines[i]}`);
    }
}

main().catch(console.error);
