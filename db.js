const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "patients.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit_logs.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default Seed Users (Pre-hashed with bcrypt)
const DEFAULT_USERS = [
  {
    id: "usr_admin_001",
    name: "Dr. Michael Vance, MD",
    email: "dr.vance@meridianclinic.com",
    passwordHash: "$2b$10$fg.5.q9UjIJhZdLadSX8SewHlH9DikDRTTOFZz4dkhNep7OSwyg.W", // AdminPassword@2026
    role: "admin",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "usr_patient_001",
    name: "Sarah Jenkins",
    email: "sarah.jenkins@example.com",
    passwordHash: "$2b$10$nKd1y2no3/5Z0JUajnslLu/C5XlD9DaHT9pypyriqjAwT6degOJF6", // PatientPassword@2026
    role: "patient",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const DEFAULT_SEED_DATA = [
  {
    id: "1710336000001",
    submittedBy: "sarah.jenkins@example.com",
    submittedAt: "2026-03-10T14:32:00.000Z",
    fullName: "Sarah Jenkins",
    age: "34",
    gender: "female",
    email: "sarah.jenkins@example.com",
    heightCm: "165",
    weightKg: "86.5",
    targetWeightKg: "68.0",
    waistCm: "94",
    activityLevel: "Sedentary",
    sleepHours: "6",
    dietPreference: "No restrictions",
    medicalConditions: "Mild hypertension, elevated fasting blood glucose",
    allergies: "Penicillin",
    pregnancyStatus: "Not pregnant",
    menstrualRegularity: "Irregular",
    pcos: "Yes",
    menopauseStatus: "Pre-menopausal",
    motivation: "Looking to regulate hormonal health, improve daily energy for my children, and achieve sustainable weight reduction under medical supervision.",
    bmi: 31.8,
    status: "in_review",
    staffNotes: "Candidate for GLP-1 metabolic assessment. Requested metabolic panel and HbA1c labs before next week consultation.",
    driveFileId: "sim_drive_1710336000001",
    driveLink: "https://drive.google.com/file/d/sample-meridian-patient-101/view"
  },
  {
    id: "1710336000002",
    submittedBy: "marcus.vance@example.com",
    submittedAt: "2026-03-11T09:15:00.000Z",
    fullName: "Marcus Vance",
    age: "46",
    gender: "male",
    email: "marcus.vance@example.com",
    heightCm: "182",
    weightKg: "104.0",
    targetWeightKg: "88.0",
    waistCm: "108",
    activityLevel: "Lightly active",
    sleepHours: "5.5",
    dietPreference: "Low-carb / Keto",
    medicalConditions: "Sleep apnea (CPAP user), borderline high cholesterol",
    allergies: "Shellfish",
    testosteroneConcerns: "Yes",
    alcoholFrequency: "Weekly",
    motivation: "Joint pain in knees has started affecting daily walking. Need physician-guided protocol to reduce visceral fat and optimize testosterone levels.",
    bmi: 31.4,
    status: "approved",
    staffNotes: "Initial physician consultation completed. Recommended low-inflammatory nutrition protocol and weekly metabolic check-ins.",
    driveFileId: null,
    driveLink: null
  },
  {
    id: "1710336000003",
    submittedBy: "elena.rostova@example.com",
    submittedAt: "2026-03-12T16:45:00.000Z",
    fullName: "Elena Rostova",
    age: "41",
    gender: "female",
    email: "elena.rostova@example.com",
    heightCm: "170",
    weightKg: "76.0",
    targetWeightKg: "64.0",
    waistCm: "82",
    activityLevel: "Moderately active",
    sleepHours: "7.5",
    dietPreference: "Vegetarian",
    medicalConditions: "Hypothyroidism (Levothyroxine 50mcg daily)",
    allergies: "None",
    pregnancyStatus: "Not pregnant",
    menstrualRegularity: "Regular",
    pcos: "No",
    menopauseStatus: "Peri-menopausal",
    motivation: "Metabolism slowed significantly over past two years. Active with pilates and walking, but unable to shed post-pregnancy weight.",
    bmi: 26.3,
    status: "pending",
    staffNotes: "",
    driveFileId: null,
    driveLink: null
  },
  {
    id: "1710336000004",
    submittedBy: "david.chen@example.com",
    submittedAt: "2026-03-13T11:20:00.000Z",
    fullName: "David Chen",
    age: "52",
    gender: "male",
    email: "david.chen@example.com",
    heightCm: "175",
    weightKg: "92.0",
    targetWeightKg: "78.0",
    waistCm: "98",
    activityLevel: "Sedentary",
    sleepHours: "6.5",
    dietPreference: "No restrictions",
    medicalConditions: "Type 2 Diabetes (Metformin 500mg), Fatty Liver (Grade 1)",
    allergies: "Sulfa drugs",
    testosteroneConcerns: "No",
    alcoholFrequency: "Occasionally",
    motivation: "Endocrinologist advised 10-15% weight loss to achieve diabetes remission. Looking for holistic medication and lifestyle coaching.",
    bmi: 30.0,
    status: "consult_scheduled",
    staffNotes: "Consultation booked for Friday with Dr. Vance. Coordinating with his primary care endocrinologist.",
    driveFileId: "sim_drive_1710336000004",
    driveLink: "https://drive.google.com/file/d/sample-meridian-patient-104/view"
  }
];

const useMySQL = Boolean(
  process.env.DB_NAME ||
  process.env.DB_HOST ||
  process.env.USE_MYSQL === "true"
);

let pool = null;
let isConnectedToMySQL = false;

/* ----------------------------------------------------------------
   JSON Fallback Storage Helpers
------------------------------------------------------------------- */
function readJsonUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2));
    return DEFAULT_USERS;
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8") || "[]");
  } catch {
    return DEFAULT_USERS;
  }
}

function writeJsonUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function readJsonPatients() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_SEED_DATA, null, 2));
    return DEFAULT_SEED_DATA;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8") || "[]");
    return Array.isArray(data) && data.length > 0 ? data : DEFAULT_SEED_DATA;
  } catch {
    return DEFAULT_SEED_DATA;
  }
}

function writeJsonPatients(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

function writeJsonAudit(log) {
  try {
    const logs = fs.existsSync(AUDIT_FILE) ? JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8") || "[]") : [];
    logs.unshift({ id: Date.now(), ...log, timestamp: new Date().toISOString() });
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs.slice(0, 500), null, 2));
  } catch {}
}

function formatPatientRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : (row.submitted_at || new Date().toISOString()),
    fullName: row.full_name,
    age: row.age ? String(row.age) : "",
    gender: row.gender,
    email: row.email,
    heightCm: row.height_cm ? String(row.height_cm) : "",
    weightKg: row.weight_kg ? String(row.weight_kg) : "",
    targetWeightKg: row.target_weight_kg ? String(row.target_weight_kg) : "",
    waistCm: row.waist_cm ? String(row.waist_cm) : "",
    bmi: row.bmi ? Number(row.bmi) : null,
    activityLevel: row.activity_level || "Lightly active",
    sleepHours: row.sleep_hours ? String(row.sleep_hours) : "7",
    dietPreference: row.diet_preference || "No restrictions",
    medicalConditions: row.medical_conditions || "",
    allergies: row.allergies || "",
    pregnancyStatus: row.pregnancy_status || "Not pregnant",
    menstrualRegularity: row.menstrual_regularity || "Regular",
    pcos: row.pcos || "No",
    menopauseStatus: row.menopause_status || "Pre-menopausal",
    testosteroneConcerns: row.testosterone_concerns || "No",
    alcoholFrequency: row.alcohol_frequency || "Occasionally",
    motivation: row.motivation || "",
    status: row.status || "pending",
    staffNotes: row.staff_notes || "",
    lastReviewedAt: row.last_reviewed_at instanceof Date ? row.last_reviewed_at.toISOString() : row.last_reviewed_at,
    lastReviewedBy: row.last_reviewed_by || null,
    driveFileId: row.drive_file_id || null,
    driveLink: row.drive_link || null,
  };
}

function formatUserRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    photo: row.photo || null,
    googleId: row.google_id || null,
    lastLogin: row.last_login || null,
    createdAt: row.created_at || null,
  };
}

/* ----------------------------------------------------------------
   Database Initializer & Connection Pool
------------------------------------------------------------------- */
async function initDb() {
  if (!useMySQL) {
    console.log("ℹ MySQL not configured in environment; using secure JSON storage.");
    readJsonUsers();
    readJsonPatients();
    return;
  }

  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "meridian_clinic",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const conn = await pool.getConnection();
    console.log("✓ Connected to MySQL Database:", process.env.DB_NAME || "meridian_clinic");
    isConnectedToMySQL = true;

    // Ensure users table exists with password_hash
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'patient') NOT NULL DEFAULT 'patient',
        photo VARCHAR(500) NULL,
        google_id VARCHAR(120) NULL,
        last_login DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure columns exist if table was created previously without them
    const [cols] = await conn.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
    if (cols.length === 0) {
      await conn.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL AFTER email");
    }
    const [loginCols] = await conn.query("SHOW COLUMNS FROM users LIKE 'last_login'");
    if (loginCols.length === 0) {
      await conn.query("ALTER TABLE users ADD COLUMN last_login DATETIME NULL AFTER google_id");
    }

    // Ensure patients table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR(64) PRIMARY KEY,
        submitted_by VARCHAR(190) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        age INT NULL,
        gender ENUM('female', 'male', 'other') NOT NULL DEFAULT 'female',
        email VARCHAR(190) NULL,
        height_cm DECIMAL(5, 2) NULL,
        weight_kg DECIMAL(5, 2) NULL,
        target_weight_kg DECIMAL(5, 2) NULL,
        waist_cm DECIMAL(5, 2) NULL,
        bmi DECIMAL(4, 1) NULL,
        activity_level VARCHAR(80) DEFAULT 'Lightly active',
        sleep_hours DECIMAL(3, 1) DEFAULT 7.0,
        diet_preference VARCHAR(80) DEFAULT 'No restrictions',
        medical_conditions TEXT NULL,
        allergies VARCHAR(255) NULL,
        pregnancy_status VARCHAR(60) NULL,
        menstrual_regularity VARCHAR(60) NULL,
        pcos VARCHAR(30) NULL,
        menopause_status VARCHAR(60) NULL,
        testosterone_concerns VARCHAR(60) NULL,
        alcohol_frequency VARCHAR(60) NULL,
        motivation TEXT NULL,
        status ENUM('pending', 'in_review', 'approved', 'consult_scheduled', 'completed') NOT NULL DEFAULT 'pending',
        staff_notes TEXT NULL,
        last_reviewed_at DATETIME NULL,
        last_reviewed_by VARCHAR(120) NULL,
        drive_file_id VARCHAR(120) NULL,
        drive_link VARCHAR(500) NULL,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_patients_submitted_by (submitted_by),
        INDEX idx_patients_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure audit_logs table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        actor_email VARCHAR(190) NOT NULL,
        actor_role VARCHAR(40) NOT NULL,
        action VARCHAR(80) NOT NULL,
        target_patient_id VARCHAR(64) NULL,
        details TEXT NULL,
        ip_address VARCHAR(45) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_patient (target_patient_id),
        INDEX idx_audit_actor (actor_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default users if table is empty
    const [uRows] = await conn.query("SELECT COUNT(*) as count FROM users");
    if (uRows[0].count === 0) {
      for (const u of DEFAULT_USERS) {
        await conn.query(
          "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
          [u.id, u.name, u.email, u.passwordHash, u.role]
        );
      }
    }

    // Seed default patients if table is empty
    const [pRows] = await conn.query("SELECT COUNT(*) as count FROM patients");
    if (pRows[0].count === 0) {
      for (const p of DEFAULT_SEED_DATA) {
        await conn.query(`
          INSERT INTO patients (
            id, submitted_by, full_name, age, gender, email,
            height_cm, weight_kg, target_weight_kg, waist_cm, bmi,
            activity_level, sleep_hours, diet_preference, medical_conditions, allergies,
            pregnancy_status, menstrual_regularity, pcos, menopause_status,
            testosterone_concerns, alcohol_frequency, motivation, status, staff_notes, drive_file_id, drive_link
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          p.id, p.submittedBy, p.fullName, parseInt(p.age) || null, p.gender, p.email,
          parseFloat(p.heightCm) || null, parseFloat(p.weightKg) || null, parseFloat(p.targetWeightKg) || null, parseFloat(p.waistCm) || null, p.bmi,
          p.activityLevel, parseFloat(p.sleepHours) || 7.0, p.dietPreference, p.medicalConditions, p.allergies,
          p.pregnancyStatus, p.menstrualRegularity, p.pcos, p.menopauseStatus,
          p.testosteroneConcerns, p.alcoholFrequency, p.motivation, p.status, p.staffNotes, p.driveFileId, p.driveLink
        ]);
      }
    }

    conn.release();
  } catch (err) {
    console.warn("⚠ MySQL connection warning:", err.message);
    console.warn("→ Falling back seamlessly to JSON file storage.");
    isConnectedToMySQL = false;
  }
}

/* ----------------------------------------------------------------
   User Authentication & Security Methods
------------------------------------------------------------------- */
async function findUserByEmail(email) {
  const normEmail = (email || "").toLowerCase().trim();
  if (isConnectedToMySQL && pool) {
    try {
      const [rows] = await pool.query("SELECT * FROM users WHERE LOWER(email) = ?", [normEmail]);
      return rows.length > 0 ? formatUserRow(rows[0]) : null;
    } catch (err) {
      console.error("findUserByEmail error:", err);
    }
  }
  return readJsonUsers().find((u) => (u.email || "").toLowerCase() === normEmail) || null;
}

async function findUserById(id) {
  if (isConnectedToMySQL && pool) {
    try {
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
      return rows.length > 0 ? formatUserRow(rows[0]) : null;
    } catch (err) {
      console.error("findUserById error:", err);
    }
  }
  return readJsonUsers().find((u) => u.id === id) || null;
}

async function createUser({ name, email, password, role }) {
  const normEmail = (email || "").toLowerCase().trim();
  const existing = await findUserByEmail(normEmail);
  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const userId = `usr_${Date.now()}`;

  const newUser = {
    id: userId,
    name: name.trim(),
    email: normEmail,
    passwordHash,
    role: role === "admin" ? "admin" : "patient",
    createdAt: new Date().toISOString(),
  };

  if (isConnectedToMySQL && pool) {
    try {
      await pool.query(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
        [newUser.id, newUser.name, newUser.email, newUser.passwordHash, newUser.role]
      );
    } catch (err) {
      console.error("MySQL createUser error:", err);
    }
  }

  const users = readJsonUsers();
  users.push(newUser);
  writeJsonUsers(users);

  return { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role };
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(plainPassword, passwordHash);
}

async function updateUserLastLogin(userId) {
  const now = new Date();
  if (isConnectedToMySQL && pool) {
    try {
      await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [userId]);
    } catch {}
  }
  const users = readJsonUsers();
  const u = users.find((item) => item.id === userId);
  if (u) {
    u.lastLogin = now.toISOString();
    writeJsonUsers(users);
  }
}

async function createAuditLog({ actorEmail, actorRole, action, targetPatientId, details, ipAddress }) {
  if (isConnectedToMySQL && pool) {
    try {
      await pool.query(
        "INSERT INTO audit_logs (actor_email, actor_role, action, target_patient_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
        [actorEmail || "anonymous", actorRole || "guest", action, targetPatientId || null, details || null, ipAddress || null]
      );
    } catch (err) {
      console.error("Audit log error:", err);
    }
  }
  writeJsonAudit({ actorEmail, actorRole, action, targetPatientId, details, ipAddress });
}

/* ----------------------------------------------------------------
   Patient CRUD Methods
------------------------------------------------------------------- */
async function getAllPatients() {
  if (isConnectedToMySQL && pool) {
    try {
      const [rows] = await pool.query("SELECT * FROM patients ORDER BY submitted_at DESC");
      return rows.map(formatPatientRow);
    } catch (err) {
      console.error("getAllPatients error:", err);
      return readJsonPatients();
    }
  }
  return readJsonPatients();
}

async function getPatientById(id) {
  if (isConnectedToMySQL && pool) {
    try {
      const [rows] = await pool.query("SELECT * FROM patients WHERE id = ?", [id]);
      return rows.length > 0 ? formatPatientRow(rows[0]) : null;
    } catch (err) {
      console.error("getPatientById error:", err);
      return readJsonPatients().find((p) => p.id === id) || null;
    }
  }
  return readJsonPatients().find((p) => p.id === id) || null;
}

async function getPatientsByEmail(email) {
  const normalized = (email || "").toLowerCase().trim();
  if (isConnectedToMySQL && pool) {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM patients WHERE LOWER(submitted_by) = ? OR LOWER(email) = ? ORDER BY submitted_at DESC",
        [normalized, normalized]
      );
      return rows.map(formatPatientRow);
    } catch (err) {
      console.error("getPatientsByEmail error:", err);
      return readJsonPatients().filter(
        (p) => (p.submittedBy || "").toLowerCase() === normalized || (p.email || "").toLowerCase() === normalized
      );
    }
  }
  return readJsonPatients().filter(
    (p) => (p.submittedBy || "").toLowerCase() === normalized || (p.email || "").toLowerCase() === normalized
  );
}

async function createPatient(record) {
  const heightM = parseFloat(record.heightCm) / 100;
  const weightKg = parseFloat(record.weightKg);
  const calculatedBmi = heightM && weightKg ? +(weightKg / (heightM * heightM)).toFixed(1) : (record.bmi || null);

  const newPatient = {
    id: record.id || Date.now().toString(),
    submittedBy: record.submittedBy || record.email || "patient@meridianclinic.com",
    submittedAt: new Date().toISOString(),
    fullName: record.fullName || "",
    age: record.age || "",
    gender: record.gender || "female",
    email: record.email || "",
    heightCm: record.heightCm || "",
    weightKg: record.weightKg || "",
    targetWeightKg: record.targetWeightKg || "",
    waistCm: record.waistCm || "",
    bmi: calculatedBmi,
    activityLevel: record.activityLevel || "Lightly active",
    sleepHours: record.sleepHours || "7",
    dietPreference: record.dietPreference || "No restrictions",
    medicalConditions: record.medicalConditions || "",
    allergies: record.allergies || "",
    pregnancyStatus: record.pregnancyStatus || "Not pregnant",
    menstrualRegularity: record.menstrualRegularity || "Regular",
    pcos: record.pcos || "No",
    menopauseStatus: record.menopauseStatus || "Pre-menopausal",
    testosteroneConcerns: record.testosteroneConcerns || "No",
    alcoholFrequency: record.alcoholFrequency || "Occasionally",
    motivation: record.motivation || "",
    status: record.status || "pending",
    staffNotes: record.staffNotes || "",
    driveFileId: record.driveFileId || null,
    driveLink: record.driveLink || null,
  };

  if (isConnectedToMySQL && pool) {
    try {
      await pool.query(`
        INSERT INTO patients (
          id, submitted_by, full_name, age, gender, email,
          height_cm, weight_kg, target_weight_kg, waist_cm, bmi,
          activity_level, sleep_hours, diet_preference, medical_conditions, allergies,
          pregnancy_status, menstrual_regularity, pcos, menopause_status,
          testosterone_concerns, alcohol_frequency, motivation, status, staff_notes, drive_file_id, drive_link
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newPatient.id, newPatient.submittedBy, newPatient.fullName, parseInt(newPatient.age) || null, newPatient.gender, newPatient.email,
        parseFloat(newPatient.heightCm) || null, parseFloat(newPatient.weightKg) || null, parseFloat(newPatient.targetWeightKg) || null, parseFloat(newPatient.waistCm) || null, newPatient.bmi,
        newPatient.activityLevel, parseFloat(newPatient.sleepHours) || 7.0, newPatient.dietPreference, newPatient.medicalConditions, newPatient.allergies,
        newPatient.pregnancyStatus, newPatient.menstrualRegularity, newPatient.pcos, newPatient.menopauseStatus,
        newPatient.testosteroneConcerns, newPatient.alcoholFrequency, newPatient.motivation, newPatient.status, newPatient.staffNotes, newPatient.driveFileId, newPatient.driveLink
      ]);
    } catch (err) {
      console.error("createPatient MySQL error:", err);
    }
  }

  const jsonList = readJsonPatients();
  jsonList.unshift(newPatient);
  writeJsonPatients(jsonList);

  return newPatient;
}

async function updatePatient(id, updates) {
  const existing = await getPatientById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates };
  const heightM = parseFloat(merged.heightCm) / 100;
  const weightKg = parseFloat(merged.weightKg);
  merged.bmi = heightM && weightKg ? +(weightKg / (heightM * heightM)).toFixed(1) : merged.bmi;

  if (isConnectedToMySQL && pool) {
    try {
      await pool.query(`
        UPDATE patients SET
          full_name = ?, age = ?, gender = ?, email = ?,
          height_cm = ?, weight_kg = ?, target_weight_kg = ?, waist_cm = ?, bmi = ?,
          activity_level = ?, sleep_hours = ?, diet_preference = ?, medical_conditions = ?, allergies = ?,
          pregnancy_status = ?, menstrual_regularity = ?, pcos = ?, menopause_status = ?,
          testosterone_concerns = ?, alcohol_frequency = ?, motivation = ?
        WHERE id = ?
      `, [
        merged.fullName, parseInt(merged.age) || null, merged.gender, merged.email,
        parseFloat(merged.heightCm) || null, parseFloat(merged.weightKg) || null, parseFloat(merged.targetWeightKg) || null, parseFloat(merged.waistCm) || null, merged.bmi,
        merged.activityLevel, parseFloat(merged.sleepHours) || 7.0, merged.dietPreference, merged.medicalConditions, merged.allergies,
        merged.pregnancyStatus, merged.menstrualRegularity, merged.pcos, merged.menopauseStatus,
        merged.testosteroneConcerns, merged.alcoholFrequency, merged.motivation, id
      ]);
    } catch (err) {
      console.error("updatePatient MySQL error:", err);
    }
  }

  const jsonList = readJsonPatients();
  const idx = jsonList.findIndex((p) => p.id === id);
  if (idx !== -1) {
    jsonList[idx] = merged;
    writeJsonPatients(jsonList);
  }

  return merged;
}

async function updatePatientStatus(id, status, staffNotes, reviewerName) {
  const existing = await getPatientById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  existing.status = status !== undefined ? status : existing.status;
  existing.staffNotes = staffNotes !== undefined ? staffNotes : existing.staffNotes;
  existing.lastReviewedAt = now;
  existing.lastReviewedBy = reviewerName || "Clinic Clinician";

  if (isConnectedToMySQL && pool) {
    try {
      await pool.query(`
        UPDATE patients SET
          status = ?, staff_notes = ?, last_reviewed_at = NOW(), last_reviewed_by = ?
        WHERE id = ?
      `, [existing.status, existing.staffNotes, existing.lastReviewedBy, id]);
    } catch (err) {
      console.error("updatePatientStatus MySQL error:", err);
    }
  }

  const jsonList = readJsonPatients();
  const idx = jsonList.findIndex((p) => p.id === id);
  if (idx !== -1) {
    jsonList[idx] = existing;
    writeJsonPatients(jsonList);
  }

  return existing;
}

async function updatePatientDriveSync(id, driveFileId, driveLink) {
  const existing = await getPatientById(id);
  if (!existing) return null;

  existing.driveFileId = driveFileId;
  existing.driveLink = driveLink;

  if (isConnectedToMySQL && pool) {
    try {
      await pool.query("UPDATE patients SET drive_file_id = ?, drive_link = ? WHERE id = ?", [
        driveFileId, driveLink, id
      ]);
    } catch (err) {
      console.error("updatePatientDriveSync MySQL error:", err);
    }
  }

  const jsonList = readJsonPatients();
  const idx = jsonList.findIndex((p) => p.id === id);
  if (idx !== -1) {
    jsonList[idx] = existing;
    writeJsonPatients(jsonList);
  }

  return existing;
}

async function deletePatient(id) {
  if (isConnectedToMySQL && pool) {
    try {
      await pool.query("DELETE FROM patients WHERE id = ?", [id]);
    } catch (err) {
      console.error("deletePatient MySQL error:", err);
    }
  }

  let jsonList = readJsonPatients();
  jsonList = jsonList.filter((p) => p.id !== id);
  writeJsonPatients(jsonList);

  return true;
}

async function resetSeedData() {
  if (isConnectedToMySQL && pool) {
    try {
      await pool.query("DELETE FROM patients");
      for (const p of DEFAULT_SEED_DATA) {
        await pool.query(`
          INSERT INTO patients (
            id, submitted_by, full_name, age, gender, email,
            height_cm, weight_kg, target_weight_kg, waist_cm, bmi,
            activity_level, sleep_hours, diet_preference, medical_conditions, allergies,
            pregnancy_status, menstrual_regularity, pcos, menopause_status,
            testosterone_concerns, alcohol_frequency, motivation, status, staff_notes, drive_file_id, drive_link
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          p.id, p.submittedBy, p.fullName, parseInt(p.age) || null, p.gender, p.email,
          parseFloat(p.heightCm) || null, parseFloat(p.weightKg) || null, parseFloat(p.targetWeightKg) || null, parseFloat(p.waistCm) || null, p.bmi,
          p.activityLevel, parseFloat(p.sleepHours) || 7.0, p.dietPreference, p.medicalConditions, p.allergies,
          p.pregnancyStatus, p.menstrualRegularity, p.pcos, p.menopauseStatus,
          p.testosteroneConcerns, p.alcoholFrequency, p.motivation, p.status, p.staffNotes, p.driveFileId, p.driveLink
        ]);
      }
    } catch (err) {
      console.error("resetSeedData MySQL error:", err);
    }
  }

  writeJsonPatients(DEFAULT_SEED_DATA);
  return DEFAULT_SEED_DATA;
}

module.exports = {
  initDb,
  findUserByEmail,
  findUserById,
  createUser,
  verifyPassword,
  updateUserLastLogin,
  createAuditLog,
  getAllPatients,
  getPatientById,
  getPatientsByEmail,
  createPatient,
  updatePatient,
  updatePatientStatus,
  updatePatientDriveSync,
  deletePatient,
  resetSeedData,
  isMySQLActive: () => isConnectedToMySQL,
};
