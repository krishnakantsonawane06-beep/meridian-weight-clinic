require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { google } = require("googleapis");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const ADMIN_EMAILS = [
  "dr.vance@meridianclinic.com",
  "staff@meridianclinic.com",
  "admin@meridianclinic.com",
  ...(process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase())
].filter(Boolean);

const DATA_DIR = path.join(__dirname, "data");
const ARCHIVE_DIR = path.join(DATA_DIR, "drive-archive");

if (!fs.existsSync(ARCHIVE_DIR)) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

const googleOAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CALLBACK_URL
);

/* ----------------------------------------------------------------
   Express.js Application & Security Middleware Setup
------------------------------------------------------------------- */
const app = express();

// Secure HTTP Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows inline script evaluation for local fast UI rendering
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// Ensure CSS and JS load regardless of folder layout
app.get(["/css/style.css", "/style.css"], (req, res) => {
  const p1 = path.join(__dirname, "public", "css", "style.css");
  const p2 = path.join(__dirname, "style.css");
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.sendFile(path.resolve("style.css"));
});

app.get(["/js/intake.js", "/intake.js"], (req, res) => {
  const p1 = path.join(__dirname, "public", "js", "intake.js");
  const p2 = path.join(__dirname, "intake.js");
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.sendFile(path.resolve("intake.js"));
});

app.get(["/js/admin.js", "/admin.js"], (req, res) => {
  const p1 = path.join(__dirname, "public", "js", "admin.js");
  const p2 = path.join(__dirname, "admin.js");
  if (fs.existsSync(p1)) return res.sendFile(p1);
  if (fs.existsSync(p2)) return res.sendFile(p2);
  res.sendFile(path.resolve("admin.js"));
});

// Ensure root URL '/' always serves index.html
app.get("/", (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(__dirname, "index.html");
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.sendFile(path.resolve("index.html"));
});

// Session Management with Security
app.use(
  session({
    secret: process.env.SESSION_SECRET || "meridian-clinical-secret-key-2026",
    resave: false,
    saveUninitialized: false,
    name: "meridian.sid",
    cookie: {
      httpOnly: true,
      secure: false, // Set to true when running with SSL certificate behind reverse proxy
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

/* ----------------------------------------------------------------
   Passport & Google OAuth Configuration
------------------------------------------------------------------- */
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

if (googleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value?.toLowerCase() || "";
        const user = {
          id: profile.id,
          name: profile.displayName,
          email,
          photo: profile.photos?.[0]?.value,
          role: ADMIN_EMAILS.includes(email) ? "admin" : "patient",
          accessToken,
        };
        done(null, user);
      }
    )
  );
}

app.use(passport.initialize());
app.use(passport.session());

// Rate Limiter for Authentication to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per window
  message: { error: "Too many login attempts from this IP. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ----------------------------------------------------------------
   Auth Status & Direct Endpoints
------------------------------------------------------------------- */
app.get("/api/auth/status", (req, res) => {
  res.json({
    googleOAuth: googleOAuthConfigured,
    authenticated: req.isAuthenticated(),
    user: req.isAuthenticated() ? req.user : null,
    database: {
      type: db.isMySQLActive() ? "MySQL" : "JSON File",
      connected: true,
    },
  });
});

/* ----------------------------------------------------------------
   Secure Registration & Password Sign-in
------------------------------------------------------------------- */

// POST /api/auth/register - Secure User Registration
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, staffCode } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Full name is required." });
    }
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Please provide a valid email address." });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const normEmail = email.trim().toLowerCase();
    
    // Check role security
    let assignedRole = "patient";
    if (role === "admin") {
      const allowedAdmin = ADMIN_EMAILS.includes(normEmail) || staffCode === (process.env.STAFF_ACCESS_KEY || "MERIDIAN2026");
      if (!allowedAdmin) {
        return res.status(403).json({ error: "Staff authorization code or verified staff email required for clinician access." });
      }
      assignedRole = "admin";
    }

    const newUser = await db.createUser({
      name: name.trim(),
      email: normEmail,
      password,
      role: assignedRole,
    });

    // Audit Log
    await db.createAuditLog({
      actorEmail: normEmail,
      actorRole: assignedRole,
      action: "USER_REGISTERED",
      details: `New account created: ${name} (${assignedRole})`,
      ipAddress: req.ip,
    });

    // Automatically sign in the user
    req.login(newUser, (err) => {
      if (err) return res.status(500).json({ error: "Registration succeeded but auto-login failed." });
      return res.json({
        ok: true,
        user: newUser,
        redirect: newUser.role === "admin" ? "/admin.html" : "/intake.html",
      });
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Registration failed." });
  }
});

// POST /api/auth/login - Secure Password Authentication with Bcrypt
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normEmail = email.trim().toLowerCase();
    const user = await db.findUserByEmail(normEmail);

    if (!user || !user.passwordHash) {
      await db.createAuditLog({
        actorEmail: normEmail,
        actorRole: "guest",
        action: "LOGIN_FAILED",
        details: "User not found or invalid credentials",
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isMatch = await db.verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      await db.createAuditLog({
        actorEmail: normEmail,
        actorRole: user.role,
        action: "LOGIN_FAILED",
        details: "Incorrect password entered",
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Success: Update last login and log
    await db.updateUserLastLogin(user.id);
    await db.createAuditLog({
      actorEmail: normEmail,
      actorRole: user.role,
      action: "LOGIN_SUCCESS",
      details: "User signed in securely",
      ipAddress: req.ip,
    });

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      photo: user.photo,
    };

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session regeneration failed." });

      req.login(safeUser, (loginErr) => {
        if (loginErr) return res.status(500).json({ error: "Login failed." });
        return res.json({
          ok: true,
          user: safeUser,
          redirect: safeUser.role === "admin" ? "/admin.html" : "/intake.html",
        });
      });
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "An unexpected error occurred during login." });
  }
});

// One-Click Demo Access
app.post("/api/auth/demo", (req, res) => {
  const { role, name, email } = req.body;
  
  let targetUser;
  if (role === "admin") {
    targetUser = {
      id: "admin_dr_vance",
      name: name || "Dr. Michael Vance, MD",
      email: email || "dr.vance@meridianclinic.com",
      role: "admin",
      photo: null,
      accessToken: null,
    };
  } else {
    targetUser = {
      id: "patient_sarah_jenkins",
      name: name || "Sarah Jenkins",
      email: (email || "sarah.jenkins@example.com").toLowerCase(),
      role: ADMIN_EMAILS.includes((email || "").toLowerCase()) ? "admin" : "patient",
      photo: null,
      accessToken: null,
    };
  }

  req.login(targetUser, (err) => {
    if (err) return res.status(500).json({ error: "Login failed" });
    return res.json({
      ok: true,
      user: targetUser,
      redirect: targetUser.role === "admin" ? "/admin.html" : "/intake.html"
    });
  });
});

app.get(
  "/auth/google",
  (req, res, next) => {
    if (!googleOAuthConfigured) {
      return res.status(503).send("Google sign-in is not configured in .env. Please use the email/password login.");
    }
    next();
  },
  passport.authenticate("google", {
    scope: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
    accessType: "offline",
    prompt: "consent",
  })
);

app.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!googleOAuthConfigured) {
      return res.status(503).send("Google sign-in is not configured.");
    }
    next();
  },
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect(req.user.role === "admin" ? "/admin.html" : "/intake.html");
  }
);

app.get("/logout", (req, res) => {
  const email = req.user ? req.user.email : "anonymous";
  db.createAuditLog({
    actorEmail: email,
    actorRole: req.user ? req.user.role : "guest",
    action: "LOGOUT",
    ipAddress: req.ip,
  });
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("meridian.sid");
      res.redirect("/");
    });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.isAuthenticated()) return res.json({ authenticated: false });
  const { id, name, email, photo, role } = req.user;
  res.json({ authenticated: true, id, name, email, photo, role });
});

/* ----------------------------------------------------------------
   Auth Guards (Express Middleware)
------------------------------------------------------------------- */
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Sign in required" });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === "admin") return next();
  res.status(403).json({ error: "Clinic staff / admin access required" });
}

/* ----------------------------------------------------------------
   Patient Electronic Health Record APIs
------------------------------------------------------------------- */

// Patient: Get own intake records / care plan
app.get("/api/patients/me", ensureAuth, async (req, res) => {
  try {
    const userEmail = req.user.email || "";
    const myRecords = await db.getPatientsByEmail(userEmail);
    res.json(myRecords);
  } catch (err) {
    console.error("GET /api/patients/me error:", err);
    res.status(500).json({ error: "Failed to fetch care plan" });
  }
});

// Patient or Admin: Submit new intake
app.post("/api/patients", ensureAuth, async (req, res) => {
  try {
    const record = await db.createPatient({
      submittedBy: req.user.email || req.body.email || "patient@meridianclinic.com",
      ...req.body,
    });

    await db.createAuditLog({
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "INTAKE_SUBMITTED",
      targetPatientId: record.id,
      details: `Intake recorded for ${record.fullName}`,
      ipAddress: req.ip,
    });

    res.json({ ok: true, record });
  } catch (err) {
    console.error("POST /api/patients error:", err);
    res.status(500).json({ error: "Failed to save intake record" });
  }
});

// Patient or Admin: Update intake details
app.put("/api/patients/:id", ensureAuth, async (req, res) => {
  try {
    const existing = await db.getPatientById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Record not found" });

    const isOwner = (existing.submittedBy || "").toLowerCase() === (req.user.email || "").toLowerCase();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Unauthorized to edit this record" });
    }

    const updated = await db.updatePatient(req.params.id, req.body);

    await db.createAuditLog({
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "INTAKE_UPDATED",
      targetPatientId: req.params.id,
      details: `Intake details modified`,
      ipAddress: req.ip,
    });

    res.json({ ok: true, record: updated });
  } catch (err) {
    console.error("PUT /api/patients/:id error:", err);
    res.status(500).json({ error: "Failed to update record" });
  }
});

// Admin: List all patients
app.get("/api/patients", ensureAdmin, async (req, res) => {
  try {
    const patients = await db.getAllPatients();
    res.json(patients);
  } catch (err) {
    console.error("GET /api/patients error:", err);
    res.status(500).json({ error: "Failed to load patient roster" });
  }
});

// Admin: Get single patient record
app.get("/api/patients/:id", ensureAdmin, async (req, res) => {
  try {
    const record = await db.getPatientById(req.params.id);
    if (!record) return res.status(404).json({ error: "Patient record not found" });

    await db.createAuditLog({
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "CHART_VIEWED",
      targetPatientId: req.params.id,
      details: `Accessed EHR chart for ${record.fullName}`,
      ipAddress: req.ip,
    });

    res.json(record);
  } catch (err) {
    console.error("GET /api/patients/:id error:", err);
    res.status(500).json({ error: "Failed to load record" });
  }
});

// Admin: Update clinical status and staff notes
app.patch("/api/patients/:id/status", ensureAdmin, async (req, res) => {
  try {
    const reviewerName = req.user.name || req.user.email;
    const updated = await db.updatePatientStatus(
      req.params.id,
      req.body.status,
      req.body.staffNotes,
      reviewerName
    );
    if (!updated) return res.status(404).json({ error: "Patient record not found" });

    await db.createAuditLog({
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "CLINICAL_REVIEW_UPDATED",
      targetPatientId: req.params.id,
      details: `Status changed to ${req.body.status || 'unchanged'} with doctor notes`,
      ipAddress: req.ip,
    });

    res.json({ ok: true, record: updated });
  } catch (err) {
    console.error("PATCH /api/patients/:id/status error:", err);
    res.status(500).json({ error: "Failed to update clinical status" });
  }
});

// Admin: Delete patient record
app.delete("/api/patients/:id", ensureAdmin, async (req, res) => {
  try {
    const existing = await db.getPatientById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Patient record not found" });

    await db.deletePatient(req.params.id);

    await db.createAuditLog({
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: "PATIENT_DELETED",
      targetPatientId: req.params.id,
      details: `Deleted record of ${existing.fullName}`,
      ipAddress: req.ip,
    });

    res.json({ ok: true, message: "Record deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/patients/:id error:", err);
    res.status(500).json({ error: "Failed to delete record" });
  }
});

// Admin: Reset sample clinical dataset
app.post("/api/admin/reset-seed", ensureAdmin, async (req, res) => {
  try {
    const patients = await db.resetSeedData();
    res.json({ ok: true, message: "Sample dataset restored", patients });
  } catch (err) {
    console.error("POST /api/admin/reset-seed error:", err);
    res.status(500).json({ error: "Failed to reset sample data" });
  }
});

/* ----------------------------------------------------------------
   Google Drive Sync
------------------------------------------------------------------- */
app.post("/api/patients/:id/drive-sync", ensureAdmin, async (req, res) => {
  try {
    const record = await db.getPatientById(req.params.id);
    if (!record) return res.status(404).json({ error: "Record not found" });

    if (req.user.accessToken) {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: req.user.accessToken });
      const drive = google.drive({ version: "v3", auth: oauth2Client });

      const fileMetadata = {
        name: `Nathshree-Patient-${(record.fullName || record.id).replace(/\s+/g, "_")}-${record.id}.json`,
        mimeType: "application/json",
      };
      const media = {
        mimeType: "application/json",
        body: JSON.stringify(record, null, 2),
      };

      const file = await drive.files.create({
        resource: fileMetadata,
        media,
        fields: "id, webViewLink",
      });

      await db.updatePatientDriveSync(record.id, file.data.id, file.data.webViewLink);

      return res.json({
        ok: true,
        driveFileId: file.data.id,
        driveLink: file.data.webViewLink,
        simulated: false,
      });
    }

    const safeName = (record.fullName || "patient").replace(/[^a-zA-Z0-9_-]/g, "_");
    const archiveFilename = `patient_${safeName}_${record.id}.json`;
    const archivePath = path.join(ARCHIVE_DIR, archiveFilename);
    fs.writeFileSync(archivePath, JSON.stringify(record, null, 2));

    const simulatedId = `archive_${Date.now()}`;
    const simulatedLink = `https://drive.google.com/file/d/nathshree-archive-${record.id}/view`;

    await db.updatePatientDriveSync(record.id, simulatedId, simulatedLink);

    return res.json({
      ok: true,
      driveFileId: simulatedId,
      driveLink: simulatedLink,
      simulated: true,
      message: `Saved to Clinic Archive (${archiveFilename})`,
    });
  } catch (err) {
    console.error("Drive sync error:", err);
    res.status(500).json({ error: "Drive sync failed", detail: err.message });
  }
});

/* ----------------------------------------------------------------
   Start Express.js Server
------------------------------------------------------------------- */
async function startServer() {
  await db.initDb();
  app.listen(PORT, () => {
    console.log(`✓ Nathshree Clinic — Wagholi (Express.js) running at http://localhost:${PORT}`);
  });
}

startServer();
