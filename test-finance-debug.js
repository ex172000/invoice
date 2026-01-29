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

function textToLines(text) {
    if (!text) return [];
    return text.split('\n').map(line => line.trim()).filter(line => line);
}

async function main() {
    const data = new Uint8Array(fs.readFileSync('test_data/Finance invoice.pdf'));
    const pdf = await getDocument({ data }).promise;

    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const pageText = reconstructTextWithLines(textContent.items);

    console.log('=== DEBUG: textToLines() output ===');
    const lines = textToLines(pageText);

    console.log(`Total lines: ${lines.length}\n`);

    // Show lines around BillTo section
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Bill')) {
            console.log(`\n=== Lines around index ${i} (contains "Bill") ===`);
            if (i > 0) console.log(`[${i-1}]: "${lines[i-1]}"`);
            console.log(`[${i}]:   "${lines[i]}" <-- THIS LINE`);
            if (i + 1 < lines.length) console.log(`[${i+1}]: "${lines[i+1]}"`);
            if (i + 2 < lines.length) console.log(`[${i+2}]: "${lines[i+2]}"`);

            // Test the condition
            console.log(`\nCondition test:`);
            console.log(`  lines[${i}].includes('Bill To:') = ${lines[i].includes('Bill To:')}`);
            console.log(`  lines[${i}].startsWith('BillTo:') = ${lines[i].startsWith('BillTo:')}`);
            console.log(`  lines[${i}].startsWith('Bill To:') = ${lines[i].startsWith('Bill To:')}`);
        }
    }
}

main().catch(console.error);
