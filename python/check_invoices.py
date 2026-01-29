import re
import csv
from pathlib import Path
from datetime import datetime
import pdfplumber


def normalize_sales_order(val):
    if not val:
        return ""
    digits = re.sub(r"\D", "", val)
    return digits.lstrip("0") or digits


def normalize_name(val):
    if not val:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", val).lower()


def parse_amount(val):
    if val is None:
        return None
    s = val.strip()
    s = s.replace("€", "").replace("$", "").replace(" ", "")
    s = re.sub(r"[^0-9,\.]", "", s)
    if not s:
        return None
    if "." in s and "," in s:
        if s.rfind(".") > s.rfind(","):
            s = s.replace(",", "")
        else:
            s = s.replace(".", "")
            s = s.replace(",", ".")
    elif "," in s and "." not in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_date_any(val):
    if not val:
        return ""
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return ""


def name_from_filename(filename):
    stem = Path(filename).stem
    m = re.match(r"^\d{2}\.\d{2}_(.+)_\d+_", stem)
    if not m:
        return ""
    name = m.group(1).replace("_", " ")
    return name.strip()


def parse_finance_page(text):
    if "InvoiceDate:" not in text:
        return None

    def rx(pattern):
        m = re.search(pattern, text)
        return m.group(1) if m else ""

    invoice_date = rx(r"InvoiceDate:\s*(\d{2}\.\d{2}\.\d{4})")
    due_date = rx(r"PaymentDueDate:\s*(\d{2}\.\d{2}\.\d{4})")
    sales_order = rx(r"SalesOrder:\s*(\d+)")
    customer_code = rx(r"Account#:\s*(\d+)")

    customer_name = ""
    lines = [l.strip() for l in text.splitlines()]
    for i, line in enumerate(lines):
        if line.startswith("BillTo:"):
            if i + 1 < len(lines):
                name_line = lines[i + 1].strip()
                if name_line:
                    words = name_line.split()
                    if len(words) >= 2:
                        mid = len(words) // 2
                        if words[:mid] == words[mid:]:
                            customer_name = " ".join(words[:mid])
                        else:
                            customer_name = words[0]
                    else:
                        customer_name = name_line
            break

    total_due = None
    currency = ""
    m = re.search(r"TotalDue:\s*([€$])?\s*([0-9,]+\.[0-9]{2})\s*(USD|EUR)", text)
    if m:
        total_due = parse_amount(m.group(2))
        currency = m.group(3)
    else:
        m2 = re.search(r"TotalDue:\s*([€$])?\s*([0-9,]+\.[0-9]{2})", text)
        if m2:
            total_due = parse_amount(m2.group(2))
            currency = "EUR" if m2.group(1) == "€" else ("USD" if m2.group(1) == "$" else "")

    prepayment = None
    m = re.search(r"Prepayment:\s*([€$])?\s*([0-9,]+\.[0-9]{2})", text)
    if m:
        prepayment = parse_amount(m.group(2))

    total_amount = None
    if total_due is not None:
        total_amount = total_due + (prepayment or 0.0)

    return {
        "invoice_date": parse_date_any(invoice_date),
        "due_date": parse_date_any(due_date),
        "sales_order": sales_order,
        "customer_code": customer_code,
        "customer_name": customer_name,
        "currency": currency,
        "total_amount": total_amount,
        "total_due": total_due,
        "prepayment": prepayment,
    }


def parse_tax_invoice(text, filename):
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    tax_invoice_number = ""
    m = re.search(r"Fatura\s+(FT\s+[A-Z]+\.\d{4}/\d+)", text)
    if m:
        tax_invoice_number = m.group(1)

    customer_name = name_from_filename(filename) or ""

    data_line = ""
    for i, line in enumerate(lines):
        if "Order/Quote" in line:
            if i + 1 < len(lines):
                data_line = lines[i + 1]
            break
    currency = ""
    sales_order = ""
    customer_code = ""
    if data_line:
        m = re.search(r"(\d{5,})\s+(USD|EUR)$", data_line)
        if m:
            sales_order = m.group(1)
            currency = m.group(2)
        tokens = data_line.split()
        if len(tokens) >= 2:
            customer_code = tokens[1]

    invoice_date = ""
    due_date = ""
    for i, line in enumerate(lines):
        if line.startswith("Date Due Date") or line.startswith("Data Vencimento"):
            if i + 1 < len(lines):
                dates = re.findall(r"\d{4}-\d{2}-\d{2}", lines[i + 1])
                if len(dates) >= 2:
                    invoice_date, due_date = dates[0], dates[1]
            break

    total_amount = None
    totals = re.findall(r"Total\s*\(\s*(USD|EUR)\s*\)\s*([0-9.,]+)", text)
    if totals:
        if currency:
            for cur, amt in totals:
                if cur == currency:
                    total_amount = parse_amount(amt)
                    break
        if total_amount is None:
            total_amount = parse_amount(totals[0][1])
            if not currency:
                currency = totals[0][0]

    return {
        "tax_invoice_number": tax_invoice_number,
        "customer_name": customer_name,
        "customer_code": customer_code,
        "sales_order": sales_order,
        "invoice_date": invoice_date,
        "due_date": due_date,
        "currency": currency,
        "total_amount": total_amount,
    }


def load_finance_invoices(finance_pdf):
    records = []
    with pdfplumber.open(finance_pdf) as pdf:
        for p in pdf.pages:
            text = p.extract_text() or ""
            rec = parse_finance_page(text)
            if rec:
                records.append(rec)
    return records


def load_tax_invoices(folder):
    records = []
    for path in sorted(folder.glob("*.pdf")):
        if path.name.lower() == "finance invoice.pdf".lower():
            continue
        texts = []
        with pdfplumber.open(path) as pdf:
            for p in pdf.pages:
                texts.append(p.extract_text() or "")
        text = "\n".join(texts)
        rec = parse_tax_invoice(text, path.name)
        rec["file"] = path.name
        records.append(rec)
    return records


AMOUNT_TOLERANCE = 0.5


def compare_records(tax, fin):
    mismatches = []

    if normalize_sales_order(tax.get("sales_order")) != normalize_sales_order(fin.get("sales_order")):
        mismatches.append("sales_order")

    if normalize_name(tax.get("customer_name")) != normalize_name(fin.get("customer_name")):
        mismatches.append("customer_name")

    if normalize_sales_order(tax.get("customer_code")) != normalize_sales_order(fin.get("customer_code")):
        mismatches.append("customer_code")

    if parse_date_any(tax.get("invoice_date")) != parse_date_any(fin.get("invoice_date")):
        mismatches.append("invoice_date")

    if parse_date_any(tax.get("due_date")) != parse_date_any(fin.get("due_date")):
        mismatches.append("due_date")

    if tax.get("currency") and fin.get("currency") and tax.get("currency") != fin.get("currency"):
        mismatches.append("currency")

    tax_amt = tax.get("total_amount")
    fin_amt = fin.get("total_amount")
    if tax_amt is None or fin_amt is None:
        mismatches.append("total_amount")
    else:
        if abs(tax_amt - fin_amt) > AMOUNT_TOLERANCE:
            mismatches.append("total_amount")

    status = "OK" if not mismatches else "MISMATCH"
    return status, ",".join(mismatches)


folder = Path('.')
finance_pdf = folder / 'Finance invoice.pdf'
finance_records = load_finance_invoices(finance_pdf)
finance_by_so = {}
for rec in finance_records:
    key = normalize_sales_order(rec.get("sales_order"))
    if key:
        finance_by_so[key] = rec

results = []
seen_finance = set()
for tax in load_tax_invoices(folder):
    key = normalize_sales_order(tax.get("sales_order"))
    fin = finance_by_so.get(key)
    status = "NOT_FOUND"
    mismatches = ""
    if fin:
        status, mismatches = compare_records(tax, fin)
        seen_finance.add(key)
    fin_amount = fin.get("total_amount") if fin else None
    fin_currency = fin.get("currency") if fin else ""
    tax_amount = tax.get("total_amount")
    amount_diff = None
    if fin_amount is not None and tax_amount is not None:
        amount_diff = fin_amount - tax_amount
    results.append({
        "sales_order_number": tax.get("sales_order", ""),
        "customer_code": tax.get("customer_code", ""),
        "customer_name": tax.get("customer_name", ""),
        "invoice_date": tax.get("invoice_date", ""),
        "invoice_amount": ("{:.2f}".format(tax.get("total_amount")) if tax.get("total_amount") is not None else ""),
        "currency": tax.get("currency", ""),
        "finance_invoice_amount": ("{:.2f}".format(fin_amount) if fin_amount is not None else ""),
        "finance_invoice_currency": fin_currency,
        "amount_difference": ("{:.2f}".format(amount_diff) if amount_diff is not None else ""),
        "tax_invoice_number": tax.get("tax_invoice_number", ""),
        "check_status": status,
        "mismatch_fields": mismatches,
        "source_file": tax.get("file", ""),
    })

for key, fin in finance_by_so.items():
    if key in seen_finance:
        continue
    results.append({
        "sales_order_number": fin.get("sales_order", ""),
        "customer_code": fin.get("customer_code", ""),
        "customer_name": fin.get("customer_name", ""),
        "invoice_date": fin.get("invoice_date", ""),
        "invoice_amount": "",
        "currency": "",
        "finance_invoice_amount": ("{:.2f}".format(fin.get("total_amount")) if fin.get("total_amount") is not None else ""),
        "finance_invoice_currency": fin.get("currency", ""),
        "amount_difference": "",
        "tax_invoice_number": "",
        "check_status": "FINANCE_ONLY",
        "mismatch_fields": "tax_invoice_missing",
        "source_file": "",
    })

out_path = folder / 'invoice_check_results.csv'
try:
    with out_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()) if results else [])
        writer.writeheader()
        writer.writerows(results)
    print(f"Wrote {out_path}")
except PermissionError:
    alt_path = folder / 'invoice_check_results_v2.csv'
    with alt_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys()) if results else [])
        writer.writeheader()
        writer.writerows(results)
    print(f"Wrote {alt_path} (original file was locked)")
print(f"Records: {len(results)}")
