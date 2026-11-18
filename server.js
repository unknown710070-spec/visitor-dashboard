
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const geoip = require("geoip-lite");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  throw new Error("ADMIN_PASSWORD and SESSION_SECRET are required");
}

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));

app.use(session({
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

const visits = [];
const loginAttempts = new Map();

function isAdmin(req, res, next) {
  if (req.session && req.session.admin === true) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

function safeEqual(a, b) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);

  return first.length === second.length &&
    crypto.timingSafeEqual(first, second);
}

app.post("/api/login", (req, res) => {
  const ip = req.ip || "unknown";
  const attempts = loginAttempts.get(ip) || {
    count: 0,
    until: Date.now() + 10 * 60 * 1000
  };

  if (Date.now() > attempts.until) {
    attempts.count = 0;
    attempts.until = Date.now() + 10 * 60 * 1000;
  }

  if (attempts.count >= 5) {
    return res.status(429).json({
      error: "Too many attempts. Try again later."
    });
  }

  const password = req.body?.password;

  if (
    typeof password !== "string" ||
    !safeEqual(password, process.env.ADMIN_PASSWORD)
  ) {
    attempts.count++;
    loginAttempts.set(ip, attempts);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  loginAttempts.delete(ip);

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: "Session error" });
    }

    req.session.admin = true;
    res.json({ success: true });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("visitor_admin");
    res.json({ success: true });
  });
});

app.get("/api/visits", isAdmin, (req, res) => {
  res.json({ visits });
});

app.post("/api/visit", (req, res) => {
  if (req.body?.consent !== true) {
    return res.status(403).json({ error: "Consent required" });
  }

  const ip = req.ip || "unknown";
  const geo = geoip.lookup(ip);

  visits.push({
    id: crypto.randomUUID(),
    ip,
    country: geo?.country || "Unknown",
    city: geo?.city || "Unknown",
    timestamp: new Date().toISOString(),
    userAgent: req.headers["user-agent"] || "Unknown"
  });

  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ status: "running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
