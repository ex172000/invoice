# Invoice Processor

A pure client-side web application for processing invoice PDFs. Automatically renames invoices based on extracted metadata and cross-checks them against Finance invoices, generating a detailed CSV report.

## Features

- **Automatic Invoice Renaming**: Extracts date, customer name, and order number from PDFs to rename files in a standard format (`dd.mm_Customer_Order_Code.pdf`)
- **Cross-Checking**: Compares tax invoices against Finance invoice data to detect mismatches
- **CSV Report**: Generates a detailed comparison report with all findings
- **Privacy-First**: All processing happens entirely in your browser - no files are uploaded to any server
- **Easy to Use**: Simple drag-and-drop interface, no installation required

## Live Demo

Visit: [https://yourusername.github.io/invoice-processor/](https://yourusername.github.io/invoice-processor/)

Or run locally: Just open `index.html` in your browser!

## How to Use

### 1. Prepare Your Files

You need:
- Multiple tax invoice PDFs (with invoice codes like `OM.2024_01.pdf` or `PTR.2024_02.pdf`)
- One Finance invoice PDF (named `Finance invoice.pdf`)

### 2. Upload Files

- **Drag and drop** files into the upload area, or
- **Click** the upload area to browse and select files

The application will automatically detect which file is the Finance invoice based on its filename.

### 3. Process

Click the **"Process Invoices"** button. The application will:

1. Extract text from all PDFs
2. Rename tax invoices based on extracted metadata
3. Cross-check renamed invoices against Finance invoice data
4. Generate a CSV report with comparison results
5. Create a ZIP archive with renamed PDFs and the CSV report

### 4. Download Results

Click **"Download Results.zip"** to get:
- All renamed invoice PDFs
- `invoice_check_results.csv` - Detailed comparison report

## Invoice Renaming Logic

The application extracts the following metadata from each invoice PDF:

- **Invoice Code**: Extracted from filename (e.g., `OM.2024_01`, `PTR.2024_02`)
- **Date**: Searched in PDF text (format: `YYYY-MM-DD`)
- **Customer Name**: Identified by patterns like "Exmo Sr", "Dear Sir/Madam", or company suffixes (LLC, LDA, UAB, etc.)
- **Order Number**: 6-8 digit number found in "Order/Quote" field or elsewhere in the PDF

**New filename format**: `dd.mm_CustomerName_OrderNumber_Code.pdf`

Example: `15.01_Acme_Corp_12345678_OM.2024_01.pdf`

## Cross-Checking Logic

The application compares tax invoices with Finance invoice data by matching sales order numbers. It checks for mismatches in:

- Sales order number
- Customer name
- Customer code
- Invoice date
- Due date
- Currency
- Total amount (with tolerance of ±0.50)

**Status codes in CSV**:
- `OK`: All fields match
- `MISMATCH`: One or more fields don't match (details in `mismatch_fields` column)
- `NOT_FOUND`: Tax invoice has no matching Finance invoice record
- `FINANCE_ONLY`: Finance invoice record has no matching tax invoice

## CSV Report Columns

The generated CSV report contains:

| Column | Description |
|--------|-------------|
| `sales_order_number` | Sales order number |
| `customer_code` | Customer code |
| `customer_name` | Customer name |
| `invoice_date` | Invoice date (YYYY-MM-DD) |
| `invoice_amount` | Tax invoice amount |
| `currency` | Currency code (USD, EUR) |
| `finance_invoice_amount` | Finance invoice amount |
| `finance_invoice_currency` | Finance invoice currency |
| `amount_difference` | Difference (Finance - Tax) |
| `tax_invoice_number` | Tax invoice number (e.g., FT ABC.2024/123) |
| `check_status` | Status: OK, MISMATCH, NOT_FOUND, or FINANCE_ONLY |
| `mismatch_fields` | Comma-separated list of mismatched fields |
| `source_file` | Renamed invoice filename |

## Technical Details

### Technologies Used

- **PDF.js**: Mozilla's PDF text extraction library
- **JSZip**: ZIP file creation in the browser
- **Vanilla JavaScript**: Pure ES6 modules, no framework dependencies
- **Modern CSS**: Responsive design with CSS Grid and Flexbox

### Architecture

- **Client-Side Only**: All processing happens in your browser using JavaScript
- **No Backend**: No server required, works entirely offline after initial page load
- **Modular Design**: Clean separation of concerns with ES6 modules

### Browser Compatibility

Tested and works in:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires modern browser with ES6 module support, File API, and Web Workers.

## Deployment to GitHub Pages

### Quick Deploy

1. Create a new GitHub repository (e.g., `invoice-processor`)

2. Push all files to the repository:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/invoice-processor.git
git push -u origin main
```

3. Enable GitHub Pages:
   - Go to repository Settings → Pages
   - Source: Deploy from `main` branch
   - Folder: `/ (root)`
   - Click Save

4. Access your site at: `https://yourusername.github.io/invoice-processor/`

### Updates

To update the live site, simply push changes to the main branch:
```bash
git add .
git commit -m "Update feature X"
git push
```

GitHub Pages will automatically rebuild (takes 1-2 minutes).

## Local Development

### Running Locally

Simply open `index.html` in your browser. That's it!

Note: Due to browser CORS restrictions with ES6 modules, you may need to run a local server. Use one of these methods:

**Python 3:**
```bash
python -m http.server 8000
```

**Node.js (with http-server):**
```bash
npx http-server -p 8000
```

Then visit: `http://localhost:8000`

### Project Structure

```
invoice-processor/
├── index.html                      # Main application page
├── css/
│   ├── main.css                    # Main styles & layout
│   └── components.css              # Component-specific styles
├── js/
│   ├── app.js                      # Main application controller
│   ├── config.js                   # Configuration & regex patterns
│   └── modules/
│       ├── pdfExtractor.js         # PDF text extraction wrapper
│       ├── invoiceRenamer.js       # Invoice renaming logic
│       ├── invoiceChecker.js       # Cross-checking logic
│       ├── csvGenerator.js         # CSV report generation
│       ├── zipGenerator.js         # ZIP archive creation
│       ├── fileHandler.js          # File upload/download handling
│       └── utils.js                # Shared utility functions
└── README.md                       # This file
```

### Dependencies

All dependencies are loaded from CDN (no npm install needed):
- PDF.js: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/
- JSZip: https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/

## Privacy & Security

### Privacy

- **Zero Server Upload**: All files are processed locally in your browser
- **No Tracking**: No analytics, cookies, or third-party scripts
- **No Data Storage**: Files are not stored anywhere, only processed in memory

### Security

- **Client-Side Only**: No server-side code, no backend vulnerabilities
- **File Validation**: Only PDF files accepted, with size limits (max 20MB per file)
- **Sanitization**: Filenames and data are sanitized to prevent XSS

## Troubleshooting

### Files Not Processing

- **Check file format**: Only PDF files are supported
- **Check file size**: Max 20MB per file
- **Check invoice code**: Filename must contain `OM.xxxx_xx` or `PTR.xxxx_xx`
- **Check PDF structure**: Ensure PDFs are text-based (not scanned images)

### Renaming Failed

Common reasons:
- **Date not found**: PDF doesn't contain date in expected format (YYYY-MM-DD)
- **Customer not found**: PDF doesn't match customer name patterns
- **Order number not found**: PDF doesn't contain 6-8 digit order number

Check browser console (F12) for detailed error messages.

### Finance Invoice Not Detected

- Ensure the Finance invoice file is named exactly: `Finance invoice.pdf` (case-insensitive)
- Or rename it to match this pattern before uploading

## Contributing

This is an open-source project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - feel free to use this project for any purpose.

## Credits

Built with:
- [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla
- [JSZip](https://stuk.github.io/jszip/) by Stuart Knightley

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the browser console for error messages

---

**Made with ❤️ for invoice processing automation**
# invoice
