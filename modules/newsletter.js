// ─────────────────────────────────────────────
// Newsletter Drafter Module
// Runs every Monday at 8:00 AM EST
// ─────────────────────────────────────────────
const claude = require("../lib/claude");
const storage = require("../lib/storage");

// Affiliate partners for "Tool of the Week" rotation
const AFFILIATES = [
  {
    name: "Copy.ai",
    url: "https://www.copy.ai/?via=geniusprompts",
    description: "AI-powered copywriting tool that generates marketing copy, blog posts, and social media content in seconds.",
    commission: "25% recurring",
  },
  {
    name: "Jasper AI",
    url: "https://www.jasper.ai/?fpr=geniusprompts",
    description: "Enterprise-grade AI writing assistant for teams that need consistent, on-brand content at scale.",
    commission: "30% recurring",
  },
  {
    name: "Beehiiv",
    url: "https://www.beehiiv.com/?via=geniusprompts",
    description: "The newsletter platform built for growth. Monetize, scale, and own your audience.",
    commission: "50% recurring for 12 months",
  },
  {
    name: "GoHighLevel",
    url: "https://www.gohighlevel.com/?fp_ref=geniusprompts",
    description: "All-in-one marketing platform with CRM, funnels, email, SMS, and automation for agencies.",
    commission: "40% recurring",
  },
  {
    name: "Surfer SEO",
    url: "https://surferseo.com/?ref=geniusprompts",
    description: "Data-driven SEO tool that helps you write content that ranks. AI-powered content optimization.",
    commission: "25% recurring",
  },
];

// Topic rotation calendar (8-week cycle)
const TOPIC_CALENDAR = [
  "How to Write Prompts That Actually Convert: A Framework for Marketers",
  "Email Marketing Prompts That Get 40%+ Open Rates",
  "The Social Media Prompt Playbook: Platform-Specific Templates",
  "Advanced Prompt Chaining: Build Multi-Step AI Workflows",
  "AI-Powered Ad Copy: Prompts That Lower Your CPA",
  "Content Repurposing with AI: One Prompt, 10 Pieces of Content",
  "The Productivity Prompt Stack: Automate Your Entire Week",
  "Growth Hacking with AI Prompts: Acquisition to Retention",
];

async function run() {
  console.log("[newsletter] Starting weekly draft generation...");

  // Determine which week we're on
  const weekNumber = getWeekNumber();
  const topicIndex = weekNumber % TOPIC_CALENDAR.length;
  const affiliateIndex = weekNumber % AFFILIATES.length;

  const topic = TOPIC_CALENDAR[topicIndex];
  const affiliate = AFFILIATES[affiliateIndex];

  console.log(`[newsletter] Week ${weekNumber} | Topic: "${topic}" | Affiliate: ${affiliate.name}`);

  // Generate newsletter via Claude
  const draft = await claude.generateNewsletter(topic, affiliate);

  // Enrich with metadata
  const fullDraft = {
    ...draft,
    topic,
    affiliateLink: affiliate.url,
    affiliateName: affiliate.name,
    affiliateCommission: affiliate.commission,
    weekNumber,
    generatedAt: new Date().toISOString(),
    status: "draft", // draft | reviewed | sent
  };

  // Save to persistent storage
  const filename = storage.saveDraft(fullDraft);
  storage.logRun("newsletter");

  console.log(`[newsletter] Draft saved to ${filename}`);
  console.log(`[newsletter] Subject: "${fullDraft.subject}"`);
  console.log(`[newsletter] Demo mode: ${draft.demo ? "YES" : "NO"}`);

  return fullDraft;
}

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

// Get the latest draft
function getLatestDraft() {
  const history = storage.getDraftHistory();
  if (history.length === 0) return null;
  const latest = history[0];
  return storage.getDraft(latest.date);
}

module.exports = { run, getLatestDraft, AFFILIATES, TOPIC_CALENDAR };
