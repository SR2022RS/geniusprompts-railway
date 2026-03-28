# Railway Agent Blueprint — How to Spin Up Backend Agents the Right Way

## What This Is

A step-by-step blueprint for deploying a backend "agent" (an always-on Node.js server with scheduled tasks) to Railway. This is the real pattern — no buzzwords, no fake sub-agents, no overengineered architecture.

An "agent" is just: **Express server + cron jobs + persistent storage + API wrappers.**

---

## Architecture (The Real Version)

```
your-project-railway/
├── server.js              ← Express app + cron scheduler (the "agent")
├── modules/
│   ├── module-a.js        ← Each "sub-agent" is just a module with a run() function
│   ├── module-b.js        ← NOT a separate service, NOT a separate deployment
│   └── module-c.js        ← They share memory via the same /data volume
├── lib/
│   ├── ai.js              ← Claude/OpenAI API wrapper
│   ├── external-api.js    ← Any external service wrapper (Beehiiv, Twilio, etc.)
│   └── storage.js         ← JSON file read/write to /data volume
├── package.json
└── railway.toml           ← Railway deployment config
```

### Key Principles

1. **One server, multiple modules** — Don't create separate Railway services for each task. One Express server runs all your cron jobs. Simpler, cheaper, shares memory.

2. **Modules are functions, not services** — A "NewsletterDrafter sub-agent" is just `modules/newsletter.js` with an `async function run()`. It's called by a cron job or an API endpoint.

3. **Persistent memory = JSON files on a volume** — Railway volumes survive redeploys. Mount at `/data`. Store subscriber lists, draft history, run logs as JSON files. No database needed until you have 10,000+ records.

4. **Every module gets a manual trigger endpoint** — So you can test without waiting for the cron schedule.

5. **Health check is required** — Railway uses it to know your service is alive.

---

## Step-by-Step: Creating a New Agent

### Step 1: Create the Project Folder

```bash
mkdir my-agent && cd my-agent
npm init -y
npm install express cors node-cron @anthropic-ai/sdk
```

### Step 2: Create the Storage Layer

```javascript
// lib/storage.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "./data";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function init() {
  ensureDir(DATA_DIR);
}

function read(filename, defaultValue = null) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return defaultValue;
  }
}

function write(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function logRun(taskName) {
  const log = read("run-log.json", {});
  log[taskName] = {
    lastRun: new Date().toISOString(),
    count: (log[taskName]?.count || 0) + 1,
  };
  write("run-log.json", log);
}

module.exports = { init, read, write, logRun, DATA_DIR };
```

### Step 3: Create a Module (Your "Sub-Agent")

```javascript
// modules/my-task.js
const storage = require("../lib/storage");

async function run() {
  console.log("[my-task] Running...");

  // Do your work here: call APIs, generate content, process data
  const result = { message: "Task completed", timestamp: new Date().toISOString() };

  // Save results to persistent storage
  storage.write("last-task-result.json", result);
  storage.logRun("my-task");

  console.log("[my-task] Done");
  return result;
}

module.exports = { run };
```

### Step 4: Create the Server

```javascript
// server.js
const express = require("express");
const cron = require("node-cron");
const cors = require("cors");
const storage = require("./lib/storage");
const myTask = require("./modules/my-task");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
storage.init();

// Health check (required by Railway)
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Status dashboard
app.get("/api/status", (req, res) => {
  const runLog = storage.read("run-log.json", {});
  res.json({ status: "running", crons: runLog });
});

// Manual trigger
app.post("/api/run-task", async (req, res) => {
  const result = await myTask.run();
  res.json({ success: true, result });
});

// Webhook receiver (for external services to notify you)
app.post("/api/webhook", async (req, res) => {
  console.log("[webhook] Received:", req.body);
  // Process the webhook payload
  res.json({ received: true });
});

// Schedule: runs daily at 8:00 AM (server timezone)
cron.schedule("0 8 * * *", async () => {
  console.log("[cron] Running daily task...");
  await myTask.run();
});

app.listen(PORT, () => {
  console.log(`Agent running on port ${PORT}`);
});
```

### Step 5: Create Railway Config

```toml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
```

### Step 6: Deploy to Railway

```bash
# Login (one time)
railway login

# Create project
railway init --name "MyAgent"

# Deploy
railway up --detach

# Wait for it to build, then link to the service
railway service link MyAgent

# Add persistent volume
railway volume add --mount-path /data

# Set environment variables
railway variables set TZ=America/New_York PORT=8080 DATA_DIR=/data
railway variables set ANTHROPIC_API_KEY=sk-ant-your-key-here
railway variables set ANY_OTHER_KEY=value

# Generate public URL
railway domain

# Redeploy to pick up volume + env vars
railway up --detach

# Verify
curl https://your-app-production.up.railway.app/health
```

---

## Common Cron Schedules

```javascript
// Every 15 minutes
cron.schedule("*/15 * * * *", () => { /* ... */ });

// Every hour
cron.schedule("0 * * * *", () => { /* ... */ });

// Daily at 6:00 AM
cron.schedule("0 6 * * *", () => { /* ... */ });

// Monday at 8:00 AM
cron.schedule("0 8 * * 1", () => { /* ... */ });

// First day of month at midnight
cron.schedule("0 0 1 * *", () => { /* ... */ });
```

**Important:** Cron runs in the server's timezone. Set `TZ=America/New_York` (or your timezone) as a Railway env var.

---

## Adding More "Sub-Agents" (Modules)

Just create a new file in `modules/`, add a `run()` function, import it in `server.js`, and add:
1. A cron schedule
2. A manual trigger endpoint

```javascript
// In server.js, add:
const newModule = require("./modules/new-module");

cron.schedule("0 9 * * *", () => newModule.run());

app.post("/api/run-new-module", async (req, res) => {
  const result = await newModule.run();
  res.json({ success: true, result });
});
```

Then redeploy: `railway up --detach`

---

## Connecting to External Services

### Pattern: API Wrapper in lib/

```javascript
// lib/some-service.js
const API_BASE = "https://api.someservice.com/v2";

function getHeaders() {
  const key = process.env.SOME_SERVICE_API_KEY;
  if (!key) return null;
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function isConfigured() {
  return !!process.env.SOME_SERVICE_API_KEY;
}

async function doSomething(data) {
  const headers = getHeaders();
  if (!headers) {
    console.warn("[some-service] Not configured, skipping");
    return { demo: true };
  }
  const res = await fetch(`${API_BASE}/endpoint`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

module.exports = { isConfigured, doSomething };
```

### Always build with graceful fallbacks:
- If API key missing → log a warning, return demo data
- If API call fails → catch error, return fallback
- Never crash the server because one service is down

---

## Checklist Before Deploying

- [ ] `server.js` has a `/health` endpoint
- [ ] `railway.toml` exists with `healthcheckPath = "/health"`
- [ ] Every module has a manual trigger endpoint (for testing)
- [ ] Every external API wrapper checks if its key exists before calling
- [ ] `storage.init()` is called on startup
- [ ] `TZ` environment variable is set for correct cron timing
- [ ] Volume is mounted at `/data` for persistence

---

## What NOT to Do

1. **Don't create separate Railway services for each task.** One server handles everything. Separate services = separate billing, separate volumes, separate deploys. Not worth it until you have genuinely different scaling needs.

2. **Don't use a database for simple state tracking.** JSON files on a volume are fine for subscriber lists under 10K, draft history, run logs, etc.

3. **Don't use vague architecture terms without code.** If someone says "spin up a sub-agent with shared memory," what they mean is: create a new `.js` file in `modules/`, add a cron schedule, and use `storage.read()`/`storage.write()`.

4. **Don't skip the health check.** Railway will think your service is dead and restart it constantly.

5. **Don't hardcode API keys.** Always use `process.env.YOUR_KEY` and set them via `railway variables set`.
