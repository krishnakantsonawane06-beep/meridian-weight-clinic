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

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// Asset Fallbacks
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

// Root route handler
app.get("/", (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(__dirname, "index.html");
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.sendFile(path.resolve("index.html"));
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "meridian-clinical-secret-key-2026",
    resave: false,
    saveUninitialized: false,
    name: "meridian.sid",
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

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

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, staffCode } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Full name is required." });
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Please provide a valid email." });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const normEmail = email.trim().toLowerCase();
    let assignedRole = "patient";
    if (role === "admin") {
      const allowedAdmin = ADMIN_EMAILS.includes(normEmail) || staffCode === (process.env.STAFF_ACCESS_KEY || "MERIDIAN2026");
      if (!allowedAdmin) return res.status(403).json({ error: "Staff authorization code required." });
      assignedRole = "admin";
    }

    const newUser = await db.createUser({ name: name.trim(), email: normEmail, password, role: assignedRole });
    await db.createAuditLog({ actorEmail: normEmail, actorRole: assignedRole, action: "USER_REGISTERED", ipAddress: req.ip });

    req.login(newUser, (err) => {
      if (err) return res.status(500).json({ error: "Login failed after registration." });
      return res.json({ ok: true, user: newUser, redirect: newUser.role === "admin" ? "/admin.html" : "/intake.html" });
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Registration failed." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

    const normEmail = email.trim().toLowerCase();
    const user = await db.findUserByEmail(normEmail);
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid email or password." });

    const isMatch = await db.verifyPassword(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: "Invalid email or password." });

    await db.updateUserLastLogin(user.id);
    await db.createAuditLog({ actorEmail: normEmail, actorRole: user.role, action: "LOGIN_SUCCESS", ipAddress: req.ip });

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, photo: user.photo };
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session error." });
      req.login(safeUser, (loginErr) => {
        if (loginErr) return res.status(500).json({ error: "Login failed." });
        return res.json({ ok: true, user: safeUser, redirect: safeUser.role === "admin" ? "/admin.html" : "/intake.html" });
      });
    });
  } catch (err) {
    res.status(500).json({ error: "An unexpected error occurred during login." });
  }
});

app.post("/api/auth/demo", (req, res) => {
  const { role, name, email } = req.body;
  let targetUser;
  if (role === "admin") {
    targetUser = { id: "admin_dr_vance", name: name || "Dr. Michael Vance, MD", email: email || "dr.vance@meridianclinic.com", role: "admin" };
  } else {
    targetUser = { id: "patient_sarah_jenkins", name: name || "Sarah Jenkins", email: (email || "sarah.jenkins@example.com").toLowerCase(), role: "patient" };
  }

  req.login(targetUser, (err) => {
    if (err) return res.status(500).json({ error: "Login failed" });
    return res.json({ ok: true, user: targetUser, redirect: targetUser.role === "admin" ? "/admin.html" : "/intake.html" });
  });
});

app.get("/logout", (req, res) => {
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

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Sign in required" });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === "admin") return next();
  res.status(403).json({ error: "Admin access required" });
}

app.get("/api/patients/me", ensureAuth, async (req, res) => {
  try {
    const myRecords = await db.getPatientsByEmail(req.user.email || "");
    res.json(myRecords);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch care plan" });
  }
});

app.post("/api/patients", ensureAuth, async (req, res) => {
  try {
    const record = await db.createPatient({ submittedBy: req.user.email || "patient@meridianclinic.com", ...req.body });
    res.json({ ok: true, record });
  } catch (err) {
    res.status(500).json({ error: "Failed to save intake" });
  }
});

app.put("/api/patients/:id", ensureAuth, async (req, res) => {
  try {
    const updated = await db.updatePatient(req.params.id, req.body);
    res.json({ ok: true, record: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update record" });
  }
});

app.get("/api/patients", ensureAdmin, async (req, res) => {
  try {
    const patients = await db.getAllPatients();
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: "Failed to load patient roster" });
  }
});

app.get("/api/patients/:id", ensureAdmin, async (req, res) => {
  try {
    const record = await db.getPatientById(req.params.id);
    if (!record) return res.status(404).json({ error: "Patient record not found" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to load record" });
  }
});

app.patch("/api/patients/:id/status", ensureAdmin, async (req, res) => {
  try {
    const updated = await db.updatePatientStatus(req.params.id, req.body.status, req.body.staffNotes, req.user.name);
    res.json({ ok: true, record: updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.delete("/api/patients/:id", ensureAdmin, async (req, res) => {
  try {
    await db.deletePatient(req.params.id);
    res.json({ ok: true, message: "Record deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete record" });
  }
});

app.post("/api/admin/reset-seed", ensureAdmin, async (req, res) => {
  try {
    const patients = await db.resetSeedData();
    res.json({ ok: true, message: "Sample dataset restored", patients });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset sample data" });
  }
});

app.post("/api/patients/:id/drive-sync", ensureAdmin, async (req, res) => {
  try {
    const record = await db.getPatientById(req.params.id);
    if (!record) return res.status(404).json({ error: "Record not found" });

    const safeName = (record.fullName || "patient").replace(/[^a-zA-Z0-9_-]/g, "_");
    const archiveFilename = `patient_${safeName}_${record.id}.json`;
    const archivePath = path.join(ARCHIVE_DIR, archiveFilename);
    fs.writeFileSync(archivePath, JSON.stringify(record, null, 2));

    const simulatedId = `archive_${Date.now()}`;
    const simulatedLink = `https://drive.google.com/file/d/meridian-archive-${record.id}/view`;
    await db.updatePatientDriveSync(record.id, simulatedId, simulatedLink);

    return res.json({ ok: true, driveFileId: simulatedId, driveLink: simulatedLink, simulated: true });
  } catch (err) {
    res.status(500).json({ error: "Drive sync failed", detail: err.message });
  }
});

async function startServer() {
  await db.initDb();
  app.listen(PORT, () => {
    console.log(`✓ Meridian Weight Clinic running at http://localhost:${PORT}`);
  });
}

startServer();
