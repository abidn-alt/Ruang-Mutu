const TOKEN_KEY = "ruangmutu-session";
const COLOR = { indigo: "#6263e6", mint: "#44c2a0", grid: "#eef0f5" };
const FACILITY_DAMAGE_TYPES = [
  { key: "teacher_room", countField: "teacher_room_count", label: "Ruang Guru" },
  { key: "principal_room", countField: "principal_room_count", label: "Ruang Kepala Sekolah" },
  { key: "library", countField: "library_count", label: "Perpustakaan" },
  { key: "science_lab", countField: "science_lab_count", label: "Lab IPA" },
  { key: "computer_lab", countField: "computer_lab_count", label: "Lab TIK" },
  { key: "toilet", countField: "toilet_count", label: "Toilet" },
];
const FACILITY_DAMAGE_LEVELS = [
  { key: "good", label: "Baik", short: "B" },
  { key: "light", label: "Rusak Ringan", short: "RR" },
  { key: "moderate", label: "Rusak Sedang", short: "RS" },
  { key: "severe", label: "Rusak Berat", short: "RB" },
];
const DISTRICT_POINTS = [
  ["Aikmel", 193, 91], ["Jerowaru", 121, 160], ["Keruak", 204, 139],
  ["Labuhan Haji", 184, 131], ["Masbagik", 174, 106], ["Montong Gading", 164, 90],
  ["Pringgabaya", 229, 89], ["Pringgasela", 154, 104], ["Sakra", 161, 143],
  ["Sakra Barat", 139, 137], ["Sakra Timur", 183, 151], ["Sambelia", 240, 40],
  ["Selong", 192, 119], ["Sembalun", 217, 63], ["Sikur", 145, 115],
  ["Sukamulia", 181, 115], ["Suralaga", 190, 102], ["Terara", 125, 113],
  ["Wanasaba", 211, 85], ["Suela", 207, 100], ["Lenek", 198, 83],
];
let sessionToken = localStorage.getItem(TOKEN_KEY);
let dashboardData = null;
let tkaResults = [];
let spmbData = null;
let facilitiesData = null;
let facilityRatioFilter = null;
let currentUser = null;
let indicatorCatalog = null;
let visibleSchoolCount = 8;
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}), ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...options.headers };
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/login")) logout(false);
    throw new Error(payload.error || `Permintaan gagal (${response.status}).`);
  }
  return payload;
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "RM";
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function displayError(error) {
  showToast(error.message || "Terjadi kesalahan. Silakan coba kembali.", true);
}

async function login(email, password) {
  const response = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  sessionToken = response.token;
  localStorage.setItem(TOKEN_KEY, sessionToken);
  setUser(response.user);
  $("#login-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  await loadDashboard();
}

function setUser(user) {
  currentUser = user;
  $("#user-name").textContent = user.name;
  $("#user-role").textContent = user.role_label;
  $("#user-avatar").textContent = initials(user.name);
  $("#top-avatar").textContent = initials(user.name);
  $("#greeting-name").textContent = user.role_label;
  const importButton = $("#import-data-button");
  const canImport = user.role === "admin_kabupaten";
  importButton.disabled = !canImport;
  importButton.title = canImport
    ? "Impor CSV profil sekolah"
    : "Hanya admin kabupaten yang dapat mengimpor data";
  const tkaImportButton = $("#tka-import-button");
  tkaImportButton.disabled = !canImport;
  tkaImportButton.title = canImport
    ? "Impor hasil TKA dari Excel atau PDF"
    : "Hanya admin kabupaten yang dapat mengimpor hasil TKA";
  $("#today-label").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date()).toLocaleUpperCase("id-ID");
}

function logout(showMessage = true) {
  const token = sessionToken;
  sessionToken = null;
  localStorage.removeItem(TOKEN_KEY);
  $("#app-screen").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  if (token) fetch("/api/auth/logout", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  if (showMessage) showToast("Anda telah keluar dari dashboard.");
}

async function restoreSession() {
  if (!sessionToken) return;
  try {
    const response = await api("/api/auth/me");
    setUser(response.user);
    $("#login-screen").classList.add("hidden");
    $("#app-screen").classList.remove("hidden");
    await loadDashboard();
  } catch (error) {
    if (error.message) showToast(error.message, true);
  }
}

async function loadDashboard() {
  const year = Number($("#year-filter").value);
  $("#refresh-button").classList.add("is-refreshing");
  try {
    dashboardData = await api(`/api/dashboard?year=${year}`);
    renderDashboard();
    await loadSpmb();
    await loadFacilities(year);
    await loadTkaResults();
    $("#last-updated").textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(dashboardData.updated_at));
  } catch (error) {
    displayError(error);
  } finally {
    $("#refresh-button").classList.remove("is-refreshing");
  }
}

function renderDashboard() {
  if (!dashboardData) return;
  const { summary, schools, districts, trend, alerts, insights } = dashboardData;
  $("#kpi-total").textContent = formatNumber(summary.total);
  $("#kpi-assessed").textContent = `${formatNumber(summary.assessed)} dinilai`;
  $("#kpi-districts").textContent = `${summary.districts} kecamatan`;
  $("#kpi-excellent").textContent = formatNumber(summary.excellent);
  $("#kpi-excellent-change").textContent = summary.assessed ? `↑ ${summary.average}/100` : "Belum ada skor";
  $("#kpi-growing").textContent = formatNumber(summary.growing);
  $("#kpi-stagnant").textContent = formatNumber(summary.stagnant);
  $("#kpi-declining").textContent = formatNumber(summary.declining);
  $("#kpi-priority").textContent = formatNumber(summary.priority);
  $("#nav-school-count").textContent = summary.total;
  $("#nav-alert-count").textContent = alerts.length;
  $("#district-data-year").textContent = `Tahun ${dashboardData.year}`;
  const districtFilter = $("#district-filter");
  const selectedDistrict = districtFilter.value;
  districtFilter.replaceChildren(new Option("Semua kecamatan", ""));
  [...districts].sort((a, b) => a.name.localeCompare(b.name, "id")).forEach((district) => {
    districtFilter.add(new Option(district.name, district.name));
  });
  districtFilter.value = selectedDistrict;
  $("#total-public-schools").textContent = formatNumber(summary.public_schools);
  $("#total-private-schools").textContent = formatNumber(summary.private_schools);
  $("#total-students").textContent = formatNumber(summary.students);
  $("#total-classrooms").textContent = formatNumber(summary.classrooms);
  $("#total-teachers").textContent = formatNumber(summary.teachers);
  $("#total-education-staff").textContent = formatNumber(summary.education_staff);
  $("#resource-coverage").textContent = `Jumlah sekolah terdaftar: ${formatNumber(summary.total)} (${formatNumber(summary.assessed)} memiliki penilaian). Data siswa tersedia dari ${formatNumber(summary.student_coverage)} sekolah; rombel ${formatNumber(summary.classroom_coverage)}; guru ${formatNumber(summary.teacher_coverage)}; tenaga kependidikan ${formatNumber(summary.staff_coverage)}. Nilai kosong tidak dihitung sebagai nol.`;
  $("#map-average").innerHTML = summary.assessed
    ? `${summary.average}<small>/100</small>`
    : '—<small>belum dinilai</small>';
  $("#map-best-district").textContent = summary.assessed ? districts.find((item) => item.average != null)?.name || "—" : "Belum dinilai";
  $("#trend-footnote").textContent = summary.assessed
    ? `${summary.change >= 0 ? "Indeks mutu meningkat" : "Indeks mutu menurun"} ${Math.abs(summary.change)} poin dibanding tahun sebelumnya. Prediksi rerata ${insights.forecast_average}/100.`
    : `Belum ada data penilaian untuk tahun ${dashboardData.year}.`;
  $(".chart-years").textContent = "Indeks per tahun";
  $("#insight-summary").textContent = insights.summary;
  renderTrend(trend);
  renderMap(districts);
  renderDistricts(districts);
  renderDistrictStats(districts);
  renderResourcePages();
  renderRecommendations(insights.recommendations);
  renderAlerts(alerts);
  renderSchools(schools);
  configureAssessmentButton();
  configureSpmbInput();
  configureFacilitiesInput();
}

function renderTkaResults(results) {
  tkaResults = results;
  const districtFilter = $("#tka-district-filter");
  const selectedDistrict = districtFilter.value;
  const districts = [...new Set(results.map((row) => String(row.district || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "id"));
  districtFilter.replaceChildren(new Option("Semua Kecamatan", ""));
  districts.forEach((district) => districtFilter.add(new Option(district, district)));
  districtFilter.value = districts.includes(selectedDistrict) ? selectedDistrict : "";
  const visibleResults = districtFilter.value
    ? results.filter((row) => String(row.district || "").trim() === districtFilter.value)
    : results;
  const body = $("#tka-results-body");
  body.innerHTML = visibleResults.length ? visibleResults.map((row) => {
    const statusClass = String(row.status || "").toLowerCase() === "aktif" ? "status-ok" : "status-warn";
    return `<tr data-school="${escapeHTML(row.school)}" tabindex="-1">
      <td>${escapeHTML(row.school)}</td>
      <td>${escapeHTML(row.jenjang || "SMP")}</td>
      <td>${escapeHTML(row.tka_year || "—")}</td>
      <td><span class="tka-status ${statusClass}">${escapeHTML(row.status)}</span></td>
      <td>${escapeHTML(row.district)}</td>
      <td>${escapeHTML(row.participant_number)}</td>
      <td>${escapeHTML(row.nisn)}</td>
      <td>${escapeHTML(row.name)}</td>
      <td>${escapeHTML(row.birth)}</td>
      <td>${escapeHTML(row.math)}</td>
      <td>${escapeHTML(row.bahasa)}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="11" class="table-empty">${results.length ? "Tidak ada hasil TKA untuk kecamatan ini." : "Belum ada data TKA. Impor berkas Excel, CSV, atau PDF untuk memulai."}</td></tr>`;

  [
    { key: "math", subject: "matematika", label: "TOP 10 MATEMATIKA" },
    { key: "bahasa", subject: "bahasa-indonesia", label: "TOP 10 BAHASA INDONESIA" },
  ].forEach(({ key, subject, label }, index) => {
    const card = $(".tka-kpi-grid").children[index];
    const ranked = [...visibleResults].sort((a, b) => Number(b[key]) - Number(a[key])).slice(0, 10);
    $(".tka-kpi-label", card).textContent = label;
    $(".tka-kpi-badge", card).textContent = ranked.length ? `#${ranked[0][key]}` : "#—";
    $(".tka-kpi-list", card).innerHTML = ranked.length
      ? ranked.map((row, rank) => `<button type="button" class="tka-kpi-item" data-school="${escapeHTML(row.school)}" data-subject="${subject}"><span class="tka-kpi-student"><span>${rank + 1}. ${escapeHTML(row.name)}</span><small>${escapeHTML(row.school)}</small></span><strong>${escapeHTML(row[key])}</strong></button>`).join("")
      : '<div class="tka-kpi-empty">Belum ada hasil</div>';
  });
}

async function loadTkaResults() {
  const response = await api("/api/tka/results");
  renderTkaResults(response.results);
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(value ?? 0);
}

function configureAssessmentButton() {
  const button = $("#open-assessment-button");
  const canAssess = ["admin_kabupaten", "kabid_smp", "pengawas_sekolah"].includes(currentUser?.role);
  button.classList.toggle("hidden", !canAssess);
  $("#open-attendance-button").classList.toggle("hidden", !canAssess);
  if (!canAssess || !dashboardData) return;
  const remaining = dashboardData.schools.filter((school) => !school.assessed).length;
  const assessed = dashboardData.schools.filter((school) => school.assessed).length;
  button.disabled = remaining === 0;
  button.textContent = remaining === 0 ? "Tahun ini lengkap" : `＋ Input penilaian (${formatNumber(remaining)})`;
  button.title = remaining === 0
    ? `Semua sekolah telah memiliki penilaian tahun ${dashboardData.year}.`
    : `Catat penilaian untuk salah satu dari ${remaining} sekolah yang belum dinilai.`;
  $("#open-attendance-button").disabled = assessed === 0;
  $("#open-attendance-button").title = assessed
    ? `Perbarui kehadiran triwulan untuk ${formatNumber(assessed)} sekolah.`
    : "Belum ada sekolah yang dinilai pada tahun ini.";
}

function attendanceQuarterMarkup() {
  return `<div class="attendance-quarter-scroll"><table class="attendance-quarter-table">
    <thead><tr><th>Periode</th><th>Kehadiran guru (%)</th><th>Kehadiran siswa (%)</th></tr></thead>
    <tbody>${[1, 2, 3, 4].map((quarter) => `
      <tr>
        <th scope="row">Triwulan ${quarter}</th>
        <td><input name="teacher_attendance_q${quarter}" type="number" min="0" max="100" step="0.1" placeholder="0–100" aria-label="Kehadiran guru triwulan ${quarter}"></td>
        <td><input name="student_attendance_q${quarter}" type="number" min="0" max="100" step="0.1" placeholder="0–100" aria-label="Kehadiran siswa triwulan ${quarter}"></td>
      </tr>`).join("")}</tbody>
  </table></div>`;
}

function setupAttendanceQuarterForms() {
  $("#assessment-attendance-fields").innerHTML = attendanceQuarterMarkup();
  $("#attendance-update-fields").innerHTML = attendanceQuarterMarkup();
  $("#assessment-form").addEventListener("input", () => updateAttendanceAverage(
    $("#assessment-form"), "#assessment-attendance-average",
  ));
  $("#attendance-form").addEventListener("input", () => updateAttendanceAverage(
    $("#attendance-form"), "#attendance-update-average",
  ));
}

function collectAttendanceQuarters(form) {
  return [1, 2, 3, 4].map((quarter) => {
    const value = (type) => form.elements.namedItem(`${type}_attendance_q${quarter}`).value;
    return {
      quarter,
      teacher_attendance: value("teacher") === "" ? null : Number(value("teacher")),
      student_attendance: value("student") === "" ? null : Number(value("student")),
    };
  }).filter((item) => item.teacher_attendance !== null || item.student_attendance !== null);
}

function attendanceAverage(form, type) {
  const values = [1, 2, 3, 4].map((quarter) => {
    const raw = form.elements.namedItem(`${type}_attendance_q${quarter}`).value;
    return raw === "" ? null : Number(raw);
  }).filter((value) => value !== null && Number.isFinite(value));
  return values.length ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)) : null;
}

function updateAttendanceAverage(form, outputSelector) {
  const teacher = attendanceAverage(form, "teacher");
  const student = attendanceAverage(form, "student");
  $(outputSelector).textContent =
    `Rata-rata: guru ${teacher ?? "—"}% · siswa ${student ?? "—"}%`;
}

async function loadAttendanceQuarterForm() {
  const form = $("#attendance-form");
  form.reset();
  const schoolId = Number($("#attendance-school").value);
  const year = dashboardData.year;
  const response = await api(`/api/attendance/quarterly?school_id=${schoolId}&year=${year}`);
  for (const record of response.quarters) {
    for (const field of ["teacher_attendance", "student_attendance"]) {
      form.elements.namedItem(`${field === "teacher_attendance" ? "teacher" : "student"}_attendance_q${record.quarter}`).value =
        record[field] ?? "";
    }
  }
  updateAttendanceAverage(form, "#attendance-update-average");
}

async function openAttendanceDialog() {
  if (!dashboardData) return;
  const schools = dashboardData.schools
    .filter((school) => school.assessed)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  if (!schools.length) {
    showToast(`Belum ada sekolah yang dinilai pada tahun ${dashboardData.year}.`);
    return;
  }
  $("#attendance-school").innerHTML = schools.map((school) => `
    <option value="${school.id}">${escapeHTML(school.name)} · ${escapeHTML(school.district)}</option>`).join("");
  $("#attendance-year").textContent = dashboardData.year;
  try {
    await loadAttendanceQuarterForm();
    $("#attendance-dialog").showModal();
  } catch (error) {
    displayError(error);
  }
}

async function openAssessmentDialog() {
  if (!dashboardData) return;
  try {
    if (!indicatorCatalog) indicatorCatalog = await api("/api/indicators");
    const schools = [...dashboardData.schools].sort((a, b) => a.name.localeCompare(b.name, "id"));
    const availableSchools = schools.filter((school) => !school.assessed);
    if (!availableSchools.length) {
      showToast(`Semua sekolah telah dinilai untuk tahun ${dashboardData.year}.`);
      return;
    }

    $("#assessment-school").innerHTML = schools.map((school) => `
      <option value="${school.id}" ${school.assessed ? "disabled" : ""}>
        ${escapeHTML(school.name)} · ${escapeHTML(school.district)}${school.assessed ? " · sudah dinilai" : ""}
      </option>`).join("");
    $("#assessment-year").textContent = dashboardData.year;
    $("#assessment-indicators").innerHTML = indicatorCatalog.dimensions.map((dimension, index) => {
      const indicators = indicatorCatalog.indicators.filter((item) => item.dimension_id === dimension.id);
      return `<details class="assessment-dimension" ${index === 0 ? "open" : ""}>
        <summary><span>${escapeHTML(dimension.name)} <small>${Math.round(dimension.weight * 100)}%</small></span><strong id="assessment-progress-${escapeHTML(dimension.id)}">0/${indicators.length}</strong></summary>
        <div class="assessment-indicator-grid">${indicators.map((indicator) => `
          <label for="assessment-${escapeHTML(indicator.id)}">
            <span>${escapeHTML(indicator.name)}${indicator.source === "hasil_tka" ? '<small class="assessment-indicator-source" data-tka-source-status></small>' : ""}</span>
            <input id="assessment-${escapeHTML(indicator.id)}" name="${escapeHTML(indicator.id)}" type="number" min="0" max="100" step="0.1" placeholder="${indicator.source === "hasil_tka" ? "Otomatis dari hasil TKA" : "0–100"}" ${indicator.source === "hasil_tka" ? 'readonly aria-readonly="true" data-tka-indicator' : "required"} data-assessment-indicator data-dimension-id="${escapeHTML(dimension.id)}">
          </label>`).join("")}</div>
      </details>`;
    }).join("");
    $("#assessment-form").reset();
    $("#assessment-school").value = String(availableSchools[0].id);
    $("#assessment-year").textContent = dashboardData.year;
    updateAssessmentTkaIndicator();
    updateAttendanceAverage($("#assessment-form"), "#assessment-attendance-average");
    $("#assessment-dialog").showModal();
  } catch (error) {
    displayError(error);
  }
}

function updateAssessmentProgress() {
  if (!indicatorCatalog) return;
  indicatorCatalog.dimensions.forEach((dimension) => {
    const fields = $$(`[data-assessment-indicator][data-dimension-id="${dimension.id}"]`, $("#assessment-form"));
    const applicableFields = fields.filter((field) => !field.dataset.tkaIndicator || field.value !== "");
    const entered = applicableFields.filter((field) => field.value !== "").length;
    $(`#assessment-progress-${dimension.id}`).textContent = `${entered}/${applicableFields.length}`;
  });
}

function updateAssessmentTkaIndicator() {
  const field = $("[data-tka-indicator]", $("#assessment-form"));
  const status = $("[data-tka-source-status]", $("#assessment-form"));
  const schoolId = Number($("#assessment-school").value);
  const school = dashboardData?.schools.find((item) => item.id === schoolId);
  const normalizeName = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  const sameNameSchools = school
    ? dashboardData.schools.filter((item) => normalizeName(item.name) === normalizeName(school.name))
    : [];
  const matchingResults = school
    ? tkaResults.filter((row) =>
      Number(row.tka_year) === dashboardData.year
      && normalizeName(row.school) === normalizeName(school.name)
      && (row.district
        ? normalizeName(row.district) === normalizeName(school.district)
        : sameNameSchools.length === 1))
    : [];
  field.value = matchingResults.length
    ? (matchingResults.reduce((total, row) => total + (Number(row.math) + Number(row.bahasa)) / 2, 0) / matchingResults.length).toFixed(1)
    : "";
  status.textContent = matchingResults.length
    ? `Otomatis: rerata Matematika dan Bahasa Indonesia dari ${formatNumber(matchingResults.length)} peserta TKA tahun ${dashboardData.year}.`
    : `Data TKA tahun ${dashboardData.year} belum tersedia untuk sekolah ini; indikator tidak ikut dihitung.`;
  updateAssessmentProgress();
}

function renderTrend(points) {
  const chartPoints = points.filter((point) => point.year >= 2026);
  const element = $("#trend-chart");
  $("#trend-year-values").innerHTML = chartPoints.map((point) => `
    <div class="trend-year-value">
      <span>${point.year}</span>
      <strong>${point.quality == null ? "—" : `${point.quality}<small>/100</small>`}</strong>
    </div>`).join("");
  const width = 620;
  const height = 126;
  const padding = { top: 8, right: 12, bottom: 21, left: 3 };
  const x = (index) => padding.left + index * (width - padding.left - padding.right) / Math.max(chartPoints.length - 1, 1);
  const y = (value) => padding.top + (100 - value) * (height - padding.top - padding.bottom) / 100;
  const series = [
    { key: "quality", color: COLOR.indigo },
    { key: "learning", color: COLOR.mint },
  ];
  const gridLines = [100, 80, 60, 40, 20].map((value) =>
    `<line x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}" stroke="${COLOR.grid}" stroke-dasharray="3 4"/>`,
  ).join("");
  const labels = chartPoints.map((point, index) =>
    `<text x="${x(index)}" y="${height - 3}" text-anchor="middle" fill="#9ba4b3" font-size="9">${point.year}</text>`,
  ).join("");
  const paths = series.map(({ key, color }) => {
    const valid = chartPoints.map((point, index) => ({ index, value: point[key] })).filter((point) => point.value != null);
    const line = valid.map((point, index) => `${index ? "L" : "M"}${x(point.index)},${y(point.value)}`).join(" ");
    const circles = valid.map((point) => `<circle cx="${x(point.index)}" cy="${y(point.value)}" r="3" fill="#fff" stroke="${color}" stroke-width="2"><title>${point.value}</title></circle>`).join("");
    return `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${circles}`;
  }).join("");
  element.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${gridLines}${paths}${labels}</svg>`;
}

function renderMap(districts) {
  const map = $("#district-map");
  $$(".map-dot", map).forEach((dot) => dot.remove());
  const ranked = new Map(districts.map((district) => [district.name, district]));
  DISTRICT_POINTS.forEach(([name, left, top]) => {
    const value = ranked.get(name);
    if (!value || value.average == null) return;
    const dot = document.createElement("button");
    dot.className = "map-dot";
    dot.style.left = `${left / 3.1}%`;
    dot.style.top = `${top / 2.04}%`;
    dot.style.backgroundColor = value.average >= 80 ? "#35b78e" : value.average >= 68 ? "#e8b254" : "#e77e76";
    dot.title = `${name}: ${value.average}/100 · ${value.count} sekolah`;
    dot.setAttribute("aria-label", dot.title);
    dot.addEventListener("click", () => {
      $("#school-search").value = "";
      $("#district-filter").value = name;
      visibleSchoolCount = 8;
      renderSchools(dashboardData.schools);
      $("#schools").scrollIntoView({ behavior: "smooth" });
    });
    map.append(dot);
  });
}

function renderDistricts(districts) {
  const rankedDistricts = districts.filter((item) => item.average != null);
  const maximum = Math.max(...rankedDistricts.map((item) => item.average), 1);
  $("#district-rankings").innerHTML = rankedDistricts.length ? rankedDistricts.slice(0, 5).map((item, index) => `
    <div class="ranking-row">
      <span class="rank-number ${index < 3 ? "top-rank" : ""}">${String(index + 1).padStart(2, "0")}</span>
      <span class="rank-name" title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</span>
      <span class="rank-bar"><span class="rank-fill" style="display:block;width:${Math.max(3, item.average / maximum * 100)}%"></span></span>
      <span class="rank-score">${item.average}</span>
    </div>`).join("") : '<div class="alert-empty">Belum ada penilaian pada tahun ini.</div>';
  $(".rank-year").textContent = `Tahun ${dashboardData.year}`;
}

function renderDistrictStats(districts) {
  const ordered = [...districts].sort((a, b) => a.name.localeCompare(b.name, "id"));
  $("#district-stats-body").innerHTML = ordered.map((item) => `
    <tr>
      <td class="district-name-cell">${escapeHTML(item.name)}</td>
      <td class="district-count-cell">${formatNumber(item.school_count)}</td>
      <td>${formatNumber(item.public_schools)}</td>
      <td>${formatNumber(item.private_schools)}</td>
      <td>${item.student_coverage ? formatNumber(item.students) : "—"}</td>
      <td>${item.classroom_coverage ? formatNumber(item.classrooms) : "—"}</td>
      <td>${item.teacher_coverage ? formatNumber(item.teachers) : "—"}</td>
      <td>${item.staff_coverage ? formatNumber(item.education_staff) : "—"}</td>
      <td>${item.average == null ? "Belum dinilai" : `${item.average}/100`}</td>
    </tr>`).join("");
}

function renderResourcePages() {
  $$(".resource-page-year").forEach((element) => {
    element.textContent = `Tahun ${dashboardData.year}`;
  });
}

async function loadFacilities(year = dashboardData.year) {
  facilitiesData = await api(`/api/facilities?year=${year}`);
  renderFacilities();
}

function renderFacilities() {
  if (!facilitiesData) return;
  const { records, summary } = facilitiesData;
  const ratioRequirements = {
    toilet: { field: "toilet_count", limit: 30, card: "#facility-toilet-ratio-count" },
    classroom: { field: "rombel_count", limit: 35, card: "#facility-classroom-ratio-count" },
  };
  const isRatioNonCompliant = (record, type) => {
    const requirement = ratioRequirements[type];
    return record.student_count != null
      && record.student_count > record[requirement.field] * requirement.limit;
  };
  $("#facilities-page-coverage").textContent = `${formatNumber(summary.schools)} sekolah`;
  $("#facilities-page-classrooms").textContent = records.length ? formatNumber(summary.rombel_count) : "—";
  $("#facilities-page-toilets").textContent = records.length ? formatNumber(summary.toilet_count) : "—";
  Object.entries(ratioRequirements).forEach(([type, requirement]) => {
    const assessedCount = records.filter((record) => record.student_count != null).length;
    const nonCompliantCount = records.filter((record) => isRatioNonCompliant(record, type)).length;
    $(requirement.card).textContent = assessedCount ? `${formatNumber(nonCompliantCount)} sekolah` : "—";
  });
  $$(".facility-ratio-card").forEach((card) => {
    const selected = card.dataset.ratioFilter === facilityRatioFilter;
    card.setAttribute("aria-pressed", String(selected));
  });
  $("#facilities-page-severe").textContent = formatNumber(summary.damage_severe);
  $("#facilities-page-moderate").textContent = formatNumber(summary.damage_moderate);
  $("#facilities-page-damage-coverage").textContent =
    `${formatNumber(summary.damage_schools)} / ${formatNumber(summary.schools)} sekolah`;
  const prioritizedRecords = [...records].sort((a, b) => {
    const priority = (record, level) => FACILITY_DAMAGE_TYPES.reduce(
      (total, type) => total + (record[`${type.key}_${level}`] || 0), 0,
    );
    for (const level of ["severe", "moderate", "light"]) {
      const difference = priority(b, level) - priority(a, level);
      if (difference) return difference;
    }
    return a.school_name.localeCompare(b.school_name, "id");
  }).filter((record) => !facilityRatioFilter || isRatioNonCompliant(record, facilityRatioFilter));
  const formatFacilityRatio = (record, type, limit) => {
    if (record.student_count == null) {
      return '<span class="facility-ratio-unavailable">Data siswa belum tersedia</span>';
    }
    const countField = type === "toilet" ? "toilet_count" : "rombel_count";
    const count = record[countField];
    const ratio = count ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(record.student_count / count) : null;
    const compliant = record.student_count <= count * limit;
    const value = record.student_count === 0 ? "0 siswa"
      : ratio == null ? `Tidak ada ${type === "toilet" ? "toilet" : "rombel"}`
        : `${ratio} siswa/unit`;
    return `<span class="facility-ratio-value">${value}</span><span class="facility-ratio-status ${compliant ? "ratio-compliant" : "ratio-noncompliant"}">${compliant ? "Sesuai" : "Kurang"}</span>`;
  };
  const rows = prioritizedRecords.map((record) => {
    const assessed = record.damage_record_school_id != null;
    const damageCounts = Object.fromEntries(
      ["light", "moderate", "severe"].map((level) => [
        level,
        FACILITY_DAMAGE_TYPES.reduce((total, type) => total + (record[`${type.key}_${level}`] || 0), 0),
      ]),
    );
    const priority = !assessed ? ["Belum dinilai", "priority-unrated"]
      : damageCounts.severe ? ["Rusak Berat", "priority-severe"]
        : damageCounts.moderate ? ["Rusak Sedang", "priority-moderate"]
          : damageCounts.light ? ["Rusak Ringan", "priority-light"]
            : ["Baik", "priority-good"];
    const facilityCell = (type) => {
      if (!assessed) return `<td>${formatNumber(record[type.countField])}<span class="facility-condition">Belum dinilai</span></td>`;
      const levels = FACILITY_DAMAGE_LEVELS.map(({ key, short }) =>
        `${short} ${formatNumber(record[`${type.key}_${key}`])}`).join(" · ");
      return `<td>${formatNumber(record[type.countField])}<span class="facility-condition">${levels}</span></td>`;
    };
    return `
    <tr>
      <td>${escapeHTML(record.school_name)}</td>
      <td>${escapeHTML(record.npsn)}</td>
      <td>${escapeHTML(record.district)}</td>
      <td>${escapeHTML(record.status)}</td>
      <td>${record.student_count == null ? "—" : formatNumber(record.student_count)}</td>
      <td>${formatNumber(record.rombel_count)}</td>
      <td>${formatFacilityRatio(record, "classroom", 35)}</td>
      <td>${formatFacilityRatio(record, "toilet", 30)}</td>
      <td><span class="facility-priority ${priority[1]}">${priority[0]}</span></td>
      ${FACILITY_DAMAGE_TYPES.map(facilityCell).join("")}
    </tr>`;
  }).join("");
  const filterStatus = $("#facility-ratio-filter-status");
  filterStatus.textContent = facilityRatioFilter
    ? `Menampilkan ${formatNumber(prioritizedRecords.length)} sekolah yang kurang rasio ${facilityRatioFilter === "toilet" ? "toilet (1 per 30 siswa)" : "rombel (1 per 35 siswa)"}; klik kartu KPI aktif untuk menampilkan semua sekolah.`
    : "";
  $("#facilities-page-body").innerHTML = rows || `
    <tr><td colspan="15" class="table-empty">${facilityRatioFilter
      ? "Tidak ada sekolah dengan data siswa yang kurang memenuhi rasio ini."
      : `Belum ada data sarpras untuk tahun ${facilitiesData.year}.`}</td></tr>`;
}

$$(".facility-ratio-card").forEach((card) => {
  card.addEventListener("click", () => {
    facilityRatioFilter = facilityRatioFilter === card.dataset.ratioFilter ? null : card.dataset.ratioFilter;
    renderFacilities();
    $("#facilities-page-body").scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

function currentAcademicYear() {
    const now = new Date();
    const start = now.getFullYear() - (now.getMonth() < 6 ? 1 : 0);
    return `${start}/${start + 1}`;
}

async function loadSpmb(period = $("#spmb-period-filter").value || null) {
    const query = period ? `?period=${encodeURIComponent(period)}` : "";
    spmbData = await api(`/api/spmb${query}`);
    const selectedPeriod = period || spmbData.period || currentAcademicYear();
    const periods = [...new Set([...spmbData.periods, selectedPeriod])].sort((a, b) => b.localeCompare(a));
    $("#spmb-period-filter").replaceChildren(...periods.map((value) => new Option(value, value)));
    $("#spmb-period-filter").value = selectedPeriod;
    renderSpmb();
}

function renderSpmb() {
    if (!spmbData) return;
    const { records, summary } = spmbData;
    const noData = records.length === 0;
    $("#spmb-total-applicants").textContent = noData ? "—" : formatNumber(summary.applicants);
    $("#spmb-total-accepted").textContent = noData ? "—" : formatNumber(summary.accepted);
    $("#spmb-total-rombel").textContent = noData ? "—" : formatNumber(summary.rombel);
    $("#spmb-school-coverage").textContent = noData ? "—" : `${formatNumber(summary.schools)} sekolah`;
    const rows = records.map((record) => `
      <tr>
        <td>${escapeHTML(record.npsn)}</td>
        <td>${escapeHTML(record.school_name)}</td>
        <td>${record.students_grade_7 == null ? "—" : formatNumber(record.students_grade_7)}</td>
        <td>${record.students_grade_8 == null ? "—" : formatNumber(record.students_grade_8)}</td>
        <td>${record.students_grade_9 == null ? "—" : formatNumber(record.students_grade_9)}</td>
        <td>${formatNumber(record.applicants_total)}</td>
        <td>${formatNumber(record.applicants_prestasi)}</td>
        <td>${formatNumber(record.applicants_afirmasi)}</td>
        <td>${formatNumber(record.applicants_zonasi)}</td>
        <td>${formatNumber(record.applicants_mutasi)}</td>
        <td>${formatNumber(record.accepted_prestasi)}</td>
        <td>${formatNumber(record.accepted_afirmasi)}</td>
        <td>${formatNumber(record.accepted_zonasi)}</td>
        <td>${formatNumber(record.accepted_mutasi)}</td>
        <td>${formatNumber(record.rombel_count)}</td>
      </tr>`).join("");
    $("#student-page-body").innerHTML = rows || `
      <tr><td colspan="15" class="table-empty">Belum ada data SPMB untuk tahun ajaran ${escapeHTML($("#spmb-period-filter").value)}.</td></tr>`;
}

function configureSpmbInput() {
    const canWrite = ["admin_kabupaten", "kabid_smp", "pengawas_sekolah"].includes(currentUser?.role);
    $("#open-spmb-button").classList.toggle("hidden", !canWrite);
}

function configureFacilitiesInput() {
  const canWrite = ["admin_kabupaten", "kabid_smp", "pengawas_sekolah"].includes(currentUser?.role);
  $("#open-facilities-button").classList.toggle("hidden", !canWrite);
  $("#open-facility-damage-button").classList.toggle("hidden", !canWrite);
}

function populateFacilitiesForm() {
  const schoolId = Number($("#facilities-school").value);
  const school = dashboardData?.schools.find((item) => item.id === schoolId);
  $("#facilities-npsn").value = school?.npsn || "";
  $("#facilities-school-name").value = school?.name || "";
  $("#facilities-district").value = school?.district || "";
  $("#facilities-status").value = school?.status || "";
  $("#facilities-year").value = String(dashboardData?.year || "");
  const record = facilitiesData?.records.find((item) => item.school_id === schoolId);
  for (const field of $("#facilities-form").querySelectorAll("[name]")) {
    if (field.name === "school_id" || field.name === "year") continue;
    field.value = record?.[field.name] ?? "";
  }
}

function openFacilitiesDialog() {
  if (!dashboardData) return;
  const schools = [...dashboardData.schools].sort((a, b) => a.name.localeCompare(b.name, "id"));
  $("#facilities-school").innerHTML = schools.map((school) => `
    <option value="${school.id}">${escapeHTML(school.name)} · ${escapeHTML(school.npsn)}</option>`).join("");
  $("#facilities-form").reset();
  $("#facilities-school").value = String(schools[0]?.id || "");
  populateFacilitiesForm();
  $("#facilities-dialog").showModal();
}

function setupFacilityDamageForm() {
  $("#facility-damage-fields").innerHTML = `
    <div class="facility-damage-table-scroll">
      <table class="facility-damage-table">
        <thead><tr>
          <th>Fasilitas</th><th>Unit</th>
          ${FACILITY_DAMAGE_LEVELS.map((level) => `<th>${level.label}</th>`).join("")}
        </tr></thead>
        <tbody>${FACILITY_DAMAGE_TYPES.map((type) => `
          <tr>
            <th scope="row">${type.label}</th>
            <td id="damage-total-${type.key}">—</td>
            ${FACILITY_DAMAGE_LEVELS.map((level) => `
              <td><input aria-label="${type.label} ${level.label}" name="${type.key}_${level.key}" type="number" min="0" max="10000" step="1" required></td>`).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function populateFacilityDamageForm() {
  const form = $("#facility-damage-form");
  const schoolId = Number($("#facility-damage-school").value);
  const record = facilitiesData?.records.find((item) => item.school_id === schoolId);
  $("#facility-damage-year").value = String(dashboardData?.year || "");
  const hasFacilities = Boolean(record);
  $("#facility-damage-warning").textContent = hasFacilities
    ? "Masukkan jumlah unit tiap kondisi. Total kondisi tidak boleh melebihi jumlah unit."
    : "Data sarpras belum tersedia. Simpan data sarpras terlebih dahulu.";
  $("#facility-damage-warning").classList.toggle("facility-damage-warning-error", !hasFacilities);
  for (const type of FACILITY_DAMAGE_TYPES) {
    $(`#damage-total-${type.key}`).textContent = hasFacilities
      ? formatNumber(record[type.countField])
      : "—";
  }
  for (const input of form.querySelectorAll("input[type='number']")) {
    input.disabled = !hasFacilities;
    input.value = record?.[input.name] ?? 0;
    const type = FACILITY_DAMAGE_TYPES.find(({ key }) => input.name.startsWith(`${key}_`));
    input.max = hasFacilities ? record[type.countField] : 10000;
  }
  form.querySelector('button[type="submit"]').disabled = !hasFacilities;
}

function openFacilityDamageDialog() {
  if (!dashboardData) return;
  const schools = [...dashboardData.schools].sort((a, b) => a.name.localeCompare(b.name, "id"));
  $("#facility-damage-school").innerHTML = schools.map((school) => `
    <option value="${school.id}">${escapeHTML(school.name)} · ${escapeHTML(school.npsn)}</option>`).join("");
  $("#facility-damage-form").reset();
  $("#facility-damage-school").value = String(schools[0]?.id || "");
  populateFacilityDamageForm();
  $("#facility-damage-dialog").showModal();
}

function populateSpmbForm() {
    const form = $("#spmb-form");
    const schoolId = Number($("#spmb-school").value);
    const school = dashboardData?.schools.find((item) => item.id === schoolId);
    $("#spmb-school-name").value = school?.name || "";
    const record = spmbData?.records.find((item) => item.npsn === school?.npsn);
    const samePeriodRecord = record && record.school_year === $("#spmb-school-year").value ? record : null;
    for (const field of form.querySelectorAll("[name]")) {
      if (field.name === "school_id" || field.name === "school_year") continue;
      field.value = samePeriodRecord?.[field.name] ?? "";
    }
}

async function openSpmbDialog() {
    if (!dashboardData) return;
    const schools = [...dashboardData.schools].sort((a, b) => a.npsn.localeCompare(b.npsn, "id"));
    $("#spmb-school").innerHTML = schools.map((school) => `
      <option value="${school.id}">${escapeHTML(school.npsn)} · ${escapeHTML(school.name)}</option>`).join("");
    $("#spmb-form").reset();
    $("#spmb-school").value = String(schools[0]?.id || "");
    $("#spmb-school-year").value = $("#spmb-period-filter").value || currentAcademicYear();
    populateSpmbForm();
    $("#spmb-dialog").showModal();
}

function renderRecommendations(recommendations) {
  $("#recommendations").innerHTML = recommendations.slice(0, 4).map((item) => `
    <div class="recommendation-item"><span class="recommendation-check">✓</span><span>${escapeHTML(item)}</span></div>`).join("");
}

function renderAlerts(alerts) {
  $("#alert-total").textContent = `${alerts.length} sinyal`;
  if (!alerts.length) {
    $("#alert-list").innerHTML = `<div class="alert-empty">Tidak ada sinyal peringatan untuk tahun ${dashboardData.year}. Lanjutkan pemantauan rutin.</div>`;
    return;
  }
  $("#alert-list").innerHTML = alerts.slice(0, 4).map((alert) => `
    <button class="alert-row" data-school-id="${alert.school_id}">
      <span class="alert-symbol ${alert.severity === "tinggi" ? "alert-symbol-high" : "alert-symbol-medium"}">${alert.severity === "tinggi" ? "!" : "↗"}</span>
      <span class="alert-copy"><strong>${escapeHTML(alert.title)}</strong><small>${escapeHTML(alert.school)} · ${escapeHTML(alert.district)}</small></span>
      <span class="alert-value">${escapeHTML(alert.value)}</span><span class="alert-chevron">›</span>
    </button>`).join("");
}

function filterSchools(schools) {
  const search = $("#school-search").value.trim().toLocaleLowerCase("id-ID");
  const district = $("#district-filter").value;
  const status = $("#status-filter").value;
  const trend = $("#trend-filter").value;
  return schools.filter((school) =>
    (!search || [school.name, school.npsn, school.district].some((value) => value.toLocaleLowerCase("id-ID").includes(search)))
    && (!district || school.district === district)
    && (!status || school.status === status)
    && (!trend || school.trend === trend),
  );
}

function renderSchools(schools) {
  const filtered = filterSchools(schools);
  const shown = filtered.slice(0, visibleSchoolCount);
  $("#school-count-label").textContent = `Menampilkan ${shown.length} dari ${filtered.length} sekolah`;
  $("#load-more-button").classList.toggle("hidden", filtered.length <= visibleSchoolCount);
  $("#schools-table-body").innerHTML = shown.length ? shown.map((school) => {
    const trendClass = !school.assessed ? "trend-unrated" : school.trend.includes("Menurun") ? "trend-negative" : school.trend === "Stabil" ? "trend-stable" : "trend-positive";
    const riskClass = !school.assessed ? "risk-unrated" : school.risk === "Tinggi" ? "risk-high" : school.risk === "Sedang" ? "risk-medium" : "risk-low";
    const changeClass = !school.assessed ? "" : school.change < 0 ? "change-down" : "change-up";
    const trendArrow = !school.assessed ? "—" : school.trend.includes("Menurun") ? "↘" : school.trend === "Stabil" ? "→" : "↗";
    return `<tr>
      <td><div class="school-cell"><span class="school-monogram">${escapeHTML(initials(school.name))}</span><span><span class="school-title">${escapeHTML(school.name)}</span><span class="school-code">${escapeHTML(school.npsn)}</span></span></div></td>
      <td>${escapeHTML(school.principal_name || "Belum diisi")}</td>
      <td>${escapeHTML(school.accreditation_status || "—")}</td>
      <td>${escapeHTML(school.district)}</td>
      <td><span class="status-pill status-${school.status.toLowerCase()}">${escapeHTML(school.status)}</span></td>
      <td>${school.student_count == null ? "—" : formatNumber(school.student_count)}</td>
      <td>${school.rombel_count == null ? "—" : formatNumber(school.rombel_count)}</td>
      <td>${school.teacher_count == null ? "—" : formatNumber(school.teacher_count)}</td>
      <td>${school.education_staff_count == null ? "—" : formatNumber(school.education_staff_count)}</td>
      <td class="score-cell">${school.quality_score == null ? "—" : `${school.quality_score}<span style="color:#a7afbd;font-weight:400"> /100</span>`}</td>
      <td class="${changeClass}">${school.change == null ? "—" : `${school.change > 0 ? "+" : ""}${school.change} poin`}</td>
      <td><span class="trend-pill ${trendClass}">${trendArrow} ${escapeHTML(school.trend)}</span></td>
      <td><span class="risk-pill ${riskClass}">${escapeHTML(school.risk)}</span></td>
      <td><button class="row-action" data-school-id="${school.id}" aria-label="Detail ${escapeHTML(school.name)}">›</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="14" class="table-empty">Tidak ada sekolah yang sesuai dengan filter.</td></tr>`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function openSchoolDetail(schoolId) {
  try {
    const result = await api(`/api/schools/${schoolId}?year=${dashboardData.year}`);
    const record = result.school;
    const years = result.years;
    const trend = record.trend;
    const dimensions = record.dimensions.map((item) => `
      <div class="dimension-row"><span>${escapeHTML(item.name)}</span><span class="dimension-bar"><span class="dimension-fill" style="display:block;width:${item.score}%"></span></span><span class="dimension-value">${item.score}</span></div>`).join("");
    const indicatorGroups = record.dimensions.map((dimension) => {
      const indicators = record.indicators.filter((item) => item.dimension_id === dimension.id);
      return `<details class="indicator-detail"><summary>${escapeHTML(dimension.name)} <span>${indicators.length} indikator</span></summary>${indicators.map((item) => `
        <div class="indicator-row"><span>${escapeHTML(item.name)}</span><strong>${item.score}</strong></div>`).join("")}</details>`;
    }).join("");
    const yearPills = years.map((item) => `<span class="dialog-year">${item.year}<strong>${item.quality_score}</strong></span>`).join("");
    const canEditProfile = ["admin_kabupaten", "kabid_smp"].includes(currentUser?.role);
    const profileContent = canEditProfile
      ? `<form class="school-profile-form" data-school-id="${record.id}">
          <label>Nama kepala sekolah<input name="principal_name" maxlength="160" value="${escapeHTML(record.principal_name || "")}" placeholder="Nama sesuai data resmi"></label>
          <label>NIP kepala sekolah<input name="principal_nip" inputmode="numeric" pattern="[0-9]{18}" maxlength="18" value="${escapeHTML(record.principal_nip || "")}" placeholder="18 digit; kosongkan jika tidak tersedia"></label>
          <label>Status akreditasi sekolah<input name="accreditation_status" maxlength="40" value="${escapeHTML(record.accreditation_status || "")}" placeholder="Contoh: A, B, C, Unggul, Baik"></label>
          <button class="button button-primary button-small" type="submit">Simpan profil sekolah</button>
        </form>`
      : `<div class="school-profile-grid"><div><span>Nama kepala sekolah</span><strong>${escapeHTML(record.principal_name || "Belum tersedia")}</strong></div><div><span>NIP kepala sekolah</span><strong>${escapeHTML(record.principal_nip || "Belum tersedia")}</strong></div><div><span>Status akreditasi</span><strong>${escapeHTML(record.accreditation_status || "Belum tersedia")}</strong></div></div>`;
    const assessmentContent = record.assessed
      ? `<div class="dialog-kpis"><div class="dialog-kpi"><span>Indeks mutu ${record.year}</span><strong>${record.quality_score}<small style="font-size:10px;color:#99a2b1"> /100</small></strong></div><div class="dialog-kpi"><span>Risiko sekolah</span><strong>${escapeHTML(record.risk)}</strong></div><div class="dialog-kpi"><span>Prediksi ${record.year + 1}</span><strong>${record.forecast}</strong></div></div>
        <div class="dialog-section-title">Analisis gap (poin indeks)</div><div class="dialog-note">Dari rerata kecamatan: ${record.gaps.district_average > 0 ? "+" : ""}${record.gaps.district_average} poin · Dari rerata kabupaten: ${record.gaps.county_average > 0 ? "+" : ""}${record.gaps.county_average} poin · Dari sekolah terbaik (${escapeHTML(record.gaps.best_school_name)}): ${record.gaps.best_school} poin.</div>
        <div class="dialog-section-title">Skor tujuh dimensi</div>${dimensions}<div class="indicator-groups">${indicatorGroups}</div>
        <div class="dialog-section-title">Tren indeks mutu · ${escapeHTML(trend)}</div><div class="dialog-trend">${yearPills}</div>
        <div class="dialog-section-title">Indikator peringatan</div><div class="dialog-note">${record.alerts.length ? record.alerts.map((item) => escapeHTML(item.title)).join("<br>") : "Tidak ada indikator yang melewati ambang peringatan pada tahun ini."}<br><br>Kehadiran guru ${record.teacher_attendance}% · Serapan BOSP ${record.bosp_absorption}% · Literasi ${record.literacy_score} · Numerasi ${record.numeracy_score} · Putus sekolah ${record.dropout_rate}%</div>`
      : '<div class="dialog-note">Belum ada data penilaian mutu untuk sekolah ini. Data profil dan sumber daya yang tersedia tetap dapat digunakan.</div>';
    $("#school-dialog-content").innerHTML = `
      <div class="dialog-header"><div><div class="section-kicker">PROFIL SEKOLAH</div><h2>${escapeHTML(record.name)}</h2><p>${escapeHTML(record.district)} · ${escapeHTML(record.status)} · NPSN ${escapeHTML(record.npsn)}</p></div><button class="dialog-close" aria-label="Tutup">×</button></div>
      <div class="dialog-body">
        <div class="dialog-section-title">Identitas kepala sekolah &amp; akreditasi</div>${profileContent}
        <div class="dialog-section-title">Jumlah siswa &amp; sumber daya sekolah · ${record.year}</div><div class="school-resource-grid"><div><span>Siswa</span><strong>${record.student_count == null ? "Belum tersedia" : formatNumber(record.student_count)}</strong></div><div><span>Rombel</span><strong>${record.rombel_count == null ? "Belum tersedia" : formatNumber(record.rombel_count)}</strong></div><div><span>Guru</span><strong>${record.teacher_count == null ? "Belum tersedia" : formatNumber(record.teacher_count)}</strong></div><div><span>Tenaga kependidikan</span><strong>${record.education_staff_count == null ? "Belum tersedia" : formatNumber(record.education_staff_count)}</strong></div></div>
        ${assessmentContent}
      </div>`;
    $("#school-dialog").showModal();
  } catch (error) {
    displayError(error);
  }
}

function downloadCSV(schools, filename = "ruang-mutu-sekolah.csv") {
  const headings = ["NPSN", "Nama sekolah", "Jenjang", "Nama kepala sekolah", "NIP kepala sekolah", "Status akreditasi", "Kecamatan", "Status", "Tahun", "Jumlah siswa", "Jumlah rombel", "Jumlah guru", "Jumlah tenaga kependidikan", "Indeks mutu", "Perubahan", "Tren 5 tahun", "Risiko", "Prediksi tahun berikutnya"];
  const rows = schools.map((item) => [item.npsn, item.name, item.jenjang, item.principal_name, item.principal_nip, item.accreditation_status, item.district, item.status, item.year, item.student_count, item.rombel_count, item.teacher_count, item.education_staff_count, item.quality_score, item.change, item.trend, item.risk, item.forecast]);
  const csv = [headings, ...rows].map((row) => row.map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadXLSX(year) {
  const response = await fetch(`/api/exports/schools.xlsx?year=${year}`, {
    headers: sessionToken ? { Authorization: ["Bearer", sessionToken].join(" ") } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) logout(false);
    throw new Error(payload.error || `Unduhan gagal (${response.status}).`);
  }
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ruang-mutu-sekolah-${year}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openSchoolPDF(schools, year) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Jendela PDF diblokir browser. Izinkan pop-up lalu coba lagi.");
  const headings = ["NPSN", "Nama sekolah", "Jenjang", "Kepala sekolah", "NIP kepala sekolah", "Akreditasi", "Kecamatan", "Status", "Tahun", "Siswa", "Rombel", "Guru", "Tenaga kependidikan", "Indeks mutu", "Perubahan", "Tren", "Risiko", "Prediksi"];
  const columns = ["npsn", "name", "jenjang", "principal_name", "principal_nip", "accreditation_status", "district", "status", "year", "student_count", "rombel_count", "teacher_count", "education_staff_count", "quality_score", "change", "trend", "risk", "forecast"];
  const tableRows = schools.map((school) => `<tr>${columns.map((key) => `<td>${escapeHTML(school[key] == null ? "" : String(school[key]))}</td>`).join("")}</tr>`).join("");
  printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Data SMP Lombok Timur ${year}</title><style>
    @page{size:landscape;margin:10mm}body{font:9px Arial,sans-serif;color:#17243a}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 12px;color:#526078}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd2df;padding:4px;text-align:left;overflow-wrap:anywhere}th{background:#28316e;color:#fff}tr:nth-child(even){background:#f3f5fa}
    </style></head><body><h1>Data SMP Kabupaten Lombok Timur</h1><p>Tahun ${year} · ${schools.length} sekolah · Indeks mutu dan indikator penilaian hanya terisi jika tersedia.</p><table><thead><tr>${headings.map((heading) => `<th>${escapeHTML(heading)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`);
  printWindow.document.close();
}

async function downloadFacilitiesXLSX(year, ratioFilter = "") {
  const query = new URLSearchParams({ year: String(year), ratio: ratioFilter });
  const response = await fetch(`/api/exports/facilities.xlsx?${query}`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) logout(false);
    throw new Error(payload.error || `Unduhan gagal (${response.status}).`);
  }
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ruang-mutu-sarpras-${year}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function openFacilitiesPDF() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Jendela PDF diblokir browser. Izinkan pop-up lalu coba lagi.");
  const year = facilitiesData?.year ?? dashboardData?.year;
  const headings = [...document.querySelectorAll(".facilities-table thead th")]
    .map((cell) => cell.innerText.trim());
  const rows = [...$("#facilities-page-body").querySelectorAll("tr")]
    .filter((row) => row.cells.length === headings.length)
    .map((row) => [...row.cells].map((cell) => cell.innerText.replace(/\s+/g, " ").trim()));
  const tableRows = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHTML(cell)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${headings.length}">Belum ada data sarpras untuk tahun ${escapeHTML(year)}.</td></tr>`;
  const filterLabel = facilityRatioFilter === "toilet"
    ? " · Filter: rasio toilet kurang (1 per 30 siswa)"
    : facilityRatioFilter === "classroom"
      ? " · Filter: rasio rombel kurang (1 per 35 siswa)"
      : "";
  printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Data Sarpras Sekolah ${year}</title><style>
    @page{size:landscape;margin:8mm}body{font:7px Arial,sans-serif;color:#26352c}h1{font-size:16px;margin:0 0 5px}p{margin:0 0 12px;color:#627268}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:1px solid #cbd6cc;padding:4px;text-align:left;overflow-wrap:anywhere;vertical-align:top}th{background:#3d6c4c;color:#fff;font-size:6.5px}tr:nth-child(even){background:#f1f5f0}
    </style></head><body><h1>Data Sarana dan Prasarana Sekolah</h1><p>Kabupaten Lombok Timur · Tahun ${escapeHTML(year)} · ${rows.length} sekolah${escapeHTML(filterLabel)}</p><table><thead><tr>${headings.map((heading) => `<th>${escapeHTML(heading)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`);
  printWindow.document.close();
}

function collectTkaRows() {
  return [...document.querySelectorAll(".tka-table tbody tr")].map((row) => {
    const cells = [...row.querySelectorAll("td")];
    return {
      school: cells[0]?.textContent.trim() || "",
      jenjang: cells[1]?.textContent.trim() || "SMP",
      tka_year: cells[2]?.textContent.trim() || "",
      status: cells[3]?.textContent.trim() || "",
      district: cells[4]?.textContent.trim() || "",
      participantNumber: cells[5]?.textContent.trim() || "",
      nisn: cells[6]?.textContent.trim() || "",
      name: cells[7]?.textContent.trim() || "",
      birth: cells[8]?.textContent.trim() || "",
      math: cells[9]?.textContent.trim() || "",
      bahasa: cells[10]?.textContent.trim() || "",
    };
  });
}

function downloadTkaReport(format) {
  const rows = collectTkaRows();
  const headings = ["Nama Sekolah", "Jenjang", "Tahun TKA", "Status", "Kecamatan", "Nomor Peserta", "NISN", "Nama Peserta", "Tempat, Tanggal Lahir", "Nilai Matematika", "Nilai Bahasa Indonesia"];
  const csv = [headings, ...rows.map((row) => [row.school, row.jenjang, row.tka_year, row.status, row.district, row.participantNumber, row.nisn, row.name, row.birth, row.math, row.bahasa])]
    .map((line) => line.map((field) => `"${String(field ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = format === "pdf" ? "hasil-tka.pdf" : "hasil-tka.xlsx";
  link.click();
  URL.revokeObjectURL(link.href);
}

function openTkaPDF() {
  const rows = collectTkaRows();
  const printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Jendela PDF diblokir browser. Izinkan pop-up lalu coba lagi.");
  const rowsHtml = rows.map((row) => `
    <tr>
      <td>${escapeHTML(row.school)}</td>
      <td>${escapeHTML(row.jenjang)}</td>
      <td>${escapeHTML(row.tka_year || "")}</td>
      <td>${escapeHTML(row.status)}</td>
      <td>${escapeHTML(row.district)}</td>
      <td>${escapeHTML(row.participantNumber)}</td>
      <td>${escapeHTML(row.nisn)}</td>
      <td>${escapeHTML(row.name)}</td>
      <td>${escapeHTML(row.birth)}</td>
      <td>${escapeHTML(row.math)}</td>
      <td>${escapeHTML(row.bahasa)}</td>
    </tr>
  `).join("");
  printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Hasil TKA</title><style>
    @page{size:landscape;margin:10mm}body{font:9px Arial,sans-serif;color:#17243a}h1{font-size:16px;margin:0 0 6px}p{margin:0 0 12px;color:#526078}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd2df;padding:5px;text-align:left;overflow-wrap:anywhere}th{background:#28316e;color:#fff}tr:nth-child(even){background:#f3f5fa}
    </style></head><body><h1>Hasil TKA</h1><p>Daftar hasil asesmen peserta didik.</p><table><thead><tr><th>Nama Sekolah</th><th>Jenjang</th><th>Tahun TKA</th><th>Status</th><th>Kecamatan</th><th>Nomor Peserta</th><th>NISN</th><th>Nama Peserta</th><th>Tempat, Tanggal Lahir</th><th>Nilai Matematika</th><th>Nilai Bahasa Indonesia</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`);
  printWindow.document.close();
}

function closeTkaMenus() {
  ["#tka-download-button", "#tka-import-button"].forEach((buttonSelector) => {
    const button = document.querySelector(buttonSelector);
    const panel = button?.parentElement?.querySelector(".download-menu-options");
    if (button) button.setAttribute("aria-expanded", "false");
    if (panel) panel.hidden = true;
  });
}

function toggleTkaMenu(buttonSelector, panelSelector) {
  const button = document.querySelector(buttonSelector);
  const panel = document.querySelector(panelSelector);
  if (!button || !panel) return;
  const isExpanded = button.getAttribute("aria-expanded") === "true";
  closeTkaMenus();
  button.setAttribute("aria-expanded", String(!isExpanded));
  panel.hidden = isExpanded;
}

document.addEventListener("click", (event) => {
  const insideDownloadMenu = event.target.closest(".tka-menu");
  const insideGlobalDownloadMenu = event.target.closest(".download-menu");
  if (!insideDownloadMenu && !insideGlobalDownloadMenu) {
    closeTkaMenus();
  }
});

document.querySelector("#tka-download-button")?.addEventListener("click", () => {
  toggleTkaMenu("#tka-download-button", "#tka-download-options");
});

document.querySelector("#tka-download-options")?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-export-format]");
  if (!option) return;
  const format = option.dataset.exportFormat;
  closeTkaMenus();
  if (format === "excel") downloadTkaReport("excel");
  if (format === "pdf") openTkaPDF();
  if (format === "template-csv") window.location.href = "/download/tka-template.csv";
});

document.querySelector("#tka-import-button")?.addEventListener("click", () => {
  toggleTkaMenu("#tka-import-button", "#tka-import-options");
});

document.querySelector("#tka-import-options")?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-import-format]");
  if (!option) return;
  closeTkaMenus();
  const format = option.dataset.importFormat;
  const fileInput = document.querySelector("#tka-import-file");
  fileInput.setAttribute("accept", format === "pdf" ? ".pdf" : format === "csv" ? ".csv" : ".xlsx");
  fileInput.dataset.importFormat = format;
  fileInput.click();
});

document.querySelector("#tka-import-file")?.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const format = event.target.dataset.importFormat || "excel";
  const isPdf = format === "pdf";
  const isCsv = format === "csv";
  if (isPdf && !file.name.toLowerCase().endsWith(".pdf")) {
    displayError(new Error("Format file untuk impor PDF harus berakhir dengan .pdf."));
    event.target.value = "";
    return;
  }
  if (!isPdf && !isCsv && !/\.xlsx$/i.test(file.name)) {
    displayError(new Error("Format file untuk impor Excel harus berakhir dengan .xlsx."));
    event.target.value = "";
    return;
  }
  if (isCsv && !/\.csv$/i.test(file.name)) {
    displayError(new Error("Format file untuk impor CSV harus berakhir dengan .csv."));
    event.target.value = "";
    return;
  }
  const button = $("#tka-import-button");
  button.disabled = true;
  try {
    const formData = new FormData();
    formData.append("file", file);
    const result = await api("/api/tka/import", { method: "POST", body: formData });
    renderTkaResults(result.results);
    await loadDashboard();
    showToast(`${result.count} hasil TKA berhasil dimuat ke tabel.`);
  } catch (error) {
    displayError(error);
  } finally {
    button.disabled = currentUser?.role !== "admin_kabupaten";
    event.target.value = "";
  }
});

function setTkaTableVisible(visible) {
  $("#tka-table-section").hidden = !visible;
  $("#tka-toggle-data").setAttribute("aria-expanded", String(visible));
  $("#tka-toggle-data").textContent = visible ? "Sembunyikan Data" : "Lihat Data";
}

$("#tka-toggle-data").addEventListener("click", () => {
  setTkaTableVisible($("#tka-table-section").hidden);
});

$("#tka-district-filter").addEventListener("change", () => renderTkaResults(tkaResults));

$("#download-data-button").addEventListener("click", () => {
  const options = $("#download-data-options");
  const isExpanded = $("#download-data-button").getAttribute("aria-expanded") === "true";
  $("#download-data-button").setAttribute("aria-expanded", String(!isExpanded));
  options.hidden = isExpanded;
});
$("#download-data-options").addEventListener("click", async (event) => {
  const option = event.target.closest("[data-export-format]");
  if (!option || !dashboardData) return;
  const format = option.dataset.exportFormat;
  const schools = dashboardData.schools;
  const year = dashboardData.year;
  $("#download-data-options").hidden = true;
  $("#download-data-button").setAttribute("aria-expanded", "false");
  try {
    if (format === "xlsx") await downloadXLSX(year);
    if (format === "csv") downloadCSV(schools, `ruang-mutu-sekolah-${year}.csv`);
    if (format === "pdf") openSchoolPDF(schools, year);
  } catch (error) {
    displayError(error);
  }
});

$("#facilities-download-button").addEventListener("click", () => {
  const button = $("#facilities-download-button");
  const options = $("#facilities-download-options");
  const isExpanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!isExpanded));
  options.hidden = isExpanded;
});
$("#facilities-download-options").addEventListener("click", async (event) => {
  const option = event.target.closest("[data-facilities-export-format]");
  if (!option || !facilitiesData) return;
  const format = option.dataset.facilitiesExportFormat;
  const button = $("#facilities-download-button");
  $("#facilities-download-options").hidden = true;
  button.setAttribute("aria-expanded", "false");
  try {
    if (format === "xlsx") await downloadFacilitiesXLSX(facilitiesData.year, facilityRatioFilter || "");
    if (format === "pdf") openFacilitiesPDF();
  } catch (error) {
    displayError(error);
  }
});
document.addEventListener("click", (event) => {
  if (event.target.closest("#facilities-download-menu")) return;
  $("#facilities-download-options").hidden = true;
  $("#facilities-download-button").setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  $("#facilities-download-options").hidden = true;
  $("#facilities-download-button").setAttribute("aria-expanded", "false");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".download-menu")) {
    $("#download-data-options").hidden = true;
    $("#download-data-button").setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $("#download-data-options").hidden = true;
    $("#download-data-button").setAttribute("aria-expanded", "false");
  }
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorElement = $("#login-error");
  errorElement.textContent = "";
  const button = $(".login-button");
  button.disabled = true;
  button.textContent = "Memeriksa akses...";
  try {
    await login($("#login-email").value.trim(), $("#login-password").value);
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Masuk ke dashboard <span>→</span>';
  }
});

const fillDemoButton = $("#fill-demo");
if (fillDemoButton) {
  fillDemoButton.addEventListener("click", () => {
    $("#login-email").value = "kepala@ruangmutu.id";
    $("#login-password").value = "Dikbud123";
  });
}
$("#import-data-button").addEventListener("click", () => $("#import-data-file").click());
$("#import-data-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const button = $("#import-data-button");
  button.disabled = true;
  try {
    if (file.size > 850_000) throw new Error("Ukuran CSV maksimal 850 KB.");
    let csv;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw new Error("CSV harus menggunakan encoding UTF-8.");
    }
    const result = await api("/api/import/schools", {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
    showToast(`Impor selesai: ${result.inserted} sekolah baru, ${result.updated} diperbarui, ${result.resource_snapshots} snapshot disimpan.`);
    await loadDashboard();
  } catch (error) {
    displayError(error);
  } finally {
    button.disabled = false;
    event.target.value = "";
  }
});
$("#logout-button").addEventListener("click", () => logout());
$("#refresh-button").addEventListener("click", loadDashboard);
$("#year-filter").addEventListener("change", () => {
  visibleSchoolCount = 8;
  loadDashboard();
});
$("#school-search").addEventListener("input", () => renderSchools(dashboardData?.schools || []));
["district-filter", "status-filter", "trend-filter"].forEach((selector) => {
  $(`#${selector}`).addEventListener("change", () => {
    visibleSchoolCount = 8;
    renderSchools(dashboardData?.schools || []);
  });
});
$("#load-more-button").addEventListener("click", () => {
  visibleSchoolCount = Number.MAX_SAFE_INTEGER;
  renderSchools(dashboardData?.schools || []);
});
$("#all-schools-export").addEventListener("click", () => downloadCSV(filterSchools(dashboardData?.schools || [])));
$("#show-priority-button").addEventListener("click", () => {
  $("#trend-filter").value = "";
  $("#school-search").value = "";
  $("#district-filter").value = "";
  $("#status-filter").value = "";
  visibleSchoolCount = Number.MAX_SAFE_INTEGER;
  renderSchools((dashboardData?.schools || []).filter((school) => school.risk === "Tinggi"));
  $("#schools").scrollIntoView({ behavior: "smooth" });
});
$("#schools-table-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-school-id]");
  if (button) openSchoolDetail(button.dataset.schoolId);
});
$("#alert-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-school-id]");
  if (button) openSchoolDetail(button.dataset.schoolId);
});
$("#school-dialog").addEventListener("click", (event) => {
  if (event.target === $("#school-dialog") || event.target.closest(".dialog-close")) $("#school-dialog").close();
});
$("#school-dialog-content").addEventListener("submit", async (event) => {
  const form = event.target.closest(".school-profile-form");
  if (!form) return;
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await api(`/api/schools/${form.dataset.schoolId}`, {
      method: "PATCH",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const schoolId = form.dataset.schoolId;
    $("#school-dialog").close();
    showToast("Profil sekolah berhasil diperbarui.");
    await loadDashboard();
    await openSchoolDetail(schoolId);
  } catch (error) {
    displayError(error);
  } finally {
    submitButton.disabled = false;
  }
});
$("#open-spmb-button").addEventListener("click", openSpmbDialog);
$("#spmb-period-filter").addEventListener("change", (event) => {
  loadSpmb(event.target.value).catch(displayError);
});
$("#spmb-school").addEventListener("change", populateSpmbForm);
$("#spmb-school-year").addEventListener("change", async (event) => {
  try {
    await loadSpmb(event.target.value.trim());
    populateSpmbForm();
  } catch (error) {
    displayError(error);
  }
});
$("#spmb-dialog").addEventListener("click", (event) => {
  if (event.target === $("#spmb-dialog") || event.target.closest("[data-close-spmb]")) {
    $("#spmb-dialog").close();
  }
});
$("#spmb-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const payload = {
    school_id: Number(form.elements.namedItem("school_id").value),
    school_year: form.elements.namedItem("school_year").value.trim(),
  };
  for (const field of form.querySelectorAll("input[type='number']")) {
    payload[field.name] = Number(field.value);
  }
  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan data...";
  try {
    const result = await api("/api/spmb", { method: "POST", body: JSON.stringify(payload) });
    $("#spmb-dialog").close();
    await loadSpmb(result.school_year);
    showToast(result.message);
  } catch (error) {
    displayError(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan data SPMB";
  }
});
setupFacilityDamageForm();
$("#open-facilities-button").addEventListener("click", openFacilitiesDialog);
$("#facilities-school").addEventListener("change", populateFacilitiesForm);
$("#facilities-dialog").addEventListener("click", (event) => {
  if (event.target === $("#facilities-dialog") || event.target.closest("[data-close-facilities]")) {
    $("#facilities-dialog").close();
  }
});
$("#open-facility-damage-button").addEventListener("click", openFacilityDamageDialog);
$("#facility-damage-school").addEventListener("change", populateFacilityDamageForm);
$("#facility-damage-dialog").addEventListener("click", (event) => {
  if (event.target === $("#facility-damage-dialog") || event.target.closest("[data-close-facility-damage]")) {
    $("#facility-damage-dialog").close();
  }
});
$("#facility-damage-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const payload = {
    school_id: Number(form.elements.namedItem("school_id").value),
    year: dashboardData.year,
  };
  for (const field of form.querySelectorAll("input[type='number']")) {
    payload[field.name] = Number(field.value);
  }
  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan tingkat kerusakan...";
  try {
    const result = await api("/api/facilities/damage", { method: "POST", body: JSON.stringify(payload) });
    $("#facility-damage-dialog").close();
    await loadFacilities(result.year);
    showToast(result.message);
  } catch (error) {
    displayError(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan tingkat kerusakan";
  }
});
$("#facilities-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const payload = {
    school_id: Number(form.elements.namedItem("school_id").value),
    year: dashboardData.year,
  };
  for (const field of form.querySelectorAll("input[type='number']")) {
    payload[field.name] = Number(field.value);
  }
  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan data...";
  try {
    const result = await api("/api/facilities", { method: "POST", body: JSON.stringify(payload) });
    $("#facilities-dialog").close();
    await loadFacilities(result.year);
    showToast(result.message);
  } catch (error) {
    displayError(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan data sarpras";
  }
});
setupAttendanceQuarterForms();
$("#open-assessment-button").addEventListener("click", openAssessmentDialog);
$("#open-attendance-button").addEventListener("click", openAttendanceDialog);
$("#assessment-school").addEventListener("change", updateAssessmentTkaIndicator);
$("#attendance-school").addEventListener("change", () => {
  loadAttendanceQuarterForm().catch(displayError);
});
$("#attendance-dialog").addEventListener("click", (event) => {
  if (event.target === $("#attendance-dialog") || event.target.closest("[data-close-attendance]")) {
    $("#attendance-dialog").close();
  }
});
$("#attendance-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const quarters = collectAttendanceQuarters(form);
  if (!quarters.length) {
    showToast("Isi data kehadiran pada setidaknya satu triwulan.", true);
    return;
  }
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan kehadiran...";
  try {
    const result = await api("/api/attendance/quarterly", {
      method: "POST",
      body: JSON.stringify({
        school_id: Number(form.elements.namedItem("school_id").value),
        year: dashboardData.year,
        quarters,
      }),
    });
    await loadDashboard();
    await loadAttendanceQuarterForm();
    showToast(`${result.message} Rata-rata tahunan: guru ${result.averages.teacher_attendance ?? "—"}% · siswa ${result.averages.student_attendance ?? "—"}%.`);
  } catch (error) {
    displayError(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan kehadiran";
  }
});
$("#assessment-dialog").addEventListener("click", (event) => {
  if (event.target === $("#assessment-dialog") || event.target.closest("[data-close-assessment]")) {
    $("#assessment-dialog").close();
  }
});
$("#assessment-form").addEventListener("input", updateAssessmentProgress);
$("#assessment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const value = (name) => form.elements.namedItem(name).value;
  const optionalInteger = (name) => value(name) === "" ? null : Number(value(name));
  const indicators = Object.fromEntries(
    $$("[data-assessment-indicator]:not([data-tka-indicator])", form)
      .map((field) => [field.name, Number(field.value)]),
  );
  const teacherAttendance = attendanceAverage(form, "teacher");
  const studentAttendance = attendanceAverage(form, "student");
  if (teacherAttendance === null || studentAttendance === null) {
    showToast("Isi kehadiran guru dan siswa pada setidaknya satu triwulan.", true);
    return;
  }
  const payload = {
    school_id: Number(value("school_id")),
    year: dashboardData.year,
    teacher_attendance: teacherAttendance,
    student_attendance: studentAttendance,
    attendance_quarters: collectAttendanceQuarters(form),
    bosp_absorption: Number(value("bosp_absorption")),
    literacy_score: Number(value("literacy_score")),
    numeracy_score: Number(value("numeracy_score")),
    dropout_rate: Number(value("dropout_rate")),
    student_count: optionalInteger("student_count"),
    rombel_count: optionalInteger("rombel_count"),
    teacher_count: optionalInteger("teacher_count"),
    education_staff_count: optionalInteger("education_staff_count"),
    achievement_count: optionalInteger("achievement_count") ?? 0,
    indicators,
  };
  submitButton.disabled = true;
  submitButton.textContent = "Menyimpan penilaian...";
  try {
    await api("/api/assessments", { method: "POST", body: JSON.stringify(payload) });
    $("#assessment-dialog").close();
    showToast("Penilaian tersimpan. Analisis dan sinyal peringatan diperbarui.");
    await loadDashboard();
  } catch (error) {
    displayError(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Simpan penilaian";
  }
});
function setSidebarOpen(isOpen) {
  $("#sidebar").classList.toggle("open", isOpen);
  $("#sidebar-backdrop").classList.toggle("visible", isOpen);
  $("#mobile-menu").setAttribute("aria-expanded", String(isOpen));
  $("#mobile-menu").setAttribute("aria-label", isOpen ? "Tutup navigasi" : "Buka navigasi");
}

$("#mobile-menu").addEventListener("click", () => {
  setSidebarOpen(!$("#sidebar").classList.contains("open"));
});
$("#sidebar-backdrop").addEventListener("click", () => setSidebarOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#sidebar").classList.contains("open")) {
    setSidebarOpen(false);
    $("#mobile-menu").focus();
  }
});
function syncNavigation() {
  const activeHash = window.location.hash || "#overview";
  const allNavigations = [...$$(".nav-link"), ...$$(".nav-sub-link")];
  const activeLink = allNavigations.find((link) => link.getAttribute("href") === activeHash);

  $$(".nav-link").forEach((link) => {
    const isStudentsGroup = link.getAttribute("href") === "#students";
    const isActive = link === activeLink || (isStudentsGroup && (activeHash === "#students" || activeHash.startsWith("#students-")));
    link.classList.toggle("active", isActive);
  });

  $$(".nav-sub-link").forEach((link) => {
    link.classList.toggle("active", link === activeLink);
  });

  $("#current-section-label").textContent = activeLink?.dataset.label || "Ringkasan";
  if (activeHash === "#facilities") $(".page-content").dataset.activePage = "facilities";
  else if (activeHash === "#students") $(".page-content").dataset.activePage = "students";
  else if (activeHash.startsWith("#students-")) $(".page-content").dataset.activePage = "students-tka";
  else $(".page-content").dataset.activePage = "";
}

function bindTkaSchoolJump() {
  $(".tka-kpi-grid").addEventListener("click", (event) => {
    const card = event.target.closest(".tka-kpi-item");
    const school = card?.dataset.school;
    if (!school) return;

    setTkaTableVisible(true);
    const rows = [...document.querySelectorAll(".tka-table tbody tr[data-school]")];
    rows.forEach((row) => row.classList.toggle("tka-row-selected", row.dataset.school === school));
    const targetRow = rows.find((row) => row.dataset.school === school);
    if (targetRow) {
      targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
      targetRow.focus();
    }
  });
}

$$(".nav-link, .nav-sub-link").forEach((link) => link.addEventListener("click", () => {
  const activeHash = link.getAttribute("href");
  $$(".nav-link").forEach((item) => {
    const isStudentsGroup = item.getAttribute("href") === "#students";
    item.classList.toggle("active", item === link || (isStudentsGroup && (activeHash === "#students" || activeHash.startsWith("#students-"))));
  });
  $$(".nav-sub-link").forEach((item) => item.classList.toggle("active", item === link));
  $("#current-section-label").textContent = link.dataset.label;
  if (activeHash === "#facilities") $(".page-content").dataset.activePage = "facilities";
  else if (activeHash === "#students") $(".page-content").dataset.activePage = "students";
  else if (activeHash.startsWith("#students-")) $(".page-content").dataset.activePage = "students-tka";
  else $(".page-content").dataset.activePage = "";
  setSidebarOpen(false);
}));

window.addEventListener("hashchange", syncNavigation);
syncNavigation();
bindTkaSchoolJump();

restoreSession();
