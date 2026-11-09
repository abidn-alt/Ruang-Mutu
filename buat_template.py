#!/usr/bin/env python3
"""Generate a dependency-free Excel template for Lombok Timur school data."""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

from server import DIMENSIONS, DISTRICTS, INDICATOR_ROWS, TKA_INDICATOR_ID


ASSESSMENT_YEARS = range(2026, 2031)

METRIC_COLUMNS = [
    ("npsn", "Kode sekolah / NPSN"),
    ("tahun", "Tahun penilaian"),
    ("student_count", "Jumlah siswa"),
    ("rombel_count", "Jumlah rombel"),
    ("teacher_count", "Jumlah guru"),
    ("education_staff_count", "Jumlah tenaga kependidikan"),
    ("teacher_attendance", "Kehadiran guru (%)"),
    ("student_attendance", "Kehadiran siswa (%)"),
    ("bosp_absorption", "Serapan BOSP (%)"),
    ("literacy_score", "Skor literasi (0-100)"),
    ("numeracy_score", "Skor numerasi (0-100)"),
    ("dropout_rate", "Angka putus sekolah (%)"),
    ("achievement_count", "Jumlah prestasi"),
]

SCHOOL_COLUMNS = [
    ("npsn", "Kode sekolah / NPSN resmi"),
    ("name", "Nama sekolah"),
    ("jenjang", "Jenjang pendidikan"),
    ("district", "Kecamatan"),
    ("status", "Status"),
    ("address", "Alamat sekolah"),
    ("principal_name", "Nama kepala sekolah"),
    ("principal_nip", "NIP kepala sekolah (18 digit)"),
    ("accreditation_status", "Status akreditasi sekolah"),
]
ACCREDITATION_STATUSES = [
    "Unggul", "A", "Baik Sekali", "B", "Baik", "C",
    "Tidak Terakreditasi", "Belum Terakreditasi",
]
EDUCATION_LEVELS = ["SMP"]

INDICATOR_NAMES = {indicator_id: name for indicator_id, _, name in INDICATOR_ROWS}
DIMENSION_NAMES = {key: name for key, name, _, _ in DIMENSIONS}
DIMENSION_WEIGHTS = {key: weight for key, _, weight, _ in DIMENSIONS}

NAVY = "28316E"
INDIGO = "5658D8"
PALE_BLUE = "EEF1FF"
PALE_AMBER = "FFF5E3"
PALE_GREEN = "EAF7F1"
WHITE = "FFFFFF"
INK = "25324A"
MUTED = "64718A"
GRID = "DDE3EE"


def column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def cell_ref(column: int, row: int) -> str:
    return f"{column_name(column)}{row}"


def xml_cell(ref: str, value: object, style: int | None = None) -> str:
    style_attr = f' s="{style}"' if style is not None else ""
    if isinstance(value, (int, float)):
        return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'
    text = escape(str(value))
    return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t xml:space="preserve">{text}</t></is></c>'


def worksheet_xml(
    rows: list[list[tuple[object, int | None] | object]],
    widths: list[float],
    freeze_rows: int = 0,
    auto_filter: str | None = None,
    validations: list[str] | None = None,
    row_heights: dict[int, int] | None = None,
) -> str:
    last_column = max((len(row) for row in rows), default=1)
    last_row = len(rows)
    cells_by_row = []
    for row_index, row in enumerate(rows, 1):
        cells = []
        for column_index, item in enumerate(row, 1):
            if isinstance(item, tuple) and len(item) == 2 and isinstance(item[1], (int, type(None))):
                value, style = item
            else:
                value, style = item, None
            if value is not None:
                cells.append(xml_cell(cell_ref(column_index, row_index), value, style))
        height = (row_heights or {}).get(row_index)
        height_attr = f' ht="{height}" customHeight="1"' if height else ""
        cells_by_row.append(f'<row r="{row_index}"{height_attr}>{"".join(cells)}</row>')
    cols = "".join(
        f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
        for index, width in enumerate(widths, 1)
    )
    views = '<sheetViews><sheetView workbookViewId="0">'
    if freeze_rows:
        views += f'<pane ySplit="{freeze_rows}" topLeftCell="A{freeze_rows + 1}" activePane="bottomLeft" state="frozen"/>'
    views += "</sheetView></sheetViews>"
    filter_xml = f'<autoFilter ref="{auto_filter}"/>' if auto_filter else ""
    validation_xml = ""
    if validations:
        validation_xml = f'<dataValidations count="{len(validations)}">{"".join(validations)}</dataValidations>'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:{column_name(last_column)}{last_row}"/>'
        f"{views}<sheetFormatPr defaultRowHeight=\"20\"/><cols>{cols}</cols>"
        f'<sheetData>{"".join(cells_by_row)}</sheetData>'
        f"{filter_xml}{validation_xml}"
        "</worksheet>"
    )


def make_validation(
    validation_type: str,
    reference: str,
    message: str,
    formula: str,
    formula2: str | None = None,
) -> str:
    operator = ' operator="between"' if formula2 else ""
    second_formula = f"<formula2>{escape(formula2)}</formula2>" if formula2 else ""
    return (
        f'<dataValidation type="{validation_type}"{operator} allowBlank="1" showErrorMessage="1" '
        f'showInputMessage="1" errorTitle="Nilai tidak valid" error="{escape(message)}" '
        f'promptTitle="Panduan pengisian" prompt="{escape(message)}" sqref="{reference}">'
        f"<formula1>{escape(formula)}</formula1>{second_formula}</dataValidation>"
    )


def workbook_xml() -> str:
    sheet_names = ["Petunjuk", "Sekolah", *(f"Penilaian {year}" for year in ASSESSMENT_YEARS), "Kamus"]
    sheet_xml = "".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{sheet_xml}</sheets>"
        "<definedNames>"
        "<definedName name=\"KecamatanLotim\">'Kamus'!$F$2:$F$22</definedName>"
        "<definedName name=\"StatusSekolah\">'Kamus'!$G$2:$G$3</definedName>"
        "<definedName name=\"AkreditasiSekolah\">'Kamus'!$H$2:$H$9</definedName>"
        "<definedName name=\"JenjangPendidikan\">'Kamus'!$I$2:$I$2</definedName>"
        "</definedNames>"
        '<calcPr calcId="191029" fullCalcOnLoad="1"/>'
        "</workbook>"
    )


def styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="5">'
        '<font><sz val="10"/><name val="Aptos"/><color rgb="FF25324A"/></font>'
        '<font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font>'
        '<font><b/><sz val="18"/><name val="Aptos Display"/><color rgb="FF28316E"/></font>'
        '<font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF28316E"/></font>'
        '<font><i/><sz val="10"/><name val="Aptos"/><color rgb="FF64718A"/></font>'
        "</fonts>"
        '<fills count="6">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        f'<fill><patternFill patternType="solid"><fgColor rgb="FF{NAVY}"/><bgColor indexed="64"/></patternFill></fill>'
        f'<fill><patternFill patternType="solid"><fgColor rgb="FF{PALE_BLUE}"/><bgColor indexed="64"/></patternFill></fill>'
        f'<fill><patternFill patternType="solid"><fgColor rgb="FF{PALE_AMBER}"/><bgColor indexed="64"/></patternFill></fill>'
        f'<fill><patternFill patternType="solid"><fgColor rgb="FF{PALE_GREEN}"/><bgColor indexed="64"/></patternFill></fill>'
        "</fills>"
        '<borders count="2">'
        '<border><left/><right/><top/><bottom/><diagonal/></border>'
        f'<border><left style="thin"><color rgb="FF{GRID}"/></left><right style="thin"><color rgb="FF{GRID}"/></right>'
        f'<top style="thin"><color rgb="FF{GRID}"/></top><bottom style="thin"><color rgb="FF{GRID}"/></bottom><diagonal/></border>'
        "</borders>"
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="8">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'
        '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        "</cellXfs>"
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )


def instructions_sheet() -> str:
    content = [
        [("TEMPLATE DATA PENDIDIKAN SMP · KABUPATEN LOMBOK TIMUR", 2)],
        [("Tujuan", 3), ("Format pengumpulan data sekolah dan penilaian indikator untuk diolah menjadi dashboard Ruang Mutu.", 4)],
        [("PENTING", 3), ("Templat ini kosong. Masukkan data resmi yang sudah diverifikasi. Jangan gunakan data contoh aplikasi.", 5)],
        [("1 · Sekolah", 3), ("Satu sekolah per baris pada sheet Sekolah. Isi NPSN resmi, nama sesuai Dapodik, kecamatan, status, dan alamat.", 4)],
        [("2 · Penilaian", 3), ("Gunakan sheet Penilaian 2026, Penilaian 2027, dan seterusnya. Satu baris per sekolah pada sheet tahun yang sesuai.", 4)],
        [("3 · Nilai indikator", 3), ("Gunakan skala 0–100 sesuai rubrik dan bukti yang disepakati. Skor dimensi dihitung sebagai rerata indikator; indeks mutu memakai bobot pada sheet Kamus. Kolom hasil TKA dihitung otomatis dari rerata nilai Matematika dan Bahasa Indonesia per sekolah/tahun; biarkan kosong di templat.", 4)],
        [("4 · Data yang tidak tersedia", 3), ("Biarkan sel kosong dan jelaskan sumber/kendala di kolom catatan. Jangan mengisi nilai perkiraan atau 0 sebagai pengganti data kosong.", 4)],
        [("5 · Nilai persen", 3), ("Isi sebagai angka 0–100, misalnya 92 untuk 92% (bukan 0,92). Angka putus sekolah juga berupa persentase 0–100.", 4)],
        [("6 · Tahun", 3), ("Periode asesmen 2026–2030. Satu kombinasi NPSN + tahun hanya satu baris.", 4)],
        [("7 · Kode indikator", 3), ("Nama header kolom pada sheet Penilaian per tahun adalah kode teknis. Gunakan sheet Kamus untuk melihat nama indikator dan dimensinya.", 4)],
        [("8 · Jangan ubah", 3), ("Jangan mengganti nama sheet, header, kode indikator, atau nama kecamatan. Tambahkan baris data saja.", 4)],
        [("9 · Sebelum dikirim", 3), ("Periksa NPSN duplikat, ejaan kecamatan, tahun, sel kosong, nilai di luar rentang, serta konsistensi sumber dan periode.", 4)],
        [("10 · Privasi", 3), ("Jangan masukkan nama/NIK siswa atau data pribadi yang tidak diperlukan. Gunakan data agregat sekolah.", 4)],
        [("Catatan", 3), ("Rerata indikator dan indeks mutu hanya sah bila rubrik, bukti, periode pengukuran, dan sumber data telah disepakati Dinas Pendidikan.", 4)],
        [("Kontak pemilik data", 3), ("Isi nama unit pengelola, PIC, serta tanggal ekstraksi data sebelum workbook dibagikan.", 4)],
        [("Unit / PIC", 3), ("", 4)],
        [("Tanggal ekstraksi", 3), ("", 4)],
        [("Versi template", 3), ("Lombok Timur · 53 indikator (52 manual + hasil TKA otomatis) · skor 0–100", 4)],
    ]
    return worksheet_xml(
        content,
        [24, 112],
        row_heights={1: 34, **{row: 36 for row in range(2, 19)}},
    )


def school_sheet() -> str:
    headers = [key for key, _ in SCHOOL_COLUMNS]
    descriptions = [label for _, label in SCHOOL_COLUMNS]
    rows = [[(value, 1) for value in headers], [(None, 5) for _ in descriptions]]
    for index, label in enumerate(descriptions):
        rows[1][index] = (label, 5)
    validations = [
        make_validation("list", "C3:C10002", "Pilih jenjang pendidikan pada daftar.", "=JenjangPendidikan"),
        make_validation("list", "D3:D10002", "Pilih salah satu dari 21 kecamatan pada daftar.", "=KecamatanLotim"),
        make_validation("list", "E3:E10002", "Pilih status Negeri atau Swasta.", "=StatusSekolah"),
        make_validation("list", "I3:I10002", "Pilih status akreditasi dari daftar; kosongkan jika belum tersedia.", "=AkreditasiSekolah"),
    ]
    return worksheet_xml(
        rows,
        [22, 38, 18, 24, 14, 54, 34, 28, 28],
        freeze_rows=2,
        auto_filter="A2:I10002",
        validations=validations,
    )


def assessment_sheet(year: int) -> str:
    headers = [key for key, _ in METRIC_COLUMNS] + [item[0] for item in INDICATOR_ROWS] + ["catatan", "sumber_data"]
    labels = [label for _, label in METRIC_COLUMNS] + [
        f"{DIMENSION_NAMES[dimension_id]} · {INDICATOR_NAMES[indicator_id]}"
        + (" (otomatis dari hasil TKA; jangan isi manual)" if indicator_id == TKA_INDICATOR_ID else "")
        for indicator_id, dimension_id, _ in INDICATOR_ROWS
    ] + ["Catatan validasi / data kosong", "Sumber data / dokumen bukti"]
    labels[1] = f"Isi tahun {year} pada setiap baris sheet ini."
    rows = [
        [(header, 1) for header in headers],
        [(label, 5) for label in labels],
    ]
    validations = []
    for column, (key, _) in enumerate(METRIC_COLUMNS, 1):
        letter = column_name(column)
        reference = f"{letter}3:{letter}10002"
        if key == "tahun":
            validations.append(make_validation("whole", reference, f"Tahun harus {year}, sesuai nama sheet.", str(year), str(year)))
        elif key.endswith("_count"):
            validations.append(make_validation("whole", reference, "Isi bilangan bulat nol atau lebih; kosongkan jika tidak tersedia.", "0"))
        elif key == "achievement_count":
            validations.append(make_validation("whole", reference, "Isi jumlah nol atau bilangan bulat positif.", "0"))
        elif key.endswith("_score") or key in {"teacher_attendance", "student_attendance", "bosp_absorption", "dropout_rate"}:
            validations.append(
                make_validation(
                    "decimal",
                    reference,
                    "Isi angka 0 sampai 100. Kolom persen menggunakan 100 sebagai 100%.",
                    "0",
                    "100",
                )
            )
    indicator_start = len(METRIC_COLUMNS) + 1
    for column, (indicator_id, _, _) in enumerate(INDICATOR_ROWS, indicator_start):
        if indicator_id == TKA_INDICATOR_ID:
            continue
        letter = column_name(column)
        validations.append(
            make_validation(
                "decimal",
                f"{letter}3:{letter}10002",
                "Isi skor indikator 0 sampai 100 sesuai rubrik.",
                "0",
                "100",
            )
        )
    widths = [22, 14] + [16] * 4 + [19] * 6 + [17] + [18] * len(INDICATOR_ROWS) + [36, 34]
    return worksheet_xml(
        rows,
        widths,
        freeze_rows=2,
        auto_filter=f"A2:{column_name(len(headers))}10002",
        validations=validations,
    )


def dictionary_sheet() -> str:
    headers = ["kode_dimensi", "nama_dimensi", "bobot", "kode_indikator", "nama_indikator", "kecamatan", "status_sekolah", "status_akreditasi", "jenjang_pendidikan"]
    rows = [[(header, 1) for header in headers]]
    max_rows = max(len(INDICATOR_ROWS), len(DISTRICTS), 2, len(ACCREDITATION_STATUSES), len(EDUCATION_LEVELS))
    for index in range(max_rows):
        row: list[object] = [None] * len(headers)
        if index < len(INDICATOR_ROWS):
            indicator_id, dimension_id, indicator_name = INDICATOR_ROWS[index]
            row[0] = (dimension_id, 4)
            row[1] = (DIMENSION_NAMES[dimension_id], 4)
            row[2] = (DIMENSION_WEIGHTS[dimension_id], 4)
            row[3] = (indicator_id, 4)
            row[4] = (indicator_name, 4)
        if index < len(DISTRICTS):
            row[5] = (DISTRICTS[index], 4)
        if index < 2:
            row[6] = (("Negeri", "Swasta")[index], 4)
        if index < len(ACCREDITATION_STATUSES):
            row[7] = (ACCREDITATION_STATUSES[index], 4)
        if index < len(EDUCATION_LEVELS):
            row[8] = (EDUCATION_LEVELS[index], 4)
        rows.append(row)
    return worksheet_xml(
        rows,
        [20, 40, 12, 22, 44, 26, 20, 28, 22],
        freeze_rows=1,
        auto_filter="A1:I53",
    )


def content_types_xml(sheet_count: int) -> str:
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        f"{overrides}</Types>"
    )


def relationships_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )


def workbook_relationships_xml(sheet_count: int) -> str:
    sheets = "".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{sheets}<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )


def create_template(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    sheets = [
        instructions_sheet(),
        school_sheet(),
        *(assessment_sheet(year) for year in ASSESSMENT_YEARS),
        dictionary_sheet(),
    ]
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", content_types_xml(len(sheets)))
        workbook.writestr("_rels/.rels", relationships_xml())
        workbook.writestr("xl/workbook.xml", workbook_xml())
        workbook.writestr("xl/_rels/workbook.xml.rels", workbook_relationships_xml(len(sheets)))
        workbook.writestr("xl/styles.xml", styles_xml())
        for index, sheet in enumerate(sheets, 1):
            workbook.writestr(f"xl/worksheets/sheet{index}.xml", sheet)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=Path(__file__).with_name("Template_Data_Pendidikan_Lombok_Timur_Lengkap_Profil_Sekolah.xlsx"),
    )
    args = parser.parse_args()
    create_template(args.output)
    print(f"Template dibuat: {args.output.resolve()}")
    print(f"Jumlah kecamatan: {len(DISTRICTS)}; jumlah indikator: {len(INDICATOR_ROWS)}")


if __name__ == "__main__":
    main()
