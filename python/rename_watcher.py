import argparse
import re
import time
from datetime import datetime
from pathlib import Path

from pypdf import PdfReader
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

WATCH_DIR = Path(r".")


def extract_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def find_date(text: str, lines: list[str]) -> str | None:
    patterns = [r"\bDate\s+(\d{4}-\d{2}-\d{2})", r"\bData\s+(\d{4}-\d{2}-\d{2})"]
    for pat in patterns:
        if m := re.search(pat, text, re.IGNORECASE):
            return m.group(1)
    if m := re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text):
        return m.group(1)
    return None


def format_date(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d").strftime("%d.%m")
    except Exception:
        return None


def looks_like_name(line: str) -> bool:
    if not line:
        return False
    if re.search(r"@|https?://", line):
        return False
    if re.search(r"\b(Tax ID|Capital Social|Contribuinte|Rua|Lisboa|Lisbon|Morada|Payment|Date)\b", line, re.IGNORECASE):
        return False
    if re.search(r"\d{6,}", line):
        return False
    return bool(re.search(r"[A-Za-z]", line))


def find_customer(lines: list[str]) -> str | None:
    for i, line in enumerate(lines):
        if re.search(r"Exmo.*Sr", line, re.IGNORECASE):
            candidates = []
            if i > 0:
                candidates.append(lines[i - 1])
            if i + 1 < len(lines):
                candidates.append(lines[i + 1])
            for cand in candidates:
                if looks_like_name(cand):
                    return cand
    last_dear = None
    for i, line in enumerate(lines):
        if "Dear Sir" in line or "Dear Madam" in line:
            if i > 0 and looks_like_name(lines[i - 1]):
                last_dear = lines[i - 1]
    if last_dear:
        return last_dear
    for line in lines:
        if len(line) <= 60 and not re.search(r"\d{5,}", line):
            if re.search(r"\b(LLC|UAB|LDA|LDA\.|S\.A|S\.A\.|Ltda|SIA)\b", line, re.IGNORECASE):
                return line
    return None


def find_order(text: str) -> str | None:
    patterns = [r"Order/Quote\s+([A-Za-z0-9_.-]+)", r"Order\s*[:#]?\s*([A-Za-z0-9_.-]+)"]
    raw = None
    for pat in patterns:
        if m := re.search(pat, text, re.IGNORECASE):
            raw = m.group(1)
            break
    if not raw:
        digits = re.findall(r"\b(\d{6,})\b", text)
        raw = digits[0] if digits else None
    # Normalize to the main numeric sequence, trim to 8 digits when longer.
    if raw:
        digit_chunks = re.findall(r"\d+", raw)
        if digit_chunks:
            best = max(digit_chunks, key=len)
            return best[:8] if len(best) > 8 else best
    return raw


def parse_invoice_code(path: Path) -> str | None:
    if m := re.search(r"(OM\.\d{4}_\d+|PTR\.\d{4}_\d+)", path.name, re.IGNORECASE):
        return m.group(1)
    return None


def safe_part(part: str | None) -> str:
    cleaned = (part or "").strip()
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", " ", cleaned)
    cleaned = " ".join(cleaned.split())
    return cleaned.replace(" ", "_")


def build_new_name(code: str, date_ddmm: str, customer: str, order_no: str, suffix: str) -> str:
    return f"{safe_part(date_ddmm)}_{safe_part(customer)}_{safe_part(order_no)}_{code}{suffix}"


def process_file(pdf_path: Path) -> bool:
    code = parse_invoice_code(pdf_path)
    if not code:
        print(f"[skip] No invoice code found in {pdf_path.name}")
        return False
    try:
        text = extract_text(pdf_path)
    except Exception as exc:
        print(f"[error] Failed to read {pdf_path.name}: {exc}")
        return False
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    raw_date = find_date(text, lines)
    date_ddmm = format_date(raw_date)
    customer = find_customer(lines)
    order_no = find_order(text)
    if not all([date_ddmm, customer, order_no]):
        print(f"[warn] Missing pieces for {pdf_path.name}: date={date_ddmm} raw={raw_date}, customer={customer}, order={order_no}")
        return False
    new_name = build_new_name(code, date_ddmm, customer, order_no, pdf_path.suffix)
    target = pdf_path.with_name(new_name)
    if target == pdf_path:
        print(f"[skip] Already named correctly: {pdf_path.name}")
        return True
    if target.exists():
        print(f"[warn] Target exists, skipping: {target.name}")
        return False
    for attempt in range(5):
        try:
            pdf_path.rename(target)
            print(f"[ok] {pdf_path.name} -> {target.name}")
            return True
        except PermissionError as exc:
            if attempt < 4:
                time.sleep(0.5)
                continue
            print(f"[error] Rename failed for {pdf_path.name}: {exc}")
            return False
        except Exception as exc:
            print(f"[error] Rename failed for {pdf_path.name}: {exc}")
            return False


class Handler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory or not event.src_path.lower().endswith(".pdf"):
            return
        path = Path(event.src_path)
        for _ in range(30):
            try:
                path.stat()
                break
            except OSError:
                time.sleep(0.2)
        process_file(path)


def process_existing(directory: Path):
    for pdf in directory.glob("*.pdf"):
        process_file(pdf)


def main():
    parser = argparse.ArgumentParser(description="Auto-rename invoices in E:\\rename.")
    parser.add_argument("--watch", action="store_true", help="Watch folder for new PDFs.")
    parser.add_argument("--once", action="store_true", help="Process existing PDFs once and exit.")
    args = parser.parse_args()

    process_existing(WATCH_DIR)
    if args.watch and not args.once:
        observer = Observer()
        observer.schedule(Handler(), str(WATCH_DIR), recursive=False)
        observer.start()
        print(f"Watching {WATCH_DIR} for new PDFs...")
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            observer.stop()
        observer.join()


if __name__ == "__main__":
    main()
