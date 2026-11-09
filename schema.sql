PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin_kabupaten', 'kepala_dinas', 'kabid_smp', 'pengawas_sekolah')),
    district_scope TEXT NOT NULL DEFAULT '*',
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY,
    npsn TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    jenjang TEXT NOT NULL DEFAULT 'SMP',
    district TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Negeri', 'Swasta')),
    address TEXT NOT NULL DEFAULT '',
    principal_name TEXT,
    principal_nip TEXT,
    accreditation_status TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dimensions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
    indicators TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dimension_indicators (
    id TEXT PRIMARY KEY,
    dimension_id TEXT NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE (dimension_id, name)
);

CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    teacher_attendance REAL NOT NULL CHECK (teacher_attendance BETWEEN 0 AND 100),
    student_attendance REAL NOT NULL CHECK (student_attendance BETWEEN 0 AND 100),
    bosp_absorption REAL NOT NULL CHECK (bosp_absorption BETWEEN 0 AND 100),
    literacy_score REAL NOT NULL CHECK (literacy_score BETWEEN 0 AND 100),
    numeracy_score REAL NOT NULL CHECK (numeracy_score BETWEEN 0 AND 100),
    dropout_rate REAL NOT NULL CHECK (dropout_rate >= 0),
    student_count INTEGER CHECK (student_count >= 0),
    rombel_count INTEGER CHECK (rombel_count >= 0),
    teacher_count INTEGER CHECK (teacher_count >= 0),
    education_staff_count INTEGER CHECK (education_staff_count >= 0),
    achievement_count INTEGER NOT NULL DEFAULT 0 CHECK (achievement_count >= 0),
    UNIQUE (school_id, year)
);

CREATE TABLE IF NOT EXISTS attendance_quarters (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    teacher_attendance REAL CHECK (teacher_attendance BETWEEN 0 AND 100),
    student_attendance REAL CHECK (student_attendance BETWEEN 0 AND 100),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_id, year, quarter)
);

CREATE TABLE IF NOT EXISTS school_resource_snapshots (
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    student_count INTEGER CHECK (student_count >= 0),
    rombel_count INTEGER CHECK (rombel_count >= 0),
    teacher_count INTEGER CHECK (teacher_count >= 0),
    education_staff_count INTEGER CHECK (education_staff_count >= 0),
    PRIMARY KEY (school_id, year)
);

CREATE TABLE IF NOT EXISTS spmb_records (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    school_year TEXT NOT NULL,
    rombel_count INTEGER NOT NULL CHECK (rombel_count BETWEEN 0 AND 5000),
    students_grade_7 INTEGER CHECK (students_grade_7 BETWEEN 0 AND 100000),
    students_grade_8 INTEGER CHECK (students_grade_8 BETWEEN 0 AND 100000),
    students_grade_9 INTEGER CHECK (students_grade_9 BETWEEN 0 AND 100000),
    applicants_total INTEGER NOT NULL CHECK (applicants_total BETWEEN 0 AND 100000),
    applicants_prestasi INTEGER NOT NULL CHECK (applicants_prestasi BETWEEN 0 AND 100000),
    applicants_afirmasi INTEGER NOT NULL CHECK (applicants_afirmasi BETWEEN 0 AND 100000),
    applicants_zonasi INTEGER NOT NULL CHECK (applicants_zonasi BETWEEN 0 AND 100000),
    applicants_mutasi INTEGER NOT NULL CHECK (applicants_mutasi BETWEEN 0 AND 100000),
    accepted_prestasi INTEGER NOT NULL CHECK (accepted_prestasi BETWEEN 0 AND 100000),
    accepted_afirmasi INTEGER NOT NULL CHECK (accepted_afirmasi BETWEEN 0 AND 100000),
    accepted_zonasi INTEGER NOT NULL CHECK (accepted_zonasi BETWEEN 0 AND 100000),
    accepted_mutasi INTEGER NOT NULL CHECK (accepted_mutasi BETWEEN 0 AND 100000),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_id, school_year)
);

CREATE TABLE IF NOT EXISTS facilities_records (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK (year BETWEEN 2021 AND 2030),
    rombel_count INTEGER NOT NULL CHECK (rombel_count BETWEEN 0 AND 5000),
    teacher_room_count INTEGER NOT NULL CHECK (teacher_room_count BETWEEN 0 AND 10000),
    principal_room_count INTEGER NOT NULL CHECK (principal_room_count BETWEEN 0 AND 10000),
    library_count INTEGER NOT NULL CHECK (library_count BETWEEN 0 AND 10000),
    science_lab_count INTEGER NOT NULL CHECK (science_lab_count BETWEEN 0 AND 10000),
    computer_lab_count INTEGER NOT NULL CHECK (computer_lab_count BETWEEN 0 AND 10000),
    toilet_count INTEGER NOT NULL CHECK (toilet_count BETWEEN 0 AND 10000),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_id, year)
);

CREATE TABLE IF NOT EXISTS facilities_damage_records (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK (year BETWEEN 2021 AND 2030),
    teacher_room_good INTEGER NOT NULL CHECK (teacher_room_good BETWEEN 0 AND 10000),
    teacher_room_light INTEGER NOT NULL CHECK (teacher_room_light BETWEEN 0 AND 10000),
    teacher_room_moderate INTEGER NOT NULL CHECK (teacher_room_moderate BETWEEN 0 AND 10000),
    teacher_room_severe INTEGER NOT NULL CHECK (teacher_room_severe BETWEEN 0 AND 10000),
    principal_room_good INTEGER NOT NULL CHECK (principal_room_good BETWEEN 0 AND 10000),
    principal_room_light INTEGER NOT NULL CHECK (principal_room_light BETWEEN 0 AND 10000),
    principal_room_moderate INTEGER NOT NULL CHECK (principal_room_moderate BETWEEN 0 AND 10000),
    principal_room_severe INTEGER NOT NULL CHECK (principal_room_severe BETWEEN 0 AND 10000),
    library_good INTEGER NOT NULL CHECK (library_good BETWEEN 0 AND 10000),
    library_light INTEGER NOT NULL CHECK (library_light BETWEEN 0 AND 10000),
    library_moderate INTEGER NOT NULL CHECK (library_moderate BETWEEN 0 AND 10000),
    library_severe INTEGER NOT NULL CHECK (library_severe BETWEEN 0 AND 10000),
    science_lab_good INTEGER NOT NULL CHECK (science_lab_good BETWEEN 0 AND 10000),
    science_lab_light INTEGER NOT NULL CHECK (science_lab_light BETWEEN 0 AND 10000),
    science_lab_moderate INTEGER NOT NULL CHECK (science_lab_moderate BETWEEN 0 AND 10000),
    science_lab_severe INTEGER NOT NULL CHECK (science_lab_severe BETWEEN 0 AND 10000),
    computer_lab_good INTEGER NOT NULL CHECK (computer_lab_good BETWEEN 0 AND 10000),
    computer_lab_light INTEGER NOT NULL CHECK (computer_lab_light BETWEEN 0 AND 10000),
    computer_lab_moderate INTEGER NOT NULL CHECK (computer_lab_moderate BETWEEN 0 AND 10000),
    computer_lab_severe INTEGER NOT NULL CHECK (computer_lab_severe BETWEEN 0 AND 10000),
    toilet_good INTEGER NOT NULL CHECK (toilet_good BETWEEN 0 AND 10000),
    toilet_light INTEGER NOT NULL CHECK (toilet_light BETWEEN 0 AND 10000),
    toilet_moderate INTEGER NOT NULL CHECK (toilet_moderate BETWEEN 0 AND 10000),
    toilet_severe INTEGER NOT NULL CHECK (toilet_severe BETWEEN 0 AND 10000),
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_id, year)
);

CREATE TABLE IF NOT EXISTS tka_results (
    id INTEGER PRIMARY KEY,
    school TEXT NOT NULL,
    jenjang TEXT NOT NULL DEFAULT 'SMP',
    tka_year INTEGER CHECK (tka_year IS NULL OR tka_year BETWEEN 2000 AND 2100),
    status TEXT NOT NULL DEFAULT 'Belum Terverifikasi',
    district TEXT NOT NULL DEFAULT '',
    participant_number TEXT NOT NULL DEFAULT '',
    nisn TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    birth TEXT NOT NULL DEFAULT '',
    math REAL NOT NULL CHECK (math BETWEEN 0 AND 100),
    bahasa REAL NOT NULL CHECK (bahasa BETWEEN 0 AND 100),
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dimension_scores (
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    dimension_id TEXT NOT NULL REFERENCES dimensions(id),
    score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
    PRIMARY KEY (assessment_id, dimension_id)
);

CREATE TABLE IF NOT EXISTS indicator_scores (
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    indicator_id TEXT NOT NULL REFERENCES dimension_indicators(id),
    score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
    PRIMARY KEY (assessment_id, indicator_id)
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('tinggi', 'sedang', 'rendah')),
    message TEXT NOT NULL,
    acknowledged_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (school_id, year, type)
);

CREATE TABLE IF NOT EXISTS interventions (
    id INTEGER PRIMARY KEY,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'direncanakan'
        CHECK (status IN ('direncanakan', 'berjalan', 'selesai')),
    baseline_score REAL,
    outcome_score REAL
);

CREATE INDEX IF NOT EXISTS idx_assessments_year ON assessments(year);
CREATE INDEX IF NOT EXISTS idx_assessments_school_year ON assessments(school_id, year);
CREATE INDEX IF NOT EXISTS idx_attendance_quarters_school_year ON attendance_quarters(school_id, year);
CREATE INDEX IF NOT EXISTS idx_spmb_school_year ON spmb_records(school_year, school_id);
CREATE INDEX IF NOT EXISTS idx_facilities_year_school ON facilities_records(year, school_id);
CREATE INDEX IF NOT EXISTS idx_facilities_damage_year_school ON facilities_damage_records(year, school_id);
CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district);
CREATE INDEX IF NOT EXISTS idx_alerts_year_severity ON alerts(year, severity);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_indicator_scores_indicator ON indicator_scores(indicator_id);
