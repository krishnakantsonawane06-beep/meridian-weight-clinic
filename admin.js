let allPatients = [];
let query = "";
let genderFilter = "all";
let statusFilter = "all";
let bmiGroupFilter = "all";
let activePatientId = null;

function bmiColor(b) {
  if (b === null || b === undefined) return "#677A71";
  if (b < 18.5) return "#2563EB";
  if (b < 25) return "#0C4334";
  if (b < 30) return "#D97706";
  if (b < 35) return "#C98829";
  return "#B91C1C";
}

function bmiLabel(b) {
  if (b === null || b === undefined) return "—";
  if (b < 18.5) return "Underweight";
  if (b < 25) return "Healthy";
  if (b < 30) return "Overweight";
  if (b < 35) return "Obese I";
  return "Obese II+";
}

function statusBadgeHtml(status) {
  const map = {
    pending: { label: "Pending", cls: "status-pending" },
    in_review: { label: "In Review", cls: "status-in_review" },
    approved: { label: "Approved", cls: "status-approved" },
    consult_scheduled: { label: "Scheduled", cls: "status-consult_scheduled" },
    completed: { label: "Completed", cls: "status-completed" },
  };
  const item = map[status] || map.pending;
  return `<span class="status-pill ${item.cls}">${item.label}</span>`;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ----------------------------------------------------------------
   Analytics & KPIs
------------------------------------------------------------------- */
function updateKPIs() {
  const total = allPatients.length;
  const pending = allPatients.filter((p) => p.status === "pending" || !p.status).length;
  const approved = allPatients.filter((p) => p.status === "approved" || p.status === "consult_scheduled").length;

  const bmis = allPatients.map((p) => p.bmi).filter((b) => typeof b === "number" && !isNaN(b));
  const avgBmi = bmis.length > 0 ? (bmis.reduce((a, b) => a + b, 0) / bmis.length).toFixed(1) : "—";
  const highBmiCount = bmis.filter((b) => b >= 30).length;

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statPending").textContent = pending;
  document.getElementById("statApproved").textContent = approved;
  document.getElementById("statAvgBmi").textContent = avgBmi;
  document.getElementById("statHighBmiCount").textContent = `${highBmiCount} patient${highBmiCount !== 1 ? "s" : ""} with BMI ≥ 30`;
}

/* ----------------------------------------------------------------
   Table Rendering & Filtering
------------------------------------------------------------------- */
function renderTable() {
  updateKPIs();

  const filtered = allPatients.filter((p) => {
    const q = query.toLowerCase().trim();
    const matchesQuery =
      !q ||
      (p.fullName || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      (p.medicalConditions || "").toLowerCase().includes(q) ||
      (p.dietPreference || "").toLowerCase().includes(q);

    const matchesGender = genderFilter === "all" || p.gender === genderFilter;
    const matchesStatus = statusFilter === "all" || (p.status || "pending") === statusFilter;

    let matchesBmi = true;
    if (bmiGroupFilter === "healthy") matchesBmi = p.bmi && p.bmi < 25;
    if (bmiGroupFilter === "overweight") matchesBmi = p.bmi && p.bmi >= 25 && p.bmi < 30;
    if (bmiGroupFilter === "obese") matchesBmi = p.bmi && p.bmi >= 30;

    return matchesQuery && matchesGender && matchesStatus && matchesBmi;
  });

  document.getElementById("countLabel").textContent =
    `Showing ${filtered.length} of ${allPatients.length} patient record${allPatients.length !== 1 ? "s" : ""}`;

  const holder = document.getElementById("tableHolder");

  if (filtered.length === 0) {
    holder.innerHTML = `
      <div class="card card-sm" style="text-align: center; padding: 48px 20px; color: var(--muted);">
        <div style="font-size: 32px; margin-bottom: 8px;">📋</div>
        <h3 class="display" style="font-size: 18px; margin-bottom: 4px;">No matching records found</h3>
        <p style="font-size: 13px;">Try modifying your search criteria or filter selections.</p>
      </div>`;
    return;
  }

  holder.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Patient Profile</th>
            <th>Cohort</th>
            <th>Baseline BMI</th>
            <th>Weight & Goal</th>
            <th>Clinical Status</th>
            <th>Drive Sync</th>
            <th style="text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((p) => {
            const weightDelta = p.weightKg && p.targetWeightKg 
              ? (p.weightKg - p.targetWeightKg).toFixed(1) 
              : null;
            
            const isSynced = Boolean(p.driveFileId);

            return `
              <tr data-id="${p.id}">
                <td>
                  <div style="font-weight: 600; color: var(--ink);">${p.fullName || "Unnamed Patient"}</div>
                  <div style="font-size: 12px; color: var(--muted);">${p.email || p.submittedBy || "—"} · Age ${p.age || "—"}</div>
                </td>
                <td>
                  <span style="font-size: 12px; font-weight: 600; text-transform: capitalize; color: ${p.gender === "female" ? "var(--women)" : p.gender === "male" ? "var(--men)" : "var(--primary)"};">
                    ${p.gender === "female" ? "♀ Female" : p.gender === "male" ? "♂ Male" : "Other"}
                  </span>
                </td>
                <td>
                  <div class="mono" style="font-weight: 700; color: ${bmiColor(p.bmi)}; font-size: 14px;">
                    ${p.bmi ? p.bmi.toFixed(1) : "—"}
                  </div>
                  <div style="font-size: 11px; color: var(--muted-2);">${bmiLabel(p.bmi)}</div>
                </td>
                <td>
                  <div style="font-weight: 500;">${p.weightKg || "—"} kg</div>
                  <div style="font-size: 11px; color: var(--muted-2);">
                    Target: ${p.targetWeightKg || "—"} kg ${weightDelta ? `<span style="color:var(--primary); font-weight:600;">(-${weightDelta} kg)</span>` : ""}
                  </div>
                </td>
                <td>
                  ${statusBadgeHtml(p.status || "pending")}
                </td>
                <td>
                  <button class="btn-link sync-btn" data-id="${p.id}" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:600; color: ${isSynced ? "var(--primary)" : "var(--muted-2)"};">
                    ${isSynced ? "☁ Synced" : "☁ Sync"}
                  </button>
                </td>
                <td style="text-align: right;">
                  <button class="btn btn-secondary btn-sm" style="padding: 5px 12px; font-size: 12px;">
                    View Chart →
                  </button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  // Row click
  holder.querySelectorAll("tbody tr").forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest(".sync-btn")) return;
      openDrawer(tr.dataset.id);
    };
  });

  // Sync button click
  holder.querySelectorAll(".sync-btn").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.textContent = "Syncing...";
      const res = await fetch(`/api/patients/${id}/drive-sync`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const p = allPatients.find((item) => item.id === id);
        if (p) {
          p.driveFileId = data.driveFileId;
          p.driveLink = data.driveLink;
        }
        renderTable();
        showToast(data.simulated ? "Archived to Clinic Drive" : "Synced with Google Drive");
      } else {
        showToast(data.error || "Sync failed");
      }
    };
  });
}

function detailRow(k, v) {
  return `<div class="detail-row"><span class="k">${k}</span><span class="v">${v ?? "—"}</span></div>`;
}

/* ----------------------------------------------------------------
   Slide-out Patient Medical Chart Drawer
------------------------------------------------------------------- */
function openDrawer(id) {
  activePatientId = id;
  const p = allPatients.find((item) => item.id === id);
  if (!p) return;

  const overlay = document.getElementById("drawerOverlay");
  const drawer = document.getElementById("drawer");

  let genderSection = "";
  if (p.gender === "female") {
    genderSection = `
      <div class="section-header" style="color:var(--women);">♀ Women's Health Screen</div>
      ${detailRow("Pregnancy Status", p.pregnancyStatus)}
      ${detailRow("Menstrual Cycle", p.menstrualRegularity)}
      ${detailRow("PCOS Status", p.pcos)}
      ${detailRow("Menopause Stage", p.menopauseStatus)}`;
  } else if (p.gender === "male") {
    genderSection = `
      <div class="section-header" style="color:var(--men);">♂ Men's Health Screen</div>
      ${detailRow("Testosterone Concerns", p.testosteroneConcerns)}
      ${detailRow("Alcohol Intake", p.alcoholFrequency)}`;
  }

  const weightDelta = p.weightKg && p.targetWeightKg 
    ? (p.weightKg - p.targetWeightKg).toFixed(1) 
    : null;

  drawer.innerHTML = `
    <!-- Drawer Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 16px;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <h2 class="display" style="font-size: 24px; margin: 0;">${p.fullName || "Unnamed Patient"}</h2>
          ${statusBadgeHtml(p.status || "pending")}
        </div>
        <p style="color: var(--muted); font-size: 13px; margin: 0;">
          ${p.email || p.submittedBy || ""} · Age ${p.age || "—"} · Cohort: <span style="text-transform:capitalize;">${p.gender || "—"}</span>
        </p>
      </div>
      <button class="btn-link" id="closeDrawer" style="font-size: 18px; padding: 4px 8px;">✕</button>
    </div>

    <!-- Quick Metric Tiles -->
    <div class="stat-grid" style="grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
      <div class="card card-sm" style="padding: 14px; background: var(--surface-subtle);">
        <div style="font-size: 11px; font-weight: 600; color: var(--muted);">BASELINE BMI</div>
        <div class="mono" style="font-size: 22px; font-weight: 700; color: ${bmiColor(p.bmi)};">${p.bmi ? p.bmi.toFixed(1) : "—"}</div>
        <div style="font-size: 11px; color: var(--muted-2);">${bmiLabel(p.bmi)}</div>
      </div>
      <div class="card card-sm" style="padding: 14px; background: var(--surface-subtle);">
        <div style="font-size: 11px; font-weight: 600; color: var(--muted);">WEIGHT DELTA</div>
        <div style="font-size: 20px; font-weight: 700; color: var(--primary);">${weightDelta ? `-${weightDelta} kg` : "—"}</div>
        <div style="font-size: 11px; color: var(--muted-2);">Target: ${p.targetWeightKg || "—"} kg</div>
      </div>
    </div>

    <!-- Interactive Clinical Management Box -->
    <div class="card card-sm" style="border: 1.5px solid var(--primary-border); background: var(--primary-light); margin-bottom: 20px;">
      <div style="font-weight: 700; font-size: 13px; color: var(--primary); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
        <span>🩺</span> Clinical Review & Care Team Plan
      </div>
      
      <div class="field" style="margin-bottom: 12px;">
        <label style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">Update Status</label>
        <select id="drawerStatusSelect" style="padding: 8px 12px; font-size: 13px;">
          <option value="pending" ${p.status === "pending" ? "selected" : ""}>Pending Review</option>
          <option value="in_review" ${p.status === "in_review" ? "selected" : ""}>Under Clinical Review</option>
          <option value="approved" ${p.status === "approved" ? "selected" : ""}>Approved for Treatment</option>
          <option value="consult_scheduled" ${p.status === "consult_scheduled" ? "selected" : ""}>Consultation Scheduled</option>
          <option value="completed" ${p.status === "completed" ? "selected" : ""}>Completed</option>
        </select>
      </div>

      <div class="field" style="margin-bottom: 12px;">
        <label style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">Clinician Notes & Lab Directives</label>
        <textarea id="drawerNotes" style="min-height: 80px; font-size: 13px;" placeholder="Add doctor remarks, prescribed lab panels, medication considerations...">${p.staffNotes || ""}</textarea>
      </div>

      <button class="btn btn-primary btn-sm" id="saveReviewBtn" style="width: 100%;">
        Save Clinical Review ✓
      </button>
    </div>

    <!-- Biometrics -->
    <div class="section-header">Biometric Profile</div>
    ${detailRow("Height", p.heightCm ? `${p.heightCm} cm` : "—")}
    ${detailRow("Current Weight", p.weightKg ? `${p.weightKg} kg` : "—")}
    ${detailRow("Target Goal", p.targetWeightKg ? `${p.targetWeightKg} kg` : "—")}
    ${detailRow("Waist Circumference", p.waistCm ? `${p.waistCm} cm` : "—")}
    ${detailRow("Daily Activity", p.activityLevel)}
    ${detailRow("Sleep Average", p.sleepHours ? `${p.sleepHours} hrs/night` : "—")}

    <!-- Medical Profile -->
    <div class="section-header">Medical History & Allergies</div>
    ${detailRow("Diagnosed Conditions", p.medicalConditions || "None reported")}
    ${detailRow("Allergies", p.allergies || "None reported")}
    ${detailRow("Dietary Preference", p.dietPreference)}

    ${genderSection}

    ${p.motivation ? `
      <div class="section-header">Patient Motivation & Goals</div>
      <p style="font-size: 13px; color: var(--ink-secondary); line-height: 1.6; background: var(--surface-subtle); padding: 12px; border-radius: var(--radius-md);">${p.motivation}</p>
    ` : ""}

    <!-- Action Buttons -->
    <div style="margin-top: 28px; display: flex; flex-direction: column; gap: 10px;">
      <button class="btn btn-secondary" id="drawerSyncBtn" style="width: 100%;">
        ☁ ${p.driveFileId ? "Re-sync to Google Drive / Archive" : "Sync Record to Google Drive"}
      </button>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-ghost btn-sm" id="printChartBtn" style="flex: 1;">
          🖨️ Print Chart
        </button>
        <button class="btn btn-danger btn-sm" id="deleteRecordBtn" style="flex: 1;">
          🗑️ Delete Record
        </button>
      </div>
    </div>
  `;

  overlay.classList.add("show");

  // Bind close
  document.getElementById("closeDrawer").onclick = () => overlay.classList.remove("show");
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  };

  // Bind Save Review
  document.getElementById("saveReviewBtn").onclick = async () => {
    const newStatus = document.getElementById("drawerStatusSelect").value;
    const newNotes = document.getElementById("drawerNotes").value;

    const res = await fetch(`/api/patients/${p.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, staffNotes: newNotes }),
    });

    const data = await res.json();
    if (data.ok) {
      p.status = newStatus;
      p.staffNotes = newNotes;
      renderTable();
      showToast("Clinical review saved successfully");
    } else {
      showToast("Error saving review");
    }
  };

  // Bind Sync
  document.getElementById("drawerSyncBtn").onclick = async () => {
    const res = await fetch(`/api/patients/${p.id}/drive-sync`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      p.driveFileId = data.driveFileId;
      p.driveLink = data.driveLink;
      renderTable();
      showToast(data.simulated ? "Archived to Clinic Drive" : "Synced with Google Drive");
    } else {
      showToast("Sync failed");
    }
  };

  // Bind Print
  document.getElementById("printChartBtn").onclick = () => {
    window.print();
  };

  // Bind Delete
  document.getElementById("deleteRecordBtn").onclick = async () => {
    if (!confirm(`Are you sure you want to delete patient record for ${p.fullName}?`)) return;

    const res = await fetch(`/api/patients/${p.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      allPatients = allPatients.filter((item) => item.id !== p.id);
      overlay.classList.remove("show");
      renderTable();
      showToast("Patient record deleted");
    } else {
      showToast("Error deleting record");
    }
  };
}

/* ----------------------------------------------------------------
   CSV / JSON Export Modal
------------------------------------------------------------------- */
function toCSV() {
  const headers = [
    "ID", "Name", "Age", "Gender", "Email", "Height_cm", "Weight_kg", 
    "TargetWeight_kg", "BMI", "Status", "Activity", "Diet", "MedicalConditions", "Allergies", "StaffNotes"
  ];
  const rows = allPatients.map((p) => [
    p.id,
    `"${(p.fullName || "").replace(/"/g, '""')}"`,
    p.age || "",
    p.gender || "",
    `"${p.email || ""}"`,
    p.heightCm || "",
    p.weightKg || "",
    p.targetWeightKg || "",
    p.bmi || "",
    p.status || "pending",
    `"${(p.activityLevel || "").replace(/"/g, '""')}"`,
    `"${(p.dietPreference || "").replace(/"/g, '""')}"`,
    `"${(p.medicalConditions || "").replace(/"/g, '""')}"`,
    `"${(p.allergies || "").replace(/"/g, '""')}"`,
    `"${(p.staffNotes || "").replace(/"/g, '""')}"`,
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

document.getElementById("exportBtn").onclick = () => {
  const overlay = document.getElementById("exportOverlay");
  const modal = document.getElementById("exportModal");
  const csv = toCSV();
  const json = JSON.stringify(allPatients, null, 2);

  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">
      <div>
        <h3 class="display" style="margin:0; font-size:22px;">Export Patient EHR Records</h3>
        <p style="color:var(--muted); font-size:12px; margin-top:2px;">Formatted for clinical analytics & spreadsheet imports.</p>
      </div>
      <button class="btn-link" id="closeExport" style="font-size:18px;">✕</button>
    </div>

    <div class="field">
      <div class="field-label"><span>CSV Data Preview</span></div>
      <pre style="background:var(--surface-subtle); padding:14px; border-radius:var(--radius-md); font-family:'JetBrains Mono', monospace; font-size:11px; max-height:180px; overflow:auto; color:var(--ink); border:1px solid var(--border);">${csv || "No patient records."}</pre>
    </div>

    <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
      <button class="btn btn-primary" id="downloadCsv" style="flex:1;">
        ⬇ Download CSV
      </button>
      <button class="btn btn-secondary" id="downloadJson" style="flex:1;">
        ⬇ Download JSON
      </button>
      <button class="btn btn-secondary" id="copyCsv">
        📋 Copy CSV
      </button>
    </div>
  `;

  overlay.classList.add("show");
  document.getElementById("closeExport").onclick = () => overlay.classList.remove("show");
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove("show"); };

  document.getElementById("copyCsv").onclick = () => {
    navigator.clipboard.writeText(csv);
    showToast("CSV copied to clipboard");
  };

  document.getElementById("downloadCsv").onclick = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-patients-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded");
  };

  document.getElementById("downloadJson").onclick = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-patients-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("JSON downloaded");
  };
};

/* ----------------------------------------------------------------
   Restore Sample Dataset
------------------------------------------------------------------- */
document.getElementById("resetSeedBtn").onclick = async () => {
  if (!confirm("Restore standard sample clinic dataset?")) return;
  const res = await fetch("/api/admin/reset-seed", { method: "POST" });
  const data = await res.json();
  if (data.ok) {
    allPatients = data.patients;
    renderTable();
    showToast("Sample patient dataset restored");
  }
};

/* ----------------------------------------------------------------
   Filter Event Listeners
------------------------------------------------------------------- */
document.getElementById("search").oninput = (e) => {
  query = e.target.value;
  renderTable();
};

document.getElementById("statusFilter").onchange = (e) => {
  statusFilter = e.target.value;
  renderTable();
};

document.querySelectorAll("[data-gender]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("[data-gender]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    genderFilter = btn.dataset.gender;
    renderTable();
  };
});

document.querySelectorAll("[data-bmigroup]").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll("[data-bmigroup]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    bmiGroupFilter = btn.dataset.bmigroup;
    renderTable();
  };
});

/* ----------------------------------------------------------------
   Init
------------------------------------------------------------------- */
async function init() {
  try {
    const meRes = await fetch("/api/me");
    const me = await meRes.json();
    if (!me.authenticated) {
      window.location.href = "/";
      return;
    }
    if (me.role !== "admin") {
      window.location.href = "/intake.html";
      return;
    }

    document.getElementById("userName").textContent = me.name || "Dr. Vance";
    document.getElementById("userInitial").textContent = (me.name || "D").charAt(0).toUpperCase();

    const res = await fetch("/api/patients");
    allPatients = await res.json();
    renderTable();
  } catch (err) {
    console.error(err);
  }
}

init();
