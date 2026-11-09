from __future__ import annotations

import io
import csv
import posixpath
import re
import unicodedata
import zipfile
from xml.etree import ElementTree


MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50000
HEADER_ALIASES = {
    "school": {"namasekolah", "satuanpendidikan", "namasatuanpendidikan", "sekolah"},
    "jenjang": {"jenjang", "jenjangpendidikan", "tingkat", "tingkatpendidikan", "level"},
    "tka_year": {"tahuntka", "tahunujian", "tahunasesmen", "tahunpelaksanaan", "tahun"},
    "status": {"status"},
    "district": {"kecamatan"},
    "participant_number": {"nomorpeserta", "nopeserta", "nomorujian", "noujian"},
    "nisn": {"nisn"},
    "name": {"namapeserta", "namapesertadidik", "namapesertaasesmen", "namasiswa", "nama"},
    "birth": {"tempattanggallahir", "ttl"},
    "math": {"nilaimatematika", "nilaitkamatematika", "skormatematika", "nilainumerasi", "skornumerasi", "numerasi", "matematika"},
    "bahasa": {"nilaibahasaindonesia", "nilaitkabahasaindonesia", "skorbahasaindonesia", "nilaibhsindonesia", "skorbhsindonesia", "bhsindonesia", "nilailiterasi", "skorliterasi", "literasi", "bahasaindonesia"},
}
REQUIRED_FIELDS = {"school", "name", "math", "bahasa"}


def _normalize_header(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(character for character in normalized.lower() if character.isalnum())


def _header_map(row: list[object]) -> dict[str, int] | None:
    mapped: dict[str, int] = {}
    for index, value in enumerate(row):
        normalized = _normalize_header(value)
        normalized_without_tka = normalized.replace("tka", "")
        for field, aliases in HEADER_ALIASES.items():
            matches = normalized in aliases or normalized_without_tka in aliases
            if field == "school":
                matches = matches or "namasekolah" in normalized or "satuanpendidikan" in normalized
            elif field == "name":
                matches = matches or "namapeserta" in normalized or "namasiswa" in normalized
            elif field == "math":
                matches = matches or ("matematika" in normalized and any(token in normalized for token in ("nilai", "skor", "score")))
            elif field == "bahasa":
                matches = matches or ("bahasaindonesia" in normalized and any(token in normalized for token in ("nilai", "skor", "score")))
            if matches:
                mapped[field] = index
                break
    return mapped if REQUIRED_FIELDS <= mapped.keys() else None


def _column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference.upper())
    if not letters:
        return 0
    index = 0
    for character in letters.group():
        index = index * 26 + ord(character) - ord("A") + 1
    return index - 1


def _read_xlsx_rows(content: bytes) -> list[list[str]]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise ValueError("File Excel tidak valid atau rusak.") from exc
    with archive:
        if sum(item.file_size for item in archive.infolist()) > 25 * 1024 * 1024:
            raise ValueError("Isi workbook Excel melebihi batas ukuran yang diizinkan.")
        try:
            workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
            relations = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            sheets = workbook.findall("{*}sheets/{*}sheet")
            if not sheets:
                raise ValueError("Workbook Excel tidak memiliki sheet.")
            shared_strings: list[str] = []
            if "xl/sharedStrings.xml" in archive.namelist():
                shared_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
                shared_strings = ["".join(text.text or "" for text in item.findall(".//{*}t")) for item in shared_root]
            sheet_rows = []
            for sheet in sheets:
                relation_id = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                relationship = next(item for item in relations if item.attrib.get("Id") == relation_id)
                target = relationship.attrib["Target"]
                worksheet_path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
                worksheet = ElementTree.fromstring(archive.read(worksheet_path))
                rows = []
                for row in worksheet.findall("{*}sheetData/{*}row"):
                    values: list[str] = []
                    for cell in row.findall("{*}c"):
                        index = _column_index(cell.attrib.get("r", "A1"))
                        while len(values) <= index:
                            values.append("")
                        cell_type = cell.attrib.get("t")
                        value = cell.findtext("{*}v", default="")
                        if cell_type == "s" and value:
                            try:
                                value = shared_strings[int(value)]
                            except (IndexError, ValueError):
                                raise ValueError("Workbook Excel memiliki referensi teks yang tidak valid.")
                        elif cell_type == "inlineStr":
                            value = "".join(text.text or "" for text in cell.findall(".//{*}t"))
                        values[index] = value
                    rows.append(values)
                sheet_rows.append(rows)
        except (KeyError, StopIteration, ElementTree.ParseError) as exc:
            raise ValueError("Struktur workbook Excel tidak dapat dibaca.") from exc
        return next((rows for rows in sheet_rows if any(_header_map(row) for row in rows)), sheet_rows[0])


def _read_pdf_rows(content: bytes) -> list[list[str]]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise ValueError("Impor PDF memerlukan dependensi pdfplumber. Jalankan pip install -r requirements.txt.") from exc
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            if len(pdf.pages) > 100:
                raise ValueError("PDF melebihi batas 100 halaman.")
            rows = []
            for page in pdf.pages:
                for table in page.extract_tables() or []:
                    rows.extend([[cell or "" for cell in row] for row in table])
            return rows
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("PDF tidak dapat dibaca. Pastikan PDF berisi teks dan tabel, bukan hasil scan gambar.") from exc


def _read_csv_rows(content: bytes) -> list[list[str]]:
    try:
        text = content.decode("utf-8-sig")
        sample = text[:4096]
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        return list(csv.reader(io.StringIO(text, newline=""), dialect))
    except (UnicodeDecodeError, csv.Error) as exc:
        raise ValueError("CSV harus berupa UTF-8 dengan pemisah koma, titik koma, atau tab.") from exc


def _parse_rows(rows: list[list[object]]) -> list[dict[str, object]]:
    header_index = next((index for index, row in enumerate(rows) if _header_map(row)), None)
    if header_index is None:
        raise ValueError("Header tabel tidak dikenali. Pastikan ada kolom Nama Sekolah, Nama Peserta, Nilai Matematika, dan Nilai Bahasa Indonesia.")
    columns = _header_map(rows[header_index])
    parsed: list[dict[str, object]] = []
    for row_number, row in enumerate(rows[header_index + 1 :], start=header_index + 2):
        repeated_header = _header_map(row)
        if repeated_header:
            columns = repeated_header
            continue
        if not any(str(value or "").strip() for value in row):
            continue
        record: dict[str, object] = {field: str(row[index] or "").strip() if index < len(row) else "" for field, index in columns.items()}
        if not record.get("school") and not record.get("name"):
            continue
        for field in REQUIRED_FIELDS:
            if not record.get(field):
                raise ValueError(f"Baris {row_number}: kolom wajib {field} kosong.")
        for field in ("math", "bahasa"):
            try:
                score = float(str(record[field]).replace(",", "."))
            except ValueError as exc:
                raise ValueError(f"Baris {row_number}: nilai {field} harus berupa angka 0–100.") from exc
            if not 0 <= score <= 100:
                raise ValueError(f"Baris {row_number}: nilai {field} harus berada antara 0–100.")
            record[field] = score
        record.setdefault("status", "Belum Terverifikasi")
        record.setdefault("district", "")
        record.setdefault("participant_number", "")
        record.setdefault("nisn", "")
        record.setdefault("birth", "")
        record["jenjang"] = str(record.get("jenjang") or "SMP").strip() or "SMP"
        if len(record["jenjang"]) > 40:
            raise ValueError(f"Baris {row_number}: jenjang maksimal 40 karakter.")
        raw_year = str(record.get("tka_year") or "").strip()
        if raw_year:
            try:
                numeric_year = float(raw_year)
            except ValueError as exc:
                raise ValueError(f"Baris {row_number}: Tahun TKA harus berupa angka tahun.") from exc
            if not numeric_year.is_integer() or not 2000 <= numeric_year <= 2100:
                raise ValueError(f"Baris {row_number}: Tahun TKA harus antara 2000 dan 2100.")
            record["tka_year"] = int(numeric_year)
        else:
            record["tka_year"] = None
        parsed.append(record)
        if len(parsed) > MAX_ROWS:
            raise ValueError(f"Jumlah data melebihi batas {MAX_ROWS} peserta.")
    if not parsed:
        raise ValueError("Tidak ada baris hasil TKA yang dapat diimpor.")
    return parsed


def parse_tka_file(filename: str, content: bytes) -> list[dict[str, object]]:
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Ukuran berkas harus lebih dari 0 dan maksimal 5 MB.")
    suffix = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if suffix == "xlsx":
        rows = _read_xlsx_rows(content)
    elif suffix == "pdf":
        rows = _read_pdf_rows(content)
    elif suffix == "csv":
        rows = _read_csv_rows(content)
    else:
        raise ValueError("Format berkas harus berupa .xlsx, .csv, atau PDF.")
    return _parse_rows(rows)