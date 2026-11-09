# Ruang Mutu — Monitoring Pendidikan Kabupaten Lombok Timur

Dashboard monitoring SMP Kabupaten Lombok Timur. Dashboard membaca database aktif `data/data.sqlite3`. Database tersebut memuat 307 profil sekolah dan snapshot sumber daya tahun 2026 yang cocok dengan workbook `data/Pendidikan_Lombok_Timur_Lengkap_Profil_Sekolah.xlsx`. Data penilaian yang belum tersedia tidak dibuat-buat; skor mutu, tren, dan risiko hanya muncul setelah asesmen dimasukkan.

## Templat data resmi

Unduh dan isi workbook kosong [`Template_Data_Pendidikan_Lombok_Timur_Lengkap_Profil_Sekolah.xlsx`](./Template_Data_Pendidikan_Lombok_Timur_Lengkap_Profil_Sekolah.xlsx). Sheet yang tersedia:

Saat server lokal aktif, tombol **Unduh templat data Excel** pada halaman login mengambil workbook templat kosong melalui `/download/template`. Pada dashboard, tombol **Unduh Data** menyediakan ekspor XLSX dan CSV serta tampilan cetak yang dapat disimpan sebagai PDF. Ekspor memuat profil dan metrik sekolah pada tahun yang sedang dipilih; skor penilaian tetap kosong bila belum tersedia. Pada halaman **Data Sarpras**, tombol **Unduh Data** menyediakan workbook Excel dan tampilan cetak PDF sesuai tahun serta filter rasio sarpras yang aktif.

1. `Petunjuk`: panduan pengisian dan catatan pemilik data.
2. `Sekolah`: satu baris per sekolah, dengan `npsn`, `name`, `jenjang`, `district`, `status`, `address`, nama kepala sekolah, NIP kepala sekolah, dan status akreditasi. Jenjang SMP tersedia melalui dropdown.
3. `Penilaian 2026` hingga `Penilaian 2030`: isi data hanya pada sheet tahun yang sesuai, satu baris per sekolah. Kolom `tahun` tetap disediakan dan hanya menerima tahun yang sama dengan nama sheet. Isi jumlah siswa, rombel, guru, tenaga kependidikan, indikator operasional, serta 52 skor indikator manual. Indikator rerata hasil TKA Matematika dan Bahasa Indonesia ditampilkan sebagai kolom otomatis; biarkan kosong di templat. Kode indikator pada baris header harus dipertahankan; nama indikator ada tepat di bawahnya. Data siswa/GTK adalah snapshot tahun penilaian.
4. `Kamus`: bobot dimensi, kode/nama indikator, kecamatan, status sekolah, dan status akreditasi.

Gunakan NPSN dan nama sekolah sesuai sumber yang dikelola. Satu baris penilaian mewakili satu sekolah-tahun. Skor indikator 0–100 mengikuti rubrik/bukti yang telah disepakati; persentase juga ditulis sebagai angka 0–100. Biarkan data yang tidak tersedia kosong dan jelaskan sumber atau kendalanya pada kolom catatan. Jangan mengirim data pribadi siswa. Workbook ini merupakan **templat pengumpulan**, bukan pengimpor langsung; impor data melalui CSV sesuai petunjuk di bawah setelah pemetaan dan validasi.

Database aktif dan workbook sumber berada di folder `data/`. Dashboard membaca profil dan snapshot dari `data/data.sqlite3`; pembaruan data dilakukan melalui CSV profil sekolah di folder tersebut dengan perintah berikut setelah server dihentikan. Aplikasi dan perintah impor menolak file sumber/database di luar folder itu:

```powershell
python import_school_csv.py Data_Pendidikan_Lombok_Timur_Lengkap_Profil_Sekolah.csv
```

Tombol **Import File** selalu terlihat pada dashboard untuk mengunggah CSV profil sekolah berformat UTF-8; hanya admin kabupaten yang dapat menggunakannya. Gunakan kolom profil pada templat; `jenjang` disimpan pada profil sekolah dan otomatis menjadi `SMP` jika kosong. Kolom `tahun`, `student_count`, `rombel_count`, `teacher_count`, dan `education_staff_count` bersifat opsional untuk snapshot tahunan. Impor menambah atau memperbarui sekolah berdasarkan NPSN dan snapshot berdasarkan sekolah-tahun, mempertahankan sekolah yang tidak ada di berkas serta asesmen yang sudah tersimpan, dan membuat cadangan database otomatis. Ukuran berkas maksimal 250 KB. Berkas yang gagal validasi tidak mengubah database.

Impor mengganti daftar sekolah dan asesmen yang terhubung; database akan dicadangkan otomatis ke folder `data/` sebelum perubahan. Opsi `--backup` hanya menerima nama file cadangan di folder `data/`. NPSN, kecamatan, status, dan NIP divalidasi sebelum perubahan dilakukan. CSV profil lama tetap didukung; CSV dengan kolom `tahun`, `student_count`, `rombel_count`, `teacher_count`, dan `education_staff_count` juga menyimpan snapshot sumber daya per sekolah-tahun. Nilai nol dipertahankan sebagai angka sah. Snapshot sumber daya tidak dianggap sebagai asesmen dan tidak menghasilkan skor mutu, tren, risiko, atau prediksi.

Generator workbook menggunakan Python standard library (tanpa dependensi tambahan):

```powershell
python buat_template.py
```

Argumen opsional generator adalah lokasi berkas keluaran.

## Menjalankan aplikasi

Persyaratan: Python 3.10+. Impor hasil TKA dari PDF memerlukan dependensi `pdfplumber`.

Periode pemantauan pada dashboard adalah tahun 2026–2030 dan tahun aktif awal adalah 2026. Grafik perjalanan pendidikan menampilkan indeks per tahun untuk periode tetap 2026–2030. Tahun yang belum memiliki asesmen tetap ditampilkan tanpa skor; profil sekolah tetap tersedia. Endpoint tetap menerima tahun 2021–2030 agar histori dan integrasi lama dapat dibaca.

```powershell
python -m pip install -r requirements.txt
python server.py
```

Pada menu **Hasil TKA**, gunakan **Unduh → Template CSV Hasil TKA** untuk memperoleh templat siap isi, termasuk kolom `Jenjang` dan `Tahun TKA`. Admin kabupaten dapat mengimpor workbook `.xlsx`, CSV UTF-8, atau PDF berisi tabel teks. CSV mendukung pemisah koma, titik koma, atau tab. Header wajib: `Nama Sekolah`, `Nama Peserta`, `Nilai Matematika`, dan `Nilai Bahasa Indonesia`; kolom jenjang dan tahun opsional untuk file lama. Jika jenjang kosong, sistem mengisinya sebagai SMP; tahun kosong tetap kosong. PDF hasil pindai gambar tidak didukung. Impor yang lolos validasi mengganti data hasil TKA sebelumnya dan tersimpan di database lokal.

Buka `http://127.0.0.1:8000`. Database tetap berada di `data/data.sqlite3`; hanya port yang dapat diatur:

```powershell
$env:RUANG_MUTU_PORT = "8001"
python server.py
```

### Akun demonstrasi

Kata sandi semua akun: `Dikbud123`.

| Peran | Email |
|---|---|
| Admin Kabupaten | `admin@ruangmutu.id` |
| Kepala Dinas | `kepala@ruangmutu.id` |
| Kabid SMP | `kabid@ruangmutu.id` |
| Pengawas Sekolah | `pengawas@ruangmutu.id` |

Data lokal yang sudah tersimpan tetap ada ketika server dimatikan. File sumber, database aktif, dan cadangan dikelola di folder `data/`. Jangan gunakan akun atau kata sandi contoh di lingkungan produksi.

### Cakupan wilayah dan data

- Kecamatan yang ditampilkan: Aikmel, Jerowaru, Keruak, Labuhan Haji, Masbagik, Montong Gading, Pringgabaya, Pringgasela, Sakra, Sakra Barat, Sakra Timur, Sambelia, Selong, Sembalun, Sikur, Sukamulia, Suralaga, Terara, Wanasaba, Suela, dan Lenek.
- Daftar sekolah dan profil ditampilkan dari database aktif, yang saat ini cocok dengan workbook sumber di `data/`.
- Skor asesmen, risiko, dan prediksi hanya tersedia untuk penilaian aktual; snapshot sumber daya tahunan dapat dimuat dari CSV profil yang memuat kolom sumber daya. Data kosong tidak diisi dari contoh sintetis.

## Kebutuhan sistem dan peran

| Peran | Lingkup akses |
|---|---|
| Admin Kabupaten | Baca dashboard serta mencatat asesmen, data SPMB, dan data sarpras |
| Kepala Dinas | Baca ringkasan, peringkat, peringatan, dan rekomendasi |
| Kabid SMP | Baca dan mencatat asesmen, data SPMB, serta data sarpras |
| Pengawas Sekolah | Baca serta mencatat asesmen, data SPMB, dan data sarpras sekolah dalam lingkup kecamatannya |

Semua akun demo di atas memiliki cakupan seluruh kabupaten agar alur dapat diperagakan. Kolom `users.district_scope` dapat membatasi akun pengawas pada satu kecamatan.

### Kebutuhan fungsional yang tercakup

- Ringkasan profil dan sumber daya sekolah, filter dan pencarian, serta metrik asesmen hanya untuk tahun/sekolah yang memiliki penilaian.
- Pencarian, filter status/tren, unduh CSV, serta detail historis per sekolah.
- Pemantauan SPMB per tahun ajaran dan sekolah berdasarkan NPSN: jumlah siswa kelas 7–9, jumlah rombel, total pendaftar, pendaftar per jalur prestasi/afirmasi/zonasi/mutasi, serta jumlah diterima per jalur. Admin kabupaten, Kabid SMP, dan pengawas dalam lingkup kecamatannya dapat mencatat atau memperbarui data.
- Input dan pemantauan sarana prasarana per sekolah dan tahun: nama sekolah, NPSN, kecamatan, status, rombel, ruang guru, ruang kepala sekolah, perpustakaan, Lab IPA, Lab TIK, dan toilet. Tingkat kondisi setiap fasilitas dicatat sebagai baik, rusak ringan, rusak sedang, atau rusak berat; jumlah yang dinilai tidak boleh melebihi jumlah fasilitas, dan unit yang belum dinilai boleh tidak dicatat. Tabel menandai data yang belum dinilai dan mengurutkan sekolah berdasarkan jumlah rusak berat, kemudian sedang dan ringan, tanpa bobot buatan.
- Formulir penilaian berbasis peran untuk mencatat kehadiran guru dan siswa per triwulan, metrik operasional, 52 indikator manual, dan rerata TKA otomatis. Rerata TKA dihitung dari nilai Matematika dan Bahasa Indonesia peserta pada sekolah dan tahun yang sama, dengan kecamatan sebagai pencocokan tambahan jika tersedia; data tanpa tahun atau dengan nama sekolah ambigu tidak dicocokkan. Jika TKA tidak tersedia, indikator dikecualikan dari perhitungan. Rata-rata kehadiran tahunan dihitung dari triwulan yang terisi; pengguna berwenang dapat memperbarui triwulan tanpa mengirim ulang seluruh penilaian. Skor dimensi dan indeks mutu dihitung dari indikator oleh API.
- Skor mutu berbobot, tren longitudinal, gap kabupaten/kecamatan/sekolah terbaik, peringkat kabupaten/kecamatan/status, dan proyeksi tahun berikutnya.
- Early warning deterministik untuk perubahan mutu, kehadiran guru, serapan BOSP, literasi, numerasi, serta angka putus sekolah.
- Autentikasi multi-user berbasis bearer token, penyimpanan kata sandi PBKDF2, dan batas otorisasi berbasis peran.
- Layout responsif desktop dan mobile.

## Arsitektur sistem

```mermaid
flowchart LR
    U[Pengguna dinas<br/>Admin · Kepala Dinas · Kabid · Pengawas]
    UI[Browser<br/>HTML · CSS · JavaScript]
    API[REST API<br/>Python standard library]
    AUTH[Autentikasi & RBAC<br/>Token sesi berumur terbatas]
    DB[(SQLite<br/>data.sqlite3)]
    U --> UI
    UI -->|HTTPS pada deployment| API
    API --> AUTH
    AUTH --> DB
    API -->|Skor · tren · risiko · insight| UI
```

Untuk produksi, letakkan API di belakang reverse proxy HTTPS, pindahkan rahasia sesi ke pengelola rahasia, tambahkan proteksi brute-force, pencatatan audit, backup, monitoring, dan proses pengelolaan akun. Server bawaan Python ini untuk demo/intranet terbatas, bukan deployment internet.

## Struktur data dan ERD

Skema kanonis terdapat di [`schema.sql`](./schema.sql). Setiap asesmen menyimpan skor tiap indikator pada skala 0–100; skor dimensi adalah rerata indikator dalam dimensinya. Data profil dan sumber daya berasal dari berkas di folder `data/`; data asesmen yang kosong tidak digantikan oleh skor sintetis.

| Dimensi | Bobot | Indikator |
|---|---:|---|
| Manajemen sekolah | 25% | Kepemimpinan kepala sekolah; perencanaan berbasis data; supervisi akademik; disiplin guru; kehadiran guru; kehadiran siswa; pengelolaan tenaga kependidikan; pengelolaan sarana prasarana; implementasi kurikulum; pelaksanaan Projek P5; budaya sekolah; kemitraan sekolah |
| Mutu pembelajaran | 25% | Observasi pembelajaran; pembelajaran aktif; pembelajaran berdiferensiasi; pemanfaatan teknologi; asesmen formatif; pemanfaatan hasil asesmen; perangkat ajar; modul ajar |
| Hasil belajar | 15% | Literasi; numerasi; AKM; nilai rapor pendidikan; kenaikan kelas; kelulusan; penurunan angka mengulang |
| Pengelolaan dana BOSP | 10% | Perencanaan RKAS; kesesuaian penggunaan; ketepatan pelaporan; transparansi; efektivitas; pemanfaatan untuk mutu pembelajaran |
| Kualitas guru dan tenaga kependidikan | 10% | Kualifikasi pendidikan guru; sertifikasi; pengembangan profesi; pelatihan; komunitas belajar; kinerja guru |
| Prestasi sekolah | 10% | Prestasi akademik; prestasi nonakademik; tingkat kabupaten; tingkat provinsi; tingkat nasional; tingkat internasional |
| Iklim dan lingkungan sekolah | 5% | Keamanan; anti-perundungan; inklusivitas; kebersihan; sekolah sehat; sekolah ramah anak; ketangguhan iklim |

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : memiliki
    USERS ||--o{ INTERVENTIONS : mengelola
    SCHOOLS ||--o{ ASSESSMENTS : dinilai
    ASSESSMENTS ||--|{ DIMENSION_SCORES : memuat
    DIMENSIONS ||--o{ DIMENSION_SCORES : membobot
    ASSESSMENTS ||--o{ INDICATOR_SCORES : memuat
    DIMENSION_INDICATORS ||--o{ INDICATOR_SCORES : merinci
    SCHOOLS ||--o{ ALERTS : menghasilkan
    SCHOOLS ||--o{ INTERVENTIONS : menerima

    USERS {
      int id PK
      string email UK
      string role
      string district_scope
      string password_hash
    }
    SCHOOLS {
      int id PK
      string npsn UK
      string name
      string district
      string status
    }
    ASSESSMENTS {
      int id PK
      int school_id FK
      int year
      float teacher_attendance
      float bosp_absorption
      float literacy_score
      float numeracy_score
      float dropout_rate
    }
    DIMENSIONS {
      string id PK
      string name
      float weight
      string indicators
    }
    DIMENSION_INDICATORS {
      string id PK
      string dimension_id FK
      string name
    }
    DIMENSION_SCORES {
      int assessment_id PK, FK
      string dimension_id PK, FK
      float score
    }
    INDICATOR_SCORES {
      int assessment_id PK, FK
      string indicator_id PK, FK
      float score
    }
    ALERTS {
      int id PK
      int school_id FK
      int year
      string type
      string severity
    }
    SESSIONS {
      int id PK
      int user_id FK
      string token_hash UK
      int expires_at
    }
    INTERVENTIONS {
      int id PK
      int school_id FK
      int owner_id FK
      string status
      float baseline_score
      float outcome_score
    }
```

## Formula dan algoritma

### Indeks Mutu Sekolah (0–100)

Tujuh skor dimensi menggunakan skala 0–100. Bobot berjumlah 100%.

```text
IMS(s,t) = 0,25 Manajemen
         + 0,25 Mutu Pembelajaran
         + 0,15 Hasil Belajar
         + 0,10 BOSP
         + 0,10 Kualitas GTK
         + 0,10 Prestasi
         + 0,05 Iklim dan Lingkungan
```

Skor dimensi adalah rerata aritmetika indikator dalam dimensinya; indeks mutu adalah penjumlahan skor dimensi dikalikan bobot. Skala, bukti penilaian, sumber, dan rubrik indikator masih perlu disepakati bersama pemilik data sebelum penilaian operasional.

### Indeks Kemajuan Sekolah

Dashboard menampilkan perubahan tahun-ke-tahun sebagai **poin indeks**:

```text
IK(s,t) = IMS(s,t) - IMS(s,t-1)
```

Tren lima tahun menggunakan selisih skor ujung periode `IMS(s,t) - IMS(s,t-4)`: ≥10 sangat meningkat; 3 s.d. <10 meningkat; >−3 s.d. <3 stabil; ≤−3 s.d. >−10 menurun; ≤−10 sangat menurun. Bila data periode belum lengkap, rentang menggunakan tahun yang tersedia.

### Indeks Risiko Sekolah

Indeks risiko (0–100) adalah **skor skrining**, bukan probabilitas kejadian:

```text
Risiko = clamp(
    0,55 × (100 - IMS)
  + 0,45 × max(0, 88 - kehadiran guru)
  + 0,25 × max(0, 75 - serapan BOSP)
  + 4 × max(0, angka putus sekolah - 0,5)
  + 2,5 × jumlah sinyal aktif,
  0, 100)
```

Kategori: tinggi ≥35, sedang ≥20, rendah <20. Bobot dan batas ini adalah nilai awal demo, belum dikalibrasi pada data historis kabupaten.

### Peringatan dini dan tren

- Mutu turun lebih dari 10% relatif ke skor tahun sebelumnya.
- Kehadiran guru <85%; serapan BOSP <70%.
- Literasi atau numerasi turun >5 poin; angka putus sekolah naik >1 poin persentase dibanding tahun sebelumnya.
- Proyeksi tahun berikutnya: regresi linear OLS atas skor tahunan (maksimal lima observasi), perubahan lereng dibatasi ±5 poin per tahun, hasil dibatasi 0–100.
- Gap sekolah: skor sekolah dikurangi rerata kabupaten, rerata kecamatan, dan skor sekolah terbaik pada tahun dan cakupan data terpilih.

Ambang merupakan aturan pemantauan, bukan standar resmi. Validasi definisi penurunan relatif/poin dan jeda pelaporan dengan pemilik kebijakan sebelum digunakan untuk keputusan pendanaan.

### Analitik dan batas interpretasi

Ringkasan rekomendasi dihasilkan oleh aturan deterministik dari dimensi terlemah dan sinyal aktif; tidak memakai LLM atau model kausal. Dimensi berkorelasi dengan kemajuan belum membuktikan penyebabnya. Ukur dampak intervensi dengan baseline/follow-up, kelompok pembanding yang layak, periode yang sebanding, dan pencatatan konteks program; hindari menyimpulkan dampak hanya dari perubahan sebelum-sesudah.

Peta berupa ilustrasi sebaran, bukan batas wilayah/geokode resmi. Penyegaran data dilakukan saat dashboard dimuat atau tombol segarkan ditekan; sistem demo tidak menerima aliran real-time dari sumber eksternal.

## REST API

Semua rute `/api/*` selain login memerlukan header `Authorization: Bearer YOUR_SESSION_TOKEN`.

| Metode | Endpoint | Akses dan kegunaan |
|---|---|---|
| `POST` | `/api/auth/login` | Publik; menerima `{ "email", "password" }` |
| `GET` | `/api/auth/me` | Semua peran; profil sesi |
| `DELETE` | `/api/auth/logout` | Mengakhiri token sesi |
| `GET` | `/api/indicators` | Semua peran; kamus indikator dan bobot dimensi |
| `GET` | `/api/dashboard?year=2025` | Semua peran; KPI, tren, ranking, gap, alerts, rekomendasi |
| `GET` | `/api/schools?year=2025&search=...&status=Negeri&district=...` | Semua peran; daftar dan filter sekolah |
| `GET` | `/api/schools/{id}?year=2025` | Semua peran; detail indikator dan histori |
| `GET` | `/api/alerts?year=2025` | Semua peran; sinyal aktif |
| `POST` | `/api/assessments` | Admin, Kabid, Pengawas; tulis asesmen baru |

`POST /api/assessments` menerima `school_id`, `year`, indikator operasional, `student_count`, `rombel_count`, `teacher_count`, `education_staff_count` (bilangan bulat nonnegatif; boleh tidak tersedia), opsional `achievement_count`, dan objek `indicators` dengan semua ID indikator dari `/api/indicators`. Skor dimensi dihitung otomatis dari rerata indikator. Untuk integrasi ringkas, endpoint juga menerima `dimensions` berisi tujuh skor agregat, tetapi penyimpanan indikator pada jalur ini mengikuti skor dimensi agar histori tetap lengkap. Kirim salah satu dari `indicators` atau `dimensions`, tidak keduanya. Asesmen per sekolah/tahun unik.

Pada dashboard, pengguna Admin Kabupaten, Kabid SMP, dan Pengawas Sekolah dapat membuka **Input penilaian**. Formulir menampilkan hanya sekolah yang belum dinilai pada tahun aktif, meminta kehadiran guru dan siswa per Triwulan I–IV dengan kalkulasi rata-rata berjalan, metrik operasional, seluruh indikator dalam kelompok dimensi, serta snapshot sumber daya opsional. Tombol **Kehadiran triwulan** memungkinkan pembaruan data triwulan untuk sekolah yang sudah dinilai; triwulan yang dikosongkan tetap memakai nilai tersimpan. Kepala Dinas tetap memiliki akses baca. API memvalidasi role, cakupan kecamatan, rentang nilai, dan asesmen duplikat; data yang belum tersedia tidak otomatis diisi.

`PATCH /api/schools/{id}` memperbarui profil sekolah melalui `principal_name`, `principal_nip`, dan/atau `accreditation_status`. NIP harus 18 digit. Perubahan profil hanya dapat dilakukan oleh Admin Kabupaten atau Kabid SMP; nilai kosong menghapus data tersebut. Nama/NIP kepala sekolah dan akreditasi yang belum tersedia perlu diisi dari sumber yang dikelola.

## Pengujian

```powershell
python -m unittest discover -s tests -v
```

## Pengembangan lanjutan

1. Integrasikan Dapodik, Rapor Pendidikan/AKM, BOSP, kehadiran, dan data wilayah melalui kontrak API serta validasi kualitas data.
2. Sepakati kamus indikator, rubrik skor, metadata sumber, timestamp pembaruan, serta mekanisme koreksi dan audit data.
3. Terapkan manajemen akun, reset sandi, MFA, audit log, hak akses pengawas per sekolah, HTTPS, dan pengujian keamanan.
4. Tambahkan antrean/riwayat intervensi, rencana tindak lanjut, bukti kegiatan, biaya, target, pemilik program, dan evaluasi dampak.
5. Kalibrasi indeks risiko dan peringatan pada data historis; uji akurasi, false alarm, bias, serta keterjelasan rekomendasi per kelompok sekolah.
6. Ganti peta skematis dengan batas administrasi resmi/geospasial dan kebijakan perlindungan lokasi.
7. Tambahkan ekspor laporan PDF, impor data tervalidasi, pengingat supervisi, serta tampilan aksesibilitas yang diuji bersama pengguna.

## Deployment Google Apps Script

Folder [`gas/`](./gas/) berisi versi mandiri Google Apps Script Web App. Versi ini tidak menjalankan Python atau SQLite: antarmuka HTML/CSS/JavaScript menggunakan `google.script.run`, sedangkan `Code.gs` membaca dan menulis Google Sheets melalui `SpreadsheetApp`. Versi lokal tetap tersedia dan tidak berbagi database dengan deployment GAS.

```mermaid
flowchart LR
    U[Admin · Kepala Dinas · Kabid · Pengawas]
    UI[HtmlService<br/>HTML · CSS · JavaScript]
    RPC[google.script.run]
    GS[Apps Script<br/>Auth · RBAC · scoring · analitik]
    DB[(Google Sheets<br/>Pengguna · Sekolah · Penilaian · Intervensi)]
    U --> UI --> RPC --> GS --> DB
    GS -->|Dashboard · risiko · rekomendasi| RPC
```

### Menyiapkan proyek dan akun awal

1. Buat Google Spreadsheet khusus aplikasi, lalu buka **Extensions → Apps Script** dari spreadsheet tersebut.
2. Salin `Code.gs` menjadi file script dan `Index.html`, `Styles.html`, `Client.html` sebagai file HTML di editor Apps Script. Aktifkan tampilan `appsscript.json` pada project settings dan salin manifest dari folder `gas/`.
3. Pada **Project Settings → Script Properties**, atur `INITIAL_ADMIN_LOGIN` dan `INITIAL_ADMIN_PASSWORD`. Nilai login dapat berupa ID pengguna seperti `databidang`; kata sandi harus unik minimal 12 karakter. Jangan menaruh kata sandi di source code atau membagikan Script Properties.
4. Jalankan `setupRuangMutu_()` dari editor Apps Script dan setujui otorisasi. Fungsi ini membuat sheet, membuat akun Admin Kabupaten pertama, lalu menghapus properti kredensial awal.
5. Deploy sebagai **Web app**, pilih **Execute as: Me**, dan batasi akses ke domain/kelompok pengguna yang dituju. URL hanya boleh dibagikan kepada pengguna berwenang. Akun tambahan dibuat Admin Kabupaten dari bagian **Pengguna** di aplikasi.
6. Masuk dengan login dan kata sandi admin yang disetel pada langkah 3. Gunakan **Impor CSV sekolah** untuk memuat daftar sekolah; impor melakukan tambah/perbarui berdasarkan NPSN dan tidak menghapus asesmen yang sudah ada.

Nilai `SPREADSHEET_ID` diatur otomatis saat script terikat pada spreadsheet. Untuk project standalone, isi property tersebut dengan ID spreadsheet sebelum menjalankan `setupRuangMutu_()`. Jangan gunakan kredensial contoh atau kata sandi yang dipakai di layanan lain.

### Penyimpanan Google Sheets dan relasi

| Sheet | Isi utama |
|---|---|
| `Pengguna` | Login, nama, peran, cakupan kecamatan, salt dan hash PBKDF2, status akun |
| `Sekolah` | NPSN, nama, kecamatan, status, alamat, profil kepala sekolah dan akreditasi |
| `SumberDaya` | Snapshot sekolah-tahun untuk siswa, rombel, guru, dan tenaga kependidikan |
| `Penilaian 2026`–`Penilaian 2030` | Satu sheet per tahun penilaian, satu rekaman per sekolah, metrik operasional, dan referensi bukti |
| `SkorIndikator` | Skor setiap indikator yang terkait dengan satu penilaian |
| `Sesi` | Hash token sesi dan waktu kedaluwarsa |
| `Intervensi` | Program, pemilik, status, skor baseline, dan skor follow-up |

Dimensi, bobot, dan 52 indikator didefinisikan di `gas/Code.gs`, bukan disunting sebagai baris spreadsheet.

```mermaid
erDiagram
    PENGGUNA ||--o{ SESI : memiliki
    PENGGUNA ||--o{ INTERVENSI : mengelola
    SEKOLAH ||--o{ SUMBER_DAYA : memiliki
    SEKOLAH ||--o{ PENILAIAN : dinilai
    PENILAIAN ||--|{ SKOR_INDIKATOR : memuat
    SEKOLAH ||--o{ INTERVENSI : menerima
```

### Catatan operasional GAS

- Login adalah ID/email dan kata sandi aplikasi, bukan autentikasi otomatis akun Google. Sesi memakai token acak dengan masa berlaku enam jam; password disimpan sebagai salt + PBKDF2-HMAC-SHA256, bukan teks biasa.
- Form penilaian mengirim 52 indikator manual dan metrik operasional; rerata TKA dihitung server dari hasil yang cocok dengan nama sekolah dan tahun penilaian (serta kecamatan jika tersedia), dan dapat kosong tanpa memblokir penilaian. Server memvalidasi peran/cakupan kecamatan, rentang skor, dan duplikasi sekolah-tahun.
- `Pengawas Sekolah` dapat dibatasi dengan `district_scope` ke satu kecamatan; peran kepala dinas hanya membaca. Hindari mengubah struktur header sheet.
- Impor CSV mendukung kolom `npsn`, `name`, `district`, `status`, serta opsional `address`, `principal_name`, `principal_nip`, `accreditation_status`, `tahun`, `student_count`, `rombel_count`, `teacher_count`, dan `education_staff_count`. Nama kolom Indonesia juga didukung.
- Skor mutu = jumlah rerata indikator per dimensi dikalikan bobot dimensi. Risiko dan peringatan adalah skrining berbasis ambang, bukan probabilitas kejadian. Prediksi adalah regresi linear sederhana, bukan kepastian.
- Dampak intervensi ditampilkan sebagai perubahan baseline–follow-up. Perubahan sebelum-sesudah tidak membuktikan dampak kausal tanpa pembanding dan pengendalian faktor lain.
- Data dibaca dari spreadsheet saat dashboard diminta atau disegarkan; ini bukan stream real-time. Perhatikan kuota Apps Script/Sheets pada skala penggunaan tinggi dan lakukan backup spreadsheet.

### Sumber proyek GAS

- Backend dan skema sheet: [`gas/Code.gs`](./gas/Code.gs)
- Antarmuka web: [`gas/Index.html`](./gas/Index.html), [`gas/Styles.html`](./gas/Styles.html), [`gas/Client.html`](./gas/Client.html)
