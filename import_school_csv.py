#!/usr/bin/env python3
"""Validate and import the filled Lombok Timur school-profile CSV."""

from __future__ import annotations

import argparse
import csv
import io
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import TextIO

import server
from buat_template import SCHOOL_COLUMNS


CSV_COLUMNS = [key for key, _ in SCHOOL_COLUMNS]
LEGACY_CSV_COLUMNS = [column for column in CSV_COLUMNS if column != "jenjang"]
DESCRIPTION_ROW = dict(SCHOOL_COLUMNS)
RESOURCE_COLUMNS = [
    "tahun",
    "student_count",
    "rombel_count",
    "teacher_count",
    "education_staff_count",
]
COUNT_COLUMNS = RESOURCE_COLUMNS[1:]


def require_data_path(path: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(server.DATA_DIR.resolve())
    except ValueError as exc:
        raise ValueError(f"Sumber data harus berada di folder {server.DATA_DIR}.") from exc
    return resolved


def load_school_data(
    path: Path,
) -> tuple[list[dict[str, str | None]], list[dict[str, int | str | None]]]:
    path = require_data_path(path)
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            return _parse_school_data(source)
    except UnicodeDecodeError as exc:
        raise ValueError("CSV harus menggunakan encoding UTF-8.") from exc


def load_school_data_text(
    content: str,
) -> tuple[list[dict[str, str | None]], list[dict[str, int | str | None]]]:
    if not isinstance(content, str) or not content.strip():
        raise ValueError("CSV tidak berisi data sekolah.")
    return _parse_school_data(io.StringIO(content.lstrip("\ufeff"), newline=""))


def _parse_school_data(
    source: TextIO,
) -> tuple[list[dict[str, str | None]], list[dict[str, int | str | None]]]:
    reader = csv.DictReader(source)
    fieldnames = reader.fieldnames or []
    header_set = set(fieldnames)
    profile_headers = header_set - set(RESOURCE_COLUMNS)
    has_resource_columns = set(RESOURCE_COLUMNS) <= header_set
    valid_headers = (
        len(fieldnames) == len(header_set)
        and profile_headers in (set(CSV_COLUMNS), set(LEGACY_CSV_COLUMNS))
        and (has_resource_columns or not header_set.intersection(RESOURCE_COLUMNS))
    )
    if not valid_headers:
        raise ValueError(
            "Header CSV tidak sesuai. Kolom profil wajib: " + ", ".join(CSV_COLUMNS)
            + "; jenjang opsional untuk CSV lama; kolom sumber daya tahunan opsional: " + ", ".join(RESOURCE_COLUMNS)
        )
    schools: list[dict[str, str | None]] = []
    snapshots: list[dict[str, int | str | None]] = []
    seen_npsn: set[str] = set()
    for line_number, raw_row in enumerate(reader, start=2):
        row = {key: (raw_row.get(key) or "").strip() for key in fieldnames}
        description_keys = set(fieldnames).intersection(CSV_COLUMNS)
        if description_keys and all(row.get(key) == DESCRIPTION_ROW[key] for key in description_keys):
            continue
        if not any(row.values()):
            continue
        npsn = row["npsn"]
        if len(npsn) != 8 or not npsn.isdigit():
            raise ValueError(f"NPSN pada baris {line_number} harus terdiri dari 8 angka.")
        if npsn in seen_npsn:
            raise ValueError(f"NPSN duplikat {npsn} pada baris {line_number}.")
        seen_npsn.add(npsn)
        if not row["name"]:
            raise ValueError(f"Nama sekolah pada baris {line_number} wajib diisi.")
        if row["district"] not in server.DISTRICTS:
            raise ValueError(f"Kecamatan tidak dikenal pada baris {line_number}: {row['district']}.")
        if row["status"] not in {"Negeri", "Swasta"}:
            raise ValueError(f"Status sekolah tidak valid pada baris {line_number}.")
        jenjang = row.get("jenjang", "").strip() or "SMP"
        if len(jenjang) > 40:
            raise ValueError(f"Jenjang pada baris {line_number} maksimal 40 karakter.")
        nip = row["principal_nip"]
        if nip and (len(nip) != 18 or not nip.isdigit()):
            raise ValueError(f"NIP kepala sekolah pada baris {line_number} harus 18 angka.")
        schools.append({
            **{key: row.get(key, "") for key in CSV_COLUMNS if key != "jenjang"},
            "jenjang": jenjang,
            "principal_name": row["principal_name"] or None,
            "principal_nip": nip or None,
            "accreditation_status": row["accreditation_status"] or None,
        })
        if has_resource_columns:
            year_value = row["tahun"]
            resource_values = [row[column] for column in COUNT_COLUMNS]
            if not year_value and any(resource_values):
                raise ValueError(f"Tahun sumber daya pada baris {line_number} wajib diisi.")
            if year_value:
                try:
                    year = int(year_value)
                except ValueError as exc:
                    raise ValueError(f"Tahun pada baris {line_number} harus berupa angka.") from exc
                if not 2021 <= year <= 2030:
                    raise ValueError(f"Tahun pada baris {line_number} harus antara 2021 dan 2030.")
                snapshot: dict[str, int | str | None] = {"npsn": npsn, "year": year}
                for column, value in zip(COUNT_COLUMNS, resource_values):
                    if not value:
                        snapshot[column] = None
                        continue
                    try:
                        count = int(value)
                    except ValueError as exc:
                        raise ValueError(f"{column} pada baris {line_number} harus bilangan bulat.") from exc
                    if count < 0:
                        raise ValueError(f"{column} pada baris {line_number} tidak boleh negatif.")
                    snapshot[column] = count
                snapshots.append(snapshot)
    if not schools:
        raise ValueError("CSV tidak berisi data sekolah.")
    return schools, snapshots


def load_school_rows(path: Path) -> list[dict[str, str | None]]:
    return load_school_data(path)[0]


def backup_database(database_path: Path, backup_path: Path) -> None:
    database_path = require_data_path(database_path)
    backup_path = require_data_path(backup_path)
    if backup_path.exists():
        raise FileExistsError(f"File backup sudah ada: {backup_path}")
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(database_path, timeout=10)
    destination = sqlite3.connect(backup_path)
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()


def replace_school_registry(
    database_path: Path,
    schools: list[dict[str, str | None]],
    snapshots: list[dict[str, int | str | None]] | None = None,
) -> None:
    database_path = require_data_path(database_path)
    connection = sqlite3.connect(database_path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    try:
        with connection:
            connection.execute("DELETE FROM schools")
            school_ids = {}
            for school in schools:
                cursor = connection.execute(
                    """INSERT INTO schools
                              (npsn, name, jenjang, district, status, address, principal_name, principal_nip, accreditation_status)
                              VALUES (:npsn, :name, :jenjang, :district, :status, :address, :principal_name, :principal_nip, :accreditation_status)""",
                    school,
                )
                school_ids[school["npsn"]] = cursor.lastrowid
            for snapshot in snapshots or []:
                connection.execute(
                    """INSERT INTO school_resource_snapshots
                       (school_id, year, student_count, rombel_count, teacher_count, education_staff_count)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        school_ids[snapshot["npsn"]],
                        snapshot["year"],
                        snapshot["student_count"],
                        snapshot["rombel_count"],
                        snapshot["teacher_count"],
                        snapshot["education_staff_count"],
                    ),
                )
    finally:
        connection.close()


def update_school_registry(
    database_path: Path,
    schools: list[dict[str, str | None]],
    snapshots: list[dict[str, int | str | None]],
) -> tuple[int, int]:
    database_path = require_data_path(database_path)
    connection = sqlite3.connect(database_path, timeout=10)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    try:
        with connection:
            existing_npsn = {
                row[0] for row in connection.execute("SELECT npsn FROM schools")
            }
            inserted = sum(school["npsn"] not in existing_npsn for school in schools)
            updated = len(schools) - inserted
            for school in schools:
                connection.execute(
                    """INSERT INTO schools
                       (npsn, name, jenjang, district, status, address, principal_name, principal_nip, accreditation_status)
                       VALUES (:npsn, :name, :jenjang, :district, :status, :address, :principal_name, :principal_nip, :accreditation_status)
                       ON CONFLICT(npsn) DO UPDATE SET
                           name = excluded.name,
                           jenjang = excluded.jenjang,
                           district = excluded.district,
                           status = excluded.status,
                           address = excluded.address,
                           principal_name = excluded.principal_name,
                           principal_nip = excluded.principal_nip,
                           accreditation_status = excluded.accreditation_status""",
                    school,
                )
            school_ids = {
                row[0]: row[1]
                for row in connection.execute("SELECT npsn, id FROM schools")
            }
            for snapshot in snapshots:
                connection.execute(
                    """INSERT INTO school_resource_snapshots
                       (school_id, year, student_count, rombel_count, teacher_count, education_staff_count)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(school_id, year) DO UPDATE SET
                           student_count = excluded.student_count,
                           rombel_count = excluded.rombel_count,
                           teacher_count = excluded.teacher_count,
                           education_staff_count = excluded.education_staff_count""",
                    (
                        school_ids[snapshot["npsn"]],
                        snapshot["year"],
                        snapshot["student_count"],
                        snapshot["rombel_count"],
                        snapshot["teacher_count"],
                        snapshot["education_staff_count"],
                    ),
                )
    finally:
        connection.close()
    return inserted, updated


def import_uploaded_school_csv(
    content: str,
    database_path: Path | None = None,
) -> tuple[int, int, int, Path]:
    if not isinstance(content, str) or not content.strip():
        raise ValueError("CSV tidak berisi data sekolah.")
    if len(content) > 250_000:
        raise ValueError("Ukuran CSV maksimal 250 KB.")
    schools, snapshots = load_school_data_text(content)
    database_path = require_data_path(database_path or server.DB_PATH)
    backup_path = database_path.with_name(
        f"{database_path.stem}.before_upload_import_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}{database_path.suffix}"
    )
    backup_database(database_path, backup_path)
    inserted, updated = update_school_registry(database_path, schools, snapshots)
    return inserted, updated, len(snapshots), backup_path


def import_school_csv(
    csv_path: Path,
    database_path: Path | None = None,
    backup_path: Path | None = None,
) -> tuple[int, Path]:
    csv_path = require_data_path(csv_path)
    database_path = require_data_path(database_path or server.DB_PATH)
    schools, snapshots = load_school_data(csv_path)
    if csv_path.resolve() == database_path.resolve():
        raise ValueError("File CSV dan database harus berbeda.")
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path, timeout=10)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        server.seed_database(connection)
    finally:
        connection.close()
    resolved_backup = backup_path or database_path.with_name(
        f"{database_path.stem}.before_csv_import_{datetime.now().strftime('%Y%m%d_%H%M%S')}{database_path.suffix}"
    )
    backup_database(database_path, resolved_backup)
    replace_school_registry(database_path, schools, snapshots)
    return len(schools), resolved_backup


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", help="Nama file CSV yang berada di folder data")
    parser.add_argument("--backup", help="Nama file cadangan di folder data")
    args = parser.parse_args()
    csv_path = require_data_path(server.DATA_DIR / args.csv_file)
    backup_path = require_data_path(server.DATA_DIR / args.backup) if args.backup else None
    count, backup_path = import_school_csv(csv_path, server.DB_PATH, backup_path)
    print(f"Berhasil mengimpor {count} sekolah dari {csv_path}")
    print(f"Backup database sebelum impor: {backup_path.resolve()}")
    print("Snapshot sumber daya tahunan disimpan jika kolom tersebut tersedia.")
    print("Data penilaian dan skor mutu tidak diimpor; penilaian harus berasal dari asesmen.")


if __name__ == "__main__":
    main()
