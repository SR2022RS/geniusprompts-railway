// ─────────────────────────────────────────────
// Persistent JSON file storage on /data volume
// ─────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Initialize all required directories
function init() {
  ensureDir(DATA_DIR);
  ensureDir(path.join(DATA_DIR, "drafts"));
  console.log(`[storage] Data directory: ${DATA_DIR}`);
}

// Read a JSON file, return default if missing
function read(filename, defaultValue = null) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[storage] Error reading ${filename}:`, err.message);
    return defaultValue;
  }
}

// Write a JSON file
function write(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  ensureDir(path.dirname(filePath));
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error(`[storage] Error writing ${filename}:`, err.message);
    return false;
  }
}

// Append to a JSON array file
function append(filename, item, maxItems = 100) {
  const existing = read(filename, []);
  existing.unshift(item);
  const trimmed = existing.slice(0, maxItems);
  return write(filename, trimmed);
}

// Save a newsletter draft with date-based filename
function saveDraft(draft) {
  const date = new Date().toISOString().split("T")[0];
  const filename = `drafts/draft-${date}.json`;
  write(filename, draft);

  // Also update the drafts index
  append("drafts-index.json", {
    date,
    topic: draft.topic,
    subject: draft.subject,
    filename,
    createdAt: new Date().toISOString(),
  }, 52); // Keep ~1 year of weekly drafts

  return filename;
}

// Get all draft history
function getDraftHistory() {
  return read("drafts-index.json", []);
}

// Get a specific draft
function getDraft(date) {
  return read(`drafts/draft-${date}.json`, null);
}

// Get/update subscriber tracking
function getSubscribers() {
  return read("subscribers.json", {});
}

function updateSubscriber(email, data) {
  const subs = getSubscribers();
  subs[email] = { ...subs[email], ...data, updatedAt: new Date().toISOString() };
  write("subscribers.json", subs);
  return subs[email];
}

// Get/update content ideas
function getContentIdeas() {
  return read("content-ideas.json", { ideas: [], generatedAt: null });
}

function saveContentIdeas(ideas) {
  return write("content-ideas.json", {
    ideas,
    generatedAt: new Date().toISOString(),
  });
}

// Get last run timestamps
function getRunLog() {
  return read("run-log.json", {});
}

function logRun(taskName) {
  const log = getRunLog();
  log[taskName] = {
    lastRun: new Date().toISOString(),
    count: (log[taskName]?.count || 0) + 1,
  };
  write("run-log.json", log);
}

module.exports = {
  init,
  read,
  write,
  append,
  saveDraft,
  getDraftHistory,
  getDraft,
  getSubscribers,
  updateSubscriber,
  getContentIdeas,
  saveContentIdeas,
  getRunLog,
  logRun,
  DATA_DIR,
};
