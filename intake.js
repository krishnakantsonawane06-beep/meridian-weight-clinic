const STEP_LABELS = ["Personal Basics", "Body & Vitals", "Health Profile", "Goals & Review"];
let step = 0;
let me = null;
let currentRecordId = null;
let unitSystem = "metric"; // "metric" (cm/kg) or "imperial" (ft-in/lbs)

const form = {
  fullName: "",
  age: "",
  gender: "female",
  email: "",
  heightCm: "",
  weightKg: "",
  targetWeightKg: "",
  waistCm: "",
  activityLevel: "Lightly active",
  sleepHours: "7",
  dietPreference: "No restrictions",
  medicalConditions: "",
  allergies: "",
  pregnancyStatus: "Not pregnant",
  menstrualRegularity: "Regular",
  pcos: "No",
  menopauseStatus: "Pre-menopausal",
  testosteroneConcerns: "No",
  alcoholFrequency: "Occasionally",
  motivation: "",
};

// Imperial conversion helpers
function cmToFtIn(cm) {
  if (!cm) return { ft: "", in: "" };
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inRemaining = Math.round(totalInches % 12);
  return { ft, in: inRemaining };
}

function ftInToCm(ft, inches) {
  const f = parseFloat(ft) || 0;
  const i = parseFloat(inches) || 0;
  if (!f && !i) return "";
  return Math.round((f * 12 + i) * 2.54);
}

function kgToLbs(kg) {
  if (!kg) return "";
  return Math.round(parseFloat(kg) * 2.20462 * 10) / 10;
}

function lbsToKg(lbs) {
  if (!lbs) return "";
  return Math.round((parseFloat(lbs) / 2.20462) * 10) / 10;
}

function cmToInches(cm) {
  if (!cm) return "";
  return Math.round((parseFloat(cm) / 2.54) * 10) / 10;
}

function inchesToCm(inches) {
  if (!inches) return "";
  return Math.round(parseFloat(inches) * 2.54);
}

/* ----------------------------------------------------------------
   BMI & Health Calculations
------------------------------------------------------------------- */
function bmi() {
  const h = parseFloat(form.heightCm) / 100;
  const w = parseFloat(form.weightKg);
  if (!h || !w || h <= 0) return null;
  return +(w / (h * h)).toFixed(1);
}

function bmiCategory(b) {
  if (b === null || b === undefined) return { label: "Awaiting Vitals", color: "#677A71", bg: "#EAEFEA", textClass: "text-muted" };
  if (b < 18.5) return { label: "Underweight", color: "#2563EB", bg: "#EFF6FF" };
  if (b < 25) return { label: "Healthy Weight", color: "#0C4334", bg: "#EBF4F0" };
  if (b < 30) return { label: "Overweight (Pre-Obesity)", color: "#D97706", bg: "#FEF3C7" };
  if (b < 35) return { label: "Class I Obesity", color: "#C98829", bg: "#FFF8EB" };
  return { label: "Class II+ Obesity", color: "#B91C1C", bg: "#FEE2E2" };
}

function getHealthyWeightRange() {
  const h = parseFloat(form.heightCm) / 100;
  if (!h || h <= 0) return null;
  const minKg = +(18.5 * h * h).toFixed(1);
  const maxKg = +(24.9 * h * h).toFixed(1);
  if (unitSystem === "imperial") {
    return `${kgToLbs(minKg)} – ${kgToLbs(maxKg)} lbs`;
  }
  return `${minKg} – ${maxKg} kg`;
}

function dialSVG(b, size = 160) {
  const cat = bmiCategory(b);
  const minVal = 14;
  const maxVal = 42;
  const pct = b ? Math.min(Math.max((b - minVal) / (maxVal - minVal), 0.05), 1) : 0;
  const circumference = 283;
  const offset = circumference - pct * circumference;
  const healthyRange = getHealthyWeightRange();

  return `
    <div class="dial-wrap" style="width:100%; max-width:240px; margin:0 auto;">
      <div style="position:relative; width:${size}px; height:${size}px; margin-bottom:6px;">
        <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="transform:rotate(-90deg);">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#E1E8E3" stroke-width="7" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="${cat.color}" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            style="transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease;" />
        </svg>
        <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <span class="dial-value" style="color:var(--ink);">${b ? b.toFixed(1) : "—"}</span>
          <span class="dial-label">Body Mass Index</span>
        </div>
      </div>
      <span class="dial-cat" style="color:${cat.color}; background:${cat.bg};">${cat.label}</span>
      ${healthyRange ? `
        <div style="margin-top:10px; font-size:11px; color:var(--muted); text-align:center;">
          Healthy standard target:<br><strong style="color:var(--ink);">${healthyRange}</strong>
        </div>
      ` : ""}
    </div>`;
}

/* ----------------------------------------------------------------
   Step Navigation Rendering
------------------------------------------------------------------- */
function renderSteps() {
  const el = document.getElementById("steps");
  const pct = (step / (STEP_LABELS.length - 1)) * 100;
  
  el.innerHTML = `
    <div class="step-connector">
      <div class="step-connector-fill" style="width: ${pct}%;"></div>
    </div>
    ${STEP_LABELS.map((label, i) => `
      <div class="step-item">
        <div class="step-dot ${i < step ? "done" : i === step ? "active" : ""}">
          ${i < step ? "✓" : i + 1}
        </div>
        <span class="step-label ${i === step ? "current" : ""}">${label}</span>
      </div>
    `).join("")}
  `;
}

function field(label, inputHtml, hint, rightAction = "") {
  return `
    <div class="field">
      <div class="field-label">
        <span>${label}</span>
        ${rightAction}
      </div>
      ${inputHtml}
      ${hint ? `<span class="hint">${hint}</span>` : ""}
    </div>
  `;
}

/* ----------------------------------------------------------------
   Step Content Views
------------------------------------------------------------------- */
function renderStep() {
  renderSteps();
  const card = document.getElementById("stepCard");

  // Step 0: Basics
  if (step === 0) {
    card.innerHTML = `
      <div style="margin-bottom: 24px;">
        <span class="feature-tag" style="margin-bottom: 8px;">Step 1 of 4</span>
        <h2 class="display" style="font-size: 26px; margin: 0 0 6px;">Personal Background</h2>
        <p style="color: var(--muted); font-size: 14px;">Let's establish your baseline contact and biometric profile.</p>
      </div>

      ${field("Full Name", `<input id="fullName" value="${form.fullName}" placeholder="e.g. Jordan Lee" autocomplete="name" />`)}
      
      <div class="grid-2">
        ${field("Age (Years)", `<input id="age" type="number" min="18" max="110" value="${form.age}" placeholder="e.g. 38" />`)}
        ${field("Contact Email", `<input id="email" type="email" value="${form.email}" placeholder="your.name@example.com" />`)}
      </div>

      <div class="field">
        <div class="field-label">
          <span>Biological Sex / Health Context</span>
        </div>
        <div class="pill-group" style="margin-top: 6px;">
          <button type="button" class="pill ${form.gender === "female" ? "active" : ""}" id="genderFemale" style="${form.gender === "female" ? "background:var(--women); border-color:var(--women);" : ""}">
            ♀ Female (Hormone & Cycle Screening)
          </button>
          <button type="button" class="pill ${form.gender === "male" ? "active" : ""}" id="genderMale" style="${form.gender === "male" ? "background:var(--men); border-color:var(--men);" : ""}">
            ♂ Male (Metabolic & Vitality Screening)
          </button>
          <button type="button" class="pill ${form.gender === "other" ? "active" : ""}" id="genderOther">
            Other / Non-Binary
          </button>
        </div>
        <span class="hint">Used to evaluate gender-specific endocrine and metabolic risk factors.</span>
      </div>

      ${navButtons()}
    `;

    document.getElementById("fullName").oninput = (e) => (form.fullName = e.target.value);
    document.getElementById("age").oninput = (e) => (form.age = e.target.value);
    document.getElementById("email").oninput = (e) => (form.email = e.target.value);
    document.getElementById("genderFemale").onclick = () => { form.gender = "female"; renderStep(); bindNav(); };
    document.getElementById("genderMale").onclick = () => { form.gender = "male"; renderStep(); bindNav(); };
    document.getElementById("genderOther").onclick = () => { form.gender = "other"; renderStep(); bindNav(); };
  }

  // Step 1: Body & Vitals
  if (step === 1) {
    const unitSwitchHtml = `
      <div class="unit-switcher">
        <button type="button" class="unit-btn ${unitSystem === "metric" ? "active" : ""}" id="unitMetric">Metric (cm/kg)</button>
        <button type="button" class="unit-btn ${unitSystem === "imperial" ? "active" : ""}" id="unitImperial">Imperial (ft-in/lbs)</button>
      </div>
    `;

    let vitalsInputsHtml = "";
    if (unitSystem === "metric") {
      vitalsInputsHtml = `
        <div class="grid-2">
          ${field("Height (cm)", `<input id="heightCm" type="number" value="${form.heightCm}" placeholder="e.g. 172" />`)}
          ${field("Current Weight (kg)", `<input id="weightKg" type="number" step="0.1" value="${form.weightKg}" placeholder="e.g. 84.5" />`)}
          ${field("Target Goal Weight (kg)", `<input id="targetWeightKg" type="number" step="0.1" value="${form.targetWeightKg}" placeholder="e.g. 70" />`)}
          ${field("Waist Circumference (cm)", `<input id="waistCm" type="number" value="${form.waistCm}" placeholder="e.g. 92" />`, "Measured at navel level")}
        </div>
      `;
    } else {
      const ftIn = cmToFtIn(form.heightCm);
      const lbs = kgToLbs(form.weightKg);
      const targetLbs = kgToLbs(form.targetWeightKg);
      const waistIn = cmToInches(form.waistCm);

      vitalsInputsHtml = `
        <div class="grid-2">
          <div class="field">
            <div class="field-label"><span>Height (ft & in)</span></div>
            <div style="display:flex; gap:8px;">
              <input id="heightFt" type="number" placeholder="5" value="${ftIn.ft || ""}" style="width:50%;" />
              <input id="heightIn" type="number" placeholder="10" value="${ftIn.in || ""}" style="width:50%;" />
            </div>
          </div>
          ${field("Current Weight (lbs)", `<input id="weightLbs" type="number" step="0.1" value="${lbs}" placeholder="e.g. 185" />`)}
          ${field("Target Goal Weight (lbs)", `<input id="targetWeightLbs" type="number" step="0.1" value="${targetLbs}" placeholder="e.g. 155" />`)}
          ${field("Waist Circumference (inches)", `<input id="waistIn" type="number" step="0.5" value="${waistIn}" placeholder="e.g. 36" />`, "Measured at navel level")}
        </div>
      `;
    }

    card.innerHTML = `
      <div style="margin-bottom: 24px;">
        <span class="feature-tag" style="margin-bottom: 8px;">Step 2 of 4</span>
        <h2 class="display" style="font-size: 26px; margin: 0 0 6px;">Body Composition & Lifestyle</h2>
        <p style="color: var(--muted); font-size: 14px;">Precision vitals to establish metabolic baseline and energy expenditure.</p>
      </div>

      <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
        ${unitSwitchHtml}
      </div>

      <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; align-items: start;">
        <div>
          ${vitalsInputsHtml}
          
          <div class="grid-2" style="margin-top: 10px;">
            ${field("Daily Activity Level", `
              <select id="activityLevel">
                ${["Sedentary (desk job, low movement)", "Lightly active (1-2 workouts/wk)", "Moderately active (3-5 workouts/wk)", "Very active (intense training)"].map((o) => `<option ${form.activityLevel === o ? "selected" : ""}>${o}</option>`).join("")}
              </select>`)}
            ${field("Average Sleep (Hrs / Night)", `<input id="sleepHours" type="number" step="0.5" min="3" max="14" value="${form.sleepHours}" placeholder="7.5" />`)}
          </div>
        </div>

        <div id="dialHolder">
          ${dialSVG(bmi())}
        </div>
      </div>

      ${navButtons()}
    `;

    // Bind unit switcher
    document.getElementById("unitMetric").onclick = () => { unitSystem = "metric"; renderStep(); bindNav(); };
    document.getElementById("unitImperial").onclick = () => { unitSystem = "imperial"; renderStep(); bindNav(); };

    // Bind inputs
    if (unitSystem === "metric") {
      ["heightCm", "weightKg", "targetWeightKg", "waistCm"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
          input.oninput = (e) => {
            form[id] = e.target.value;
            document.getElementById("dialHolder").innerHTML = dialSVG(bmi());
          };
        }
      });
    } else {
      const updateImperial = () => {
        const ft = document.getElementById("heightFt")?.value || "";
        const inches = document.getElementById("heightIn")?.value || "";
        form.heightCm = ftInToCm(ft, inches);

        const lbs = document.getElementById("weightLbs")?.value || "";
        form.weightKg = lbsToKg(lbs);

        const targetLbs = document.getElementById("targetWeightLbs")?.value || "";
        form.targetWeightKg = lbsToKg(targetLbs);

        const waistIn = document.getElementById("waistIn")?.value || "";
        form.waistCm = inchesToCm(waistIn);

        document.getElementById("dialHolder").innerHTML = dialSVG(bmi());
      };

      ["heightFt", "heightIn", "weightLbs", "targetWeightLbs", "waistIn"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.oninput = updateImperial;
      });
    }

    document.getElementById("activityLevel").onchange = (e) => (form.activityLevel = e.target.value);
    document.getElementById("sleepHours").oninput = (e) => (form.sleepHours = e.target.value);
  }

  // Step 2: Health Profile
  if (step === 2) {
    let genderPanel = "";
    if (form.gender === "female") {
      genderPanel = `
        <div class="panel-women">
          <div class="panel-title women">♀ Women's Endocrine & Reproductive Health</div>
          <div class="grid-2">
            ${field("Pregnancy / Nursing Status", `<select id="pregnancyStatus">${["Not pregnant", "Pregnant", "Breastfeeding", "Planning pregnancy within 12 mo"].map(o=>`<option ${form.pregnancyStatus===o?"selected":""}>${o}</option>`).join("")}</select>`)}
            ${field("Menstrual Cycle Regularity", `<select id="menstrualRegularity">${["Regular (24-35 days)", "Irregular", "Post-hysterectomy / Menopause", "N/A"].map(o=>`<option ${form.menstrualRegularity===o?"selected":""}>${o}</option>`).join("")}</select>`)}
            ${field("PCOS Diagnosis", `<select id="pcos">${["No", "Yes — diagnosed", "Suspected symptoms", "Unsure"].map(o=>`<option ${form.pcos===o?"selected":""}>${o}</option>`).join("")}</select>`)}
            ${field("Menopause Stage", `<select id="menopauseStatus">${["Pre-menopausal", "Peri-menopausal (hot flashes, cycle shifts)", "Post-menopausal"].map(o=>`<option ${form.menopauseStatus===o?"selected":""}>${o}</option>`).join("")}</select>`)}
          </div>
        </div>`;
    } else if (form.gender === "male") {
      genderPanel = `
        <div class="panel-men">
          <div class="panel-title men">♂ Men's Vitality & Metabolic Health</div>
          <div class="grid-2">
            ${field("Low Testosterone Symptoms", `<select id="testosteroneConcerns">${["No", "Yes (fatigue, low libido, muscle loss)", "Unsure / Would like lab screening"].map(o=>`<option ${form.testosteroneConcerns===o?"selected":""}>${o}</option>`).join("")}</select>`)}
            ${field("Alcohol Consumption", `<select id="alcoholFrequency">${["Never", "Occasionally (1-2 drinks/month)", "Moderate (1-4 drinks/week)", "Daily / Heavy"].map(o=>`<option ${form.alcoholFrequency===o?"selected":""}>${o}</option>`).join("")}</select>`)}
          </div>
        </div>`;
    }

    card.innerHTML = `
      <div style="margin-bottom: 24px;">
        <span class="feature-tag" style="margin-bottom: 8px;">Step 3 of 4</span>
        <h2 class="display" style="font-size: 26px; margin: 0 0 6px;">Medical & Metabolic Background</h2>
        <p style="color: var(--muted); font-size: 14px;">Screening for contraindications, metabolic syndromes, and personalized medication safety.</p>
      </div>

      <div class="grid-2">
        ${field("Dietary Protocol Preference", `<select id="dietPreference">${["No restrictions", "Mediterranean / Whole Foods", "Low-Carb / Ketogenic", "Vegetarian / Plant-Forward", "Gluten-Free / Anti-Inflammatory", "Diabetic-Friendly"].map(o=>`<option ${form.dietPreference===o?"selected":""}>${o}</option>`).join("")}</select>`)}
        ${field("Known Allergies & Sensitivities", `<input id="allergies" value="${form.allergies}" placeholder="e.g. Penicillin, Sulfa, Shellfish, None" />`)}
      </div>

      ${field("Existing Medical Diagnoses & Medications", `<textarea id="medicalConditions" placeholder="e.g. Hypertension, Thyroid, Type 2 Diabetes, CPAP for sleep apnea, current medications...">${form.medicalConditions}</textarea>`, "List any current prescriptions or chronic conditions for our physicians.")}

      ${genderPanel}

      ${navButtons()}
    `;

    document.getElementById("dietPreference").onchange = (e) => (form.dietPreference = e.target.value);
    document.getElementById("allergies").oninput = (e) => (form.allergies = e.target.value);
    document.getElementById("medicalConditions").oninput = (e) => (form.medicalConditions = e.target.value);

    if (form.gender === "female") {
      ["pregnancyStatus", "menstrualRegularity", "pcos", "menopauseStatus"].forEach((id) => {
        document.getElementById(id).onchange = (e) => (form[id] = e.target.value);
      });
    }
    if (form.gender === "male") {
      ["testosteroneConcerns", "alcoholFrequency"].forEach((id) => {
        document.getElementById(id).onchange = (e) => (form[id] = e.target.value);
      });
    }
  }

  // Step 3: Goals & Review
  if (step === 3) {
    const currentBmi = bmi();
    const weightDelta = form.weightKg && form.targetWeightKg 
      ? +(form.weightKg - form.targetWeightKg).toFixed(1) 
      : null;

    card.innerHTML = `
      <div style="margin-bottom: 24px;">
        <span class="feature-tag" style="margin-bottom: 8px;">Step 4 of 4</span>
        <h2 class="display" style="font-size: 26px; margin: 0 0 6px;">Your Health Vision & Final Review</h2>
        <p style="color: var(--muted); font-size: 14px;">Tell us what you hope to achieve and review your submitted metrics.</p>
      </div>

      ${field("What is your primary motivation & care goal?", `
        <textarea id="motivation" style="min-height: 110px;" placeholder="e.g. Reduce joint pain, increase daily energy for my family, achieve sustainable metabolic health, reverse pre-diabetes...">${form.motivation}</textarea>
      `, "Your dedicated clinician will review this prior to your consultation.")}

      <!-- Intake Review Summary Box -->
      <div class="card card-sm" style="background: var(--surface-subtle); margin-top: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--border); padding-bottom:10px;">
          <h3 class="display" style="font-size: 17px; margin: 0;">Summary Snapshot</h3>
          <span class="status-pill status-in_review" style="font-size: 11px;">Ready for Submission</span>
        </div>

        <div class="grid-2" style="font-size: 13px;">
          <div class="detail-row"><span class="k">Patient:</span><span class="v">${form.fullName || "—"} (${form.age || "—"} yrs)</span></div>
          <div class="detail-row"><span class="k">Gender:</span><span class="v" style="text-transform:capitalize;">${form.gender}</span></div>
          <div class="detail-row"><span class="k">Height / Weight:</span><span class="v">${form.heightCm || "—"} cm · ${form.weightKg || "—"} kg</span></div>
          <div class="detail-row"><span class="k">Target Weight:</span><span class="v">${form.targetWeightKg || "—"} kg ${weightDelta ? `(Δ -${weightDelta} kg)` : ""}</span></div>
          <div class="detail-row"><span class="k">Baseline BMI:</span><span class="v mono">${currentBmi ? `${currentBmi} (${bmiCategory(currentBmi).label})` : "—"}</span></div>
          <div class="detail-row"><span class="k">Dietary Profile:</span><span class="v">${form.dietPreference}</span></div>
        </div>
      </div>

      ${navButtons(true)}
    `;

    document.getElementById("motivation").oninput = (e) => (form.motivation = e.target.value);
  }
}

function navButtons(isLast = false) {
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);">
      <button type="button" class="btn btn-secondary" id="backBtn" style="${step === 0 ? "visibility:hidden;" : ""}">
        ← Previous Step
      </button>
      ${isLast
        ? `<button type="button" class="btn btn-gold" id="submitBtn">Submit Complete Intake ✓</button>`
        : `<button type="button" class="btn btn-primary" id="nextBtn">Continue to Next Step →</button>`}
    </div>`;
}

function bindNav() {
  const back = document.getElementById("backBtn");
  const next = document.getElementById("nextBtn");
  const submit = document.getElementById("submitBtn");

  if (back) {
    back.onclick = () => {
      step = Math.max(0, step - 1);
      renderStep();
      bindNav();
    };
  }

  if (next) {
    next.onclick = () => {
      if (step === 0) {
        if (!form.fullName || !form.fullName.trim()) return showToast("Please enter your full name");
        if (!form.age || parseInt(form.age) <= 0) return showToast("Please enter a valid age");
      }
      if (step === 1) {
        if (!form.heightCm || parseFloat(form.heightCm) <= 50) return showToast("Please enter your height");
        if (!form.weightKg || parseFloat(form.weightKg) <= 20) return showToast("Please enter your weight");
      }
      step += 1;
      renderStep();
      bindNav();
    };
  }

  if (submit) {
    submit.onclick = submitForm;
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* ----------------------------------------------------------------
   Form Submission & Patient Portal Rendering
------------------------------------------------------------------- */
async function submitForm() {
  const payload = { ...form, bmi: bmi() };
  
  let res, data;
  if (currentRecordId) {
    // Updating existing record
    res = await fetch(`/api/patients/${currentRecordId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    data = await res.json();
  } else {
    // New submission
    res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    data = await res.json();
  }

  if (!data.ok) return showToast("Error submitting intake — please try again");

  showToast("Intake saved successfully!");
  displayCarePlan(data.record);
}

function displayCarePlan(record) {
  currentRecordId = record.id;
  document.getElementById("formView").style.display = "none";
  const carePlanView = document.getElementById("carePlanView");
  carePlanView.style.display = "block";

  document.getElementById("carePlanName").textContent = `${record.fullName || "Your"} Care Plan`;
  
  const statusBadge = document.getElementById("carePlanStatusBadge");
  const statusMap = {
    pending: { label: "Pending Physician Review", cls: "status-pending" },
    in_review: { label: "Under Clinical Review", cls: "status-in_review" },
    approved: { label: "Protocol Approved", cls: "status-approved" },
    consult_scheduled: { label: "Consultation Scheduled", cls: "status-consult_scheduled" },
    completed: { label: "Care Completed", cls: "status-completed" },
  };
  const statusInfo = statusMap[record.status] || statusMap.pending;
  statusBadge.className = `status-pill ${statusInfo.cls}`;
  statusBadge.textContent = statusInfo.label;

  // Clinician Note
  const doctorCard = document.getElementById("doctorNoteCard");
  const doctorText = document.getElementById("doctorNoteText");
  if (record.staffNotes && record.staffNotes.trim()) {
    doctorCard.style.display = "block";
    doctorText.textContent = record.staffNotes;
  } else {
    doctorCard.style.display = "none";
  }

  // Stat Grid
  const currentBmi = record.bmi || null;
  const bmiCat = bmiCategory(currentBmi);
  document.getElementById("portalBmi").textContent = currentBmi ? currentBmi.toFixed(1) : "—";
  document.getElementById("portalBmiCategory").textContent = bmiCat.label;
  document.getElementById("portalBmiCategory").style.color = bmiCat.color;

  const targetDelta = record.weightKg && record.targetWeightKg 
    ? (record.weightKg - record.targetWeightKg).toFixed(1) 
    : null;
  document.getElementById("portalWeight").textContent = `${record.weightKg || "—"} kg`;
  document.getElementById("portalTargetDelta").textContent = `Goal: ${record.targetWeightKg || "—"} kg ${targetDelta ? `(-${targetDelta} kg)` : ""}`;

  document.getElementById("portalActivity").textContent = record.activityLevel ? record.activityLevel.split(" ")[0] : "Standard";
  document.getElementById("portalDiet").textContent = record.dietPreference || "Balanced Diet";

  // Detailed rows
  let genderDetails = "";
  if (record.gender === "female") {
    genderDetails = `
      <div class="section-header" style="color:var(--women);">♀ Women's Health Screen</div>
      <div class="detail-row"><span class="k">Pregnancy Status</span><span class="v">${record.pregnancyStatus || "—"}</span></div>
      <div class="detail-row"><span class="k">Cycle Regularity</span><span class="v">${record.menstrualRegularity || "—"}</span></div>
      <div class="detail-row"><span class="k">PCOS</span><span class="v">${record.pcos || "—"}</span></div>
      <div class="detail-row"><span class="k">Menopause</span><span class="v">${record.menopauseStatus || "—"}</span></div>
    `;
  } else if (record.gender === "male") {
    genderDetails = `
      <div class="section-header" style="color:var(--men);">♂ Men's Health Screen</div>
      <div class="detail-row"><span class="k">Testosterone Symptoms</span><span class="v">${record.testosteroneConcerns || "—"}</span></div>
      <div class="detail-row"><span class="k">Alcohol Intake</span><span class="v">${record.alcoholFrequency || "—"}</span></div>
    `;
  }

  document.getElementById("carePlanDetails").innerHTML = `
    <div class="section-header">Biometrics & Body Composition</div>
    <div class="detail-row"><span class="k">Height</span><span class="v">${record.heightCm || "—"} cm (${cmToFtIn(record.heightCm).ft}' ${cmToFtIn(record.heightCm).in}")</span></div>
    <div class="detail-row"><span class="k">Current Weight</span><span class="v">${record.weightKg || "—"} kg (${kgToLbs(record.weightKg)} lbs)</span></div>
    <div class="detail-row"><span class="k">Target Goal Weight</span><span class="v">${record.targetWeightKg || "—"} kg (${kgToLbs(record.targetWeightKg)} lbs)</span></div>
    <div class="detail-row"><span class="k">Waist Circumference</span><span class="v">${record.waistCm ? `${record.waistCm} cm (${cmToInches(record.waistCm)}")` : "—"}</span></div>
    <div class="detail-row"><span class="k">Sleep Average</span><span class="v">${record.sleepHours || "—"} hrs / night</span></div>

    <div class="section-header">Medical Profile & Allergies</div>
    <div class="detail-row"><span class="k">Medical History</span><span class="v">${record.medicalConditions || "None declared"}</span></div>
    <div class="detail-row"><span class="k">Allergies</span><span class="v">${record.allergies || "None reported"}</span></div>
    <div class="detail-row"><span class="k">Dietary Plan</span><span class="v">${record.dietPreference || "Standard"}</span></div>

    ${genderDetails}

    ${record.motivation ? `
      <div class="section-header">Personal Goals & Motivation</div>
      <p style="font-size:13.5px; color:var(--ink-secondary); line-height:1.6; margin-top:8px;">${record.motivation}</p>
    ` : ""}

    <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--muted);">
      <span>Intake ID: <strong>#${record.id}</strong></span>
      <span>Submitted: ${new Date(record.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
    </div>
  `;

  // Bind Update / Edit button
  document.getElementById("editIntakeBtn").onclick = () => {
    // Populate form with existing record
    Object.keys(form).forEach((k) => {
      if (record[k] !== undefined) form[k] = record[k];
    });
    carePlanView.style.display = "none";
    document.getElementById("formView").style.display = "block";
    step = 0;
    renderStep();
    bindNav();
  };

  document.getElementById("printCarePlanBtn").onclick = () => {
    window.print();
  };
}

/* ----------------------------------------------------------------
   Initialization
------------------------------------------------------------------- */
async function init() {
  try {
    const res = await fetch("/api/me");
    me = await res.json();
    if (!me.authenticated) {
      window.location.href = "/";
      return;
    }

    document.getElementById("userName").textContent = me.name || "Patient";
    document.getElementById("userInitial").textContent = (me.name || "P").charAt(0).toUpperCase();

    form.fullName = me.name || "";
    form.email = me.email || "";

    // Check if user has an existing record
    const recordsRes = await fetch("/api/patients/me");
    const myRecords = await recordsRes.json();

    if (Array.isArray(myRecords) && myRecords.length > 0) {
      // Load most recent record
      displayCarePlan(myRecords[0]);
    } else {
      renderStep();
      bindNav();
    }
  } catch (err) {
    console.error(err);
    renderStep();
    bindNav();
  }
}

init();
