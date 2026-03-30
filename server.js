// ─────────────────────────────────────────────
// GeniusPrompts Autonomous Backend Agent v2.0
// Express server + cron-based automation
// ─────────────────────────────────────────────
const express = require("express");
const cron = require("node-cron");
const cors = require("cors");

// Libraries
const storage = require("./lib/storage");
const beehiiv = require("./lib/beehiiv");
const supabase = require("./lib/supabase");

// Modules
const newsletter = require("./modules/newsletter");
const welcome = require("./modules/welcome");
const curator = require("./modules/curator");
const inspiration = require("./modules/inspiration");

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
    version: "2.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: {
      anthropic: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_API),
      beehiiv: beehiiv.isConfigured(),
      supabase: supabase.isConfigured(),
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
  const inspirationData = inspiration.getIdeas();

  res.json({
    agent: "GeniusPrompts Autonomous Agent",
    version: "2.0.0",
    status: "running",
    uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
    services: {
      anthropic: (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.CLAUDE_CODE_API) ? "connected" : "not configured",
      beehiiv: beehiiv.isConfigured() ? "connected" : "not configured",
      supabase: supabase.isConfigured() ? "connected" : "not configured",
    },
    crons: {
      inspiration: {
        schedule: "Daily 5:30 AM EST",
        lastRun: runLog.inspiration?.lastRun || "never",
        totalRuns: runLog.inspiration?.count || 0,
      },
      curator: {
        schedule: "Daily 6:00 AM EST",
        lastRun: runLog.curator?.lastRun || "never",
        totalRuns: runLog.curator?.count || 0,
      },
      newsletter: {
        schedule: "Monday 7:00 AM EST",
        lastRun: runLog.newsletter?.lastRun || "never",
        totalRuns: runLog.newsletter?.count || 0,
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
      inspirationIdeas: inspirationData.ideas?.length || 0,
      inspirationLastGenerated: inspirationData.generatedAt || "never",
    },
    latestDraft: latestDraft
      ? { subject: latestDraft.subject, topic: latestDraft.topic, date: latestDraft.generatedAt, status: latestDraft.status }
      : null,
  });
});

// ─────────────────────────────────────────────
// MANUAL NEWSLETTER DRAFT + PUBLISH
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

    // Also save to Supabase
    if (supabase.isConfigured()) {
      await supabase.upsertSubscriber({
        email,
        name: name || null,
        source: source || "website",
        subscribed_at: new Date().toISOString(),
      });
    }

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
// INSPIRATION (God of Prompt style)
// ─────────────────────────────────────────────
app.get("/api/inspiration", (req, res) => {
  const ideas = inspiration.getIdeas();
  res.json(ideas);
});

app.post("/api/inspiration/refresh", async (req, res) => {
  try {
    const ideas = await inspiration.run();
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

// Daily at 5:30 AM — God of Prompt inspiration analysis
cron.schedule("30 5 * * *", async () => {
  console.log("\n========================================");
  console.log("[cron] INSPIRATION — Daily 5:30 AM");
  console.log("========================================");
  try {
    await inspiration.run();
  } catch (err) {
    console.error("[cron] Inspiration error:", err.message);
  }
});

// Daily at 6:00 AM — Research-backed content curation
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

// Monday at 7:00 AM — Newsletter auto-publish pipeline
cron.schedule("0 7 * * 1", async () => {
  console.log("\n========================================");
  console.log("[cron] NEWSLETTER PIPELINE — Monday 7:00 AM");
  console.log("========================================");
  try {
    await newsletter.run();
  } catch (err) {
    console.error("[cron] Newsletter error:", err.message);
    // Retry once after 60 minutes
    console.log("[cron] Scheduling retry in 60 minutes...");
    setTimeout(async () => {
      try {
        console.log("[cron] NEWSLETTER RETRY");
        await newsletter.run();
      } catch (retryErr) {
        console.error("[cron] Newsletter retry also failed:", retryErr.message);
      }
    }, 60 * 60 * 1000);
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
  console.log("  GeniusPrompts Autonomous Agent v2.0.0");
  console.log("==============================================");
  console.log(`  Port:      ${PORT}`);
  console.log(`  Timezone:  ${process.env.TZ || "system default"}`);
  console.log(`  Data dir:  ${process.env.DATA_DIR || "local"}`);
  console.log(`  Anthropic: ${(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) ? "configured" : "NOT SET"}`);
  console.log(`  Beehiiv:   ${beehiiv.isConfigured() ? "configured" : "NOT SET"}`);
  console.log(`  Supabase:  ${supabase.isConfigured() ? "configured" : "NOT SET"}`);
  console.log("----------------------------------------------");
  console.log("  Crons:");
  console.log("    Inspiration:       Daily 5:30 AM");
  console.log("    Content curator:   Daily 6:00 AM");
  console.log("    Newsletter:        Mon 7:00 AM (auto-publish)");
  console.log("    Drip check:        Every 15 min");
  console.log("----------------------------------------------");
  console.log("  Endpoints:");
  console.log("    GET  /health");
  console.log("    GET  /api/status");
  console.log("    POST /api/draft-now");
  console.log("    POST /api/webhook/subscriber");
  console.log("    GET  /api/ideas");
  console.log("    POST /api/ideas/refresh");
  console.log("    GET  /api/inspiration");
  console.log("    POST /api/inspiration/refresh");
  console.log("    GET  /api/history");
  console.log("    GET  /api/drip-status");
  console.log("==============================================");
  console.log("");
});
