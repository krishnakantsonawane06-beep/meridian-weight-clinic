const mysql = require("mysql2/promise");
require("dotenv").config();

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "meridian_clinic",
  });

  console.log("Checking MySQL table schema...");

  const [cols] = await conn.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
  if (cols.length === 0) {
    console.log("Adding password_hash column to users table...");
    await conn.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL AFTER email");
  }

  // Check last_login column
  const [loginCols] = await conn.query("SHOW COLUMNS FROM users LIKE 'last_login'");
  if (loginCols.length === 0) {
    console.log("Adding last_login column to users table...");
    await conn.query("ALTER TABLE users ADD COLUMN last_login DATETIME NULL AFTER google_id");
  }

  // Insert/update default seeded user credentials
  await conn.query(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES 
      ('usr_admin_001', 'Dr. Michael Vance, MD', 'dr.vance@meridianclinic.com', '$2b$10$fg.5.q9UjIJhZdLadSX8SewHlH9DikDRTTOFZz4dkhNep7OSwyg.W', 'admin'),
      ('usr_patient_001', 'Sarah Jenkins', 'sarah.jenkins@example.com', '$2b$10$nKd1y2no3/5Z0JUajnslLu/C5XlD9DaHT9pypyriqjAwT6degOJF6', 'patient')
    ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash);
  `);

  console.log("✓ MySQL users schema and initial credentials migrated successfully!");
  await conn.end();
}

migrate().catch(console.error);

