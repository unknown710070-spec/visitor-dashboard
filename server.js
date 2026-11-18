
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const geoip = require("geoip-lite");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const required = [
  "DATABASE_URL",
  "ADMIN_PASSWORD",
  "SESSION_SECRET"
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing environment variable: ${key}`);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false"
    ? false
    : { rejectUnauthorized: false }
});

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  name: "visitor_admin",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 60 * 1000
  }
}));

const loginAttempts = new Map();

function isAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return x.length === y.length &&
    crypto.timingSafeEqual(x, y);
}

app.post("/api/login", (req, res) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  let attempt = loginAttempts.get(ip);

  if (!attempt || now > attempt.until) {
    attempt = { count: 0, until: now + 10 * 60 * 1000 };
  }

  if (attempt.count >= 5) {
    return res.status(429).json({
      error: "Too many attempts. Try again later."
    });
  }

  const password = req.body?.password;

  if (
    typeof password !== "string" ||
    !safeEqual(password, process.env.ADMIN_PASSWORD)
  ) {
    attempt.count++;
    loginAttempts.set(ip, attempt);
    return res.status(401).json({
      error: "Invalid credentials"
    });
  }

  loginAttempts.delete(ip);

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: "Session error" });
    }

    req.session.admin = true;

    req.session.save((saveError) => {
      if (saveError) {
        return res.status(500).json({ error: "Session error" });
      }
      res.json({ success: true });
    });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }

    res.clearCookie("visitor_admin");
    res.json({ success: true });
  });
});

app.get("/api/visits", isAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, ip, country, city, visited_at, user_agent FROM visits ORDER BY visited_at DESC LIMIT 500"
    );

    res.set("Cache-Control", "no-store");
    res.json({
      visits: result.rows.map((v) => ({
        id: v.id,
        ip: v.ip,
        country: v.country,
        city: v.city,
        timestamp: v.visited_at,
        userAgent: v.user_agent
      }))
    });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/visit", async (req, res) => {
  if (req.body?.consent !== true) {
    return res.status(403).json({ error: "Consent required" });
  }

  try {
    const ip = req.ip || "unknown";
    const geo = geoip.lookup(ip);

    await pool.query(
      `INSERT INTO visits (ip, country, city, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [
        ip,
        geo?.country || "Unknown",
        geo?.city || "Unknown",
        req.headers["user-agent"] || "Unknown"
      ]
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Could not save visit" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "running" });
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id BIGSERIAL PRIMARY KEY,
      ip TEXT NOT NULL,
      country TEXT,
      city TEXT,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT
    )
  `);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Startup failed:", error);
  process.exit(1);
});
