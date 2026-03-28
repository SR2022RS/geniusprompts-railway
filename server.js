// ─────────────────────────────────────────────
// GeniusPrompts Railway Backend Agent
// Express server + cron-based automation
// ─────────────────────────────────────────────
const express = require("express");
const cron = require("node-cron");
const cors = require("cors");

// Modules
const storage = require("./lib/storage");
const beehiiv = require("./lib/beehiiv");
const newsletter = require("./modules/newsletter");
const welcome = require("./modules/welcome");
const curator = require("./modules/curator");

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize storage
storage.init();

// ─────────────────────────────────────────────
// HEALTH CHECK (must be first — no auth/middleware can block this)
// ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "GeniusPrompts Agent",
    version: "1.1.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: {
      anthropic: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_API),
      beehiiv: beehiiv.isConfigured(),
      timezone: process.env.TZ || "not set",
      dataDir: process.env.DATA_DIR || "local",
    },
  });
});

// ─────────────────────────────────────────────
// STATUS DASHBOARD
// ─────────────────────────────────────────────
app.get("/api/status", async (req, res) => {
  const runLog = storage.getRunLog();
  const subscribers = storage.getSubscribers();
  const subCount = await beehiiv.getSubscriberCount();
  const latestDraft = newsletter.getLatestDraft();
  const ideas = curator.getIdeas();

  res.json({
    agent: "GeniusPrompts Backend",
    status: "running",
    uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    services: {
      anthropic: (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_API) ? "connected" : "not configured",
      beehiiv: beehiiv.isConfigured() ? "connected" : "not configured",
    },
    crons: {
      newsletter: {
        schedule: "Monday 8:00 AM EST",
        lastRun: runLog.newsletter?.lastRun || "never",
        totalRuns: runLog.newsletter?.count || 0,
      },
      curator: {
        schedule: "Daily 6:00 AM EST",
        lastRun: runLog.curator?.lastRun || "never",
        totalRuns: runLog.curator?.count || 0,
      },
      dripCheck: {
        schedule: "Every 15 minutes",
        lastRun: runLog["drip-check"]?.lastRun || "never",
        totalRuns: runLog["drip-check"]?.count || 0,
      },
    },
    stats: {
      localSubscribers: Object.keys(subscribers).length,
      beehiivSubscribers: subCount.count,
      beehiivDemo: subCount.demo || false,
      draftsGenerated: storage.getDraftHistory().length,
      contentIdeas: ideas.ideas?.length || 0,
      ideasLastGenerated: ideas.generatedAt || "never",
    },
    latestDraft: latestDraft
      ? { subject: latestDraft.subject, topic: latestDraft.topic, date: latestDraft.generatedAt }
      : null,
  });
});

// ─────────────────────────────────────────────
// MANUAL NEWSLETTER DRAFT
// ─────────────────────────────────────────────
app.post("/api/draft-now", async (req, res) => {
  try {
    console.log("[api] Manual draft trigger");
    const draft = await newsletter.run();
    res.json({ success: true, draft });
  } catch (err) {
    console.error("[api] Draft error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// NEW SUBSCRIBER WEBHOOK
// ─────────────────────────────────────────────
app.post("/api/webhook/subscriber", async (req, res) => {
  try {
    const { email, name, source, instagram } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email required" });
    }
    const result = await welcome.handleNewSubscriber({ email, name, source, instagram });
    res.json(result);
  } catch (err) {
    console.error("[api] Webhook error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// CONTENT IDEAS
// ─────────────────────────────────────────────
app.get("/api/ideas", (req, res) => {
  const ideas = curator.getIdeas();
  res.json(ideas);
});

app.post("/api/ideas/refresh", async (req, res) => {
  try {
    const ideas = await curator.run();
    res.json({ success: true, ideas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
// DRAFT HISTORY
// ─────────────────────────────────────────────
app.get("/api/history", (req, res) => {
  const history = storage.getDraftHistory();
  res.json({ drafts: history, total: history.length });
});

app.get("/api/history/:date", (req, res) => {
  const draft = storage.getDraft(req.params.date);
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  res.json(draft);
});

// ─────────────────────────────────────────────
// DRIP STATUS
// ─────────────────────────────────────────────
app.get("/api/drip-status", (req, res) => {
  const status = welcome.getDripStatus();
  res.json({ subscribers: status, total: status.length });
});

// ─────────────────────────────────────────────
// CRON JOBS
// ─────────────────────────────────────────────

// Monday at 8:00 AM (server timezone — set TZ=America/New_York)
cron.schedule("0 8 * * 1", async () => {
  console.log("\n========================================");
  console.log("[cron] NEWSLETTER DRAFT — Monday 8:00 AM");
  console.log("========================================");
  try {
    await newsletter.run();
  } catch (err) {
    console.error("[cron] Newsletter error:", err.message);
  }
});

// Daily at 6:00 AM
cron.schedule("0 6 * * *", async () => {
  console.log("\n========================================");
  console.log("[cron] CONTENT CURATOR — Daily 6:00 AM");
  console.log("========================================");
  try {
    await curator.run();
  } catch (err) {
    console.error("[cron] Curator error:", err.message);
  }
});

// Every 15 minutes — check drip sequence
cron.schedule("*/15 * * * *", async () => {
  try {
    await welcome.checkDripActions();
  } catch (err) {
    console.error("[cron] Drip check error:", err.message);
  }
});

// ─────────────────────────────────────────────
// GLOBAL ERROR HANDLING
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection:", reason);
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("");
  console.log("==============================================");
  console.log("  GeniusPrompts Backend Agent v1.1.0");
  console.log("==============================================");
  console.log(`  Port:      ${PORT}`);
  console.log(`  Timezone:  ${process.env.TZ || "system default"}`);
  console.log(`  Data dir:  ${process.env.DATA_DIR || "local"}`);
  console.log(`  Anthropic: ${process.env.ANTHROPIC_API_KEY ? "configured" : "NOT SET"}`);
  console.log(`  Beehiiv:   ${beehiiv.isConfigured() ? "configured" : "NOT SET"}`);
  console.log("----------------------------------------------");
  console.log("  Crons:");
  console.log("    Newsletter draft:  Mon 8:00 AM");
  console.log("    Content curator:   Daily 6:00 AM");
  console.log("    Drip check:        Every 15 min");
  console.log("----------------------------------------------");
  console.log("  Endpoints:");
  console.log("    GET  /health");
  console.log("    GET  /api/status");
  console.log("    POST /api/draft-now");
  console.log("    POST /api/webhook/subscriber");
  console.log("    GET  /api/ideas");
  console.log("    POST /api/ideas/refresh");
  console.log("    GET  /api/history");
  console.log("    GET  /api/drip-status");
  console.log("==============================================");
  console.log("");
});
