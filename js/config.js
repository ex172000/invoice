// Configuration constants and regex patterns

export const CONFIG = {
    // Amount tolerance for comparison (from check_invoices.py)
    AMOUNT_TOLERANCE: 0.5,

    // Invoice code pattern (from rename_watcher.py)
    INVOICE_CODE_PATTERN: /\b(OM\.\d{4}_\d+|PTR\.\d{4}_\d+)\b/i,

    // Date patterns (more flexible for PDF.js extraction)
    DATE_PATTERNS: [
        /\bDate\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
        /\bData\s*:?\s*(\d{4}-\d{2}-\d{2})/i,
        /\b(20\d{2}-\d{2}-\d{2})\b/,
        /\bDate\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i,
    ],

    // Order number patterns
    ORDER_PATTERNS: [
        /Order\/Quote\s*[:#]?\s*([A-Za-z0-9_.-]+)/i,
        /Order\s*[/#:]\s*([A-Za-z0-9_.-]+)/i,
        /Sales\s*Order\s*[:#]?\s*([A-Za-z0-9_.-]+)/i,
        /\b(\d{6,8})\b/, // Fallback: 6-8 digit number
    ],

    // Customer name patterns
    CUSTOMER_PATTERNS: {
        // Formal address patterns
        FORMAL_ADDRESS: [
            /Exmo.*Sr/i,
            /Dear\s+Sir/i,
            /Dear\s+Madam/i,
        ],
        // Company suffix patterns
        COMPANY_SUFFIXES: /\b(LLC|UAB|LDA|LDA\.|S\.A|S\.A\.|Ltda|SIA)\b/i,
        // Exclude patterns (lines that should not be considered customer names)
        EXCLUDE_PATTERNS: [
            /@/,
            /https?:\/\//,
            /\b(Tax ID|Capital Social|Contribuinte|Rua|Lisboa|Lisbon|Morada|Payment|Date)\b/i,
            /\d{6,}/, // Long number sequences
        ],
    },

    // Finance invoice patterns
    FINANCE_INVOICE: {
        // Invoice date pattern
        INVOICE_DATE: /InvoiceDate:\s*(\d{2}\.\d{2}\.\d{4})/i,
        // Due date pattern
        DUE_DATE: /PaymentDueDate:\s*(\d{2}\.\d{2}\.\d{4})/i,
        // Sales order pattern
        SALES_ORDER: /SalesOrder:\s*(\d+)/i,
        // Customer code pattern
        CUSTOMER_CODE: /Account#:\s*(\d+)/i,
        // Bill To pattern
        BILL_TO: /BillTo:/i,
        // Total due patterns
        TOTAL_DUE: [
            /TotalDue:\s*([€$])?\s*([0-9,]+\.[0-9]{2})\s*(USD|EUR)/i,
            /TotalDue:\s*([€$])?\s*([0-9,]+\.[0-9]{2})/i,
        ],
        // Prepayment pattern
        PREPAYMENT: /Prepayment:\s*([€$])?\s*([0-9,]+\.[0-9]{2})/i,
    },

    // Tax invoice patterns
    TAX_INVOICE: {
        // Tax invoice number (Fatura)
        TAX_NUMBER: /Fatura\s+(FT\s+[A-Z]+\.\d{4}\/\d+)/i,
        // Order/Quote line
        ORDER_QUOTE: /Order\s*\/\s*Quote/i,
        // Date headers
        DATE_HEADER: /Date\s*Due\s*Date|Data\s*Vencimento/i,
        // Date extraction
        DATES: /\d{4}-\d{2}-\d{2}/g,
        // Total amount
        TOTAL: /Total\s*\(\s*(USD|EUR)\s*\)\s*([0-9.,]+)/gi,
        // Data line (order, currency)
        DATA_LINE: /(\d{5,})\s*(USD|EUR)/i,
    },

    // File naming
    FILENAME: {
        // Extract name from existing filename pattern
        NAME_FROM_FILENAME: /^\d{2}\.\d{2}_(.+)_\d+_/,
        // Characters to remove from filename parts
        UNSAFE_CHARS: /[^A-Za-z0-9._ -]+/g,
    },

    // Finance invoice filename pattern (case-insensitive)
    FINANCE_INVOICE_FILENAME: /^finance\s*invoice\.pdf$/i,
};

// Date format strings (for parsing)
export const DATE_FORMATS = {
    DD_MM_YYYY: '%d.%m.%Y',
    YYYY_MM_DD: '%Y-%m-%d',
};

// CSV column headers (must match the order in check_invoices.py)
export const CSV_HEADERS = [
    'sales_order_number',
    'customer_code',
    'customer_name',
    'invoice_date',
    'invoice_amount',
    'currency',
    'finance_invoice_amount',
    'finance_invoice_currency',
    'amount_difference',
    'tax_invoice_number',
    'check_status',
    'mismatch_fields',
    'source_file',
    'mismatch_reason',
];

// Check status values
export const CHECK_STATUS = {
    OK: 'OK',
    MISMATCH: 'MISMATCH',
    NOT_FOUND: 'NOT_FOUND',
    FINANCE_ONLY: 'FINANCE_ONLY',
};

// Mismatch field names
export const MISMATCH_FIELDS = {
    SALES_ORDER: 'sales_order',
    CUSTOMER_NAME: 'customer_name',
    CUSTOMER_CODE: 'customer_code',
    INVOICE_DATE: 'invoice_date',
    DUE_DATE: 'due_date',
    CURRENCY: 'currency',
    TOTAL_AMOUNT: 'total_amount',
    TAX_INVOICE_MISSING: 'tax_invoice_missing',
};

// PDF.js configuration
export const PDF_CONFIG = {
    workerSrc: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};
