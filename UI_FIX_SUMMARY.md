# UI Statistics Display Fix

## Problem
When uploading 1 tax invoice + Finance invoice (21 pages), the UI was showing 18 results instead of 1.

## Root Cause
The `crossCheckInvoices` function generates records for:
1. Each tax invoice uploaded (with status: OK, MISMATCH, or NOT_FOUND)
2. Each Finance invoice record that doesn't have a matching tax invoice (status: FINANCE_ONLY)

For example, uploading:
- 1 tax invoice
- 1 Finance invoice with 21 pages

Generated:
- 1 result for the tax invoice (status: OK)
- 20 FINANCE_ONLY results for unmatched Finance records
- **Total: 21 results**

The UI was counting all 21 results, when users only care about their 1 uploaded tax invoice.

## Solution
Filter out FINANCE_ONLY records when calculating statistics in the UI.

### Changes Made

**1. `/Users/qichao/Desktop/invoice/js/app.js` (lines 337-354)**
```javascript
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
```

**2. `/Users/qichao/Desktop/invoice/index.html` (lines 94-97)**
Added "Not Found" stat to display tax invoices without matching Finance records:
```html
<div class="stat-item stat-warning">
    <span class="stat-label">Not Found:</span>
    <span id="statNotFound" class="stat-value">0</span>
</div>
```

## Result

### Before Fix
Uploading 1 tax invoice showed:
- **Total results: 18-21** (included FINANCE_ONLY records)
- Confusing for users who uploaded only 1 invoice

### After Fix
Uploading 1 tax invoice shows:
- **Renamed: 1** (if renaming succeeded)
- **OK: 1** (if it matched Finance record)
- **MISMATCH: 0** (none)
- **Not Found: 0** (it was found)
- **Errors: 0** (no errors)

Or if no match:
- **Renamed: 1**
- **OK: 0**
- **MISMATCH: 0**
- **Not Found: 1** (no matching Finance record)
- **Errors: 0**

## CSV Output
The CSV file **still contains all records** (including FINANCE_ONLY), providing a complete audit trail. Only the UI display statistics exclude FINANCE_ONLY records for clarity.

## Test Scenario
1. Upload 1 tax invoice: `Fatura FT OM.2026_1 Original.pdf`
2. Upload Finance invoice with 21 pages
3. Process invoices
4. **Expected UI stats:**
   - Renamed: 1
   - OK: 1
   - MISMATCH: 0
   - Not Found: 0
   - Errors: 0
5. **CSV will contain:** 21 rows (1 for tax invoice + 20 FINANCE_ONLY records)
