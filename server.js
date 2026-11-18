
const express = require("express");
const helmet = require("helmet");
const geoip = require("geoip-lite");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const visits = [];

app.post("/api/visit", (req, res) => {
  const consent = req.body && req.body.consent;

  if (consent !== true) {
    return res.status(403).json({ error: "Consent required" });
  }

  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.ip;

  const geo = geoip.lookup(ip);

  const visit = {
    id: Date.now().toString(),
    ip,
    country: geo?.country || "Unknown",
    city: geo?.city || "Unknown",
    timestamp: new Date().toISOString(),
    userAgent: req.headers["user-agent"] || "Unknown",
    gps: null
  };

  visits.push(visit);

  res.json({ success: true });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
