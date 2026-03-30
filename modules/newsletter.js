// ─────────────────────────────────────────────
// Newsletter Autonomous Pipeline
// Monday 7:00 AM: generate + publish to Beehiiv
// Full pipeline: pick topic → research → write → publish
// ─────────────────────────────────────────────
const claude = require("../lib/claude");
const beehiiv = require("../lib/beehiiv");
const supabase = require("../lib/supabase");
const storage = require("../lib/storage");

// Affiliate partners fallback (Supabase is primary)
const FALLBACK_AFFILIATES = [
  { name: "Copy.ai", url: "https://www.copy.ai/?via=geniusprompts", description: "AI-powered copywriting tool.", commission: "25% recurring" },
  { name: "Jasper AI", url: "https://www.jasper.ai/?fpr=geniusprompts", description: "Enterprise AI writing assistant.", commission: "30% recurring" },
  { name: "Beehiiv", url: "https://www.beehiiv.com/?via=geniusprompts", description: "Newsletter platform built for growth.", commission: "50% recurring for 12 months" },
  { name: "GoHighLevel", url: "https://www.gohighlevel.com/?fp_ref=geniusprompts", description: "All-in-one marketing platform.", commission: "40% recurring" },
  { name: "Surfer SEO", url: "https://surferseo.com/?ref=geniusprompts", description: "AI-powered SEO and content optimization.", commission: "25% recurring" },
];

// Fallback topic calendar
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
  console.log("[newsletter] ═══ Starting autonomous newsletter pipeline ═══");
  const startTime = Date.now();

  try {
    // ── Step 1: Pick topic ──
    const topic = await pickTopic();
    console.log(`[newsletter] Topic: "${topic.title}"`);

    // ── Step 2: Pick affiliate ──
    const affiliate = await pickAffiliate(topic.category);
    console.log(`[newsletter] Affiliate: ${affiliate.name} (${affiliate.commission})`);

    // ── Step 3: Get recent performance context ──
    const performanceContext = await getPerformanceContext();

    // ── Step 4: Generate newsletter via Claude ──
    const draft = await generateDraft(topic, affiliate, performanceContext);
    console.log(`[newsletter] Draft generated: "${draft.subject}"`);

    // ── Step 5: Save to Supabase ──
    const newsletterRecord = {
      topic: topic.title,
      subject: draft.subject,
      preheader: draft.preheader,
      body_markdown: draft.mainContent,
      body_html: formatAsHtml(draft),
      affiliate_name: affiliate.name,
      affiliate_url: affiliate.url,
      affiliate_commission: affiliate.commission,
      status: "draft",
      week_number: getWeekNumber(),
      source: topic.source || "auto",
    };

    let savedRecord = null;
    if (supabase.isConfigured()) {
      savedRecord = await supabase.saveNewsletter(newsletterRecord);
      if (topic.ideaId) await supabase.markIdeaUsed(topic.ideaId, savedRecord?.id);
      if (topic.inspirationId) await supabase.markInspirationUsed(topic.inspirationId, savedRecord?.id);
      await supabase.markAffiliateFeatured(affiliate.id);
    }

    // ── Step 6: Publish to Beehiiv ──
    let beehiivResult = { success: false, demo: true };
    if (beehiiv.isConfigured()) {
      beehiivResult = await beehiiv.createPost({
        subject: draft.subject,
        preheader: draft.preheader,
        bodyHtml: formatAsHtml(draft),
        tags: ["ai-prompts", topic.category || "general"],
      });

      if (beehiivResult.success && beehiivResult.postId) {
        // Schedule for 90 minutes from now (gives time for review if needed)
        const scheduledFor = new Date(Date.now() + 90 * 60 * 1000).toISOString();
        const scheduleResult = await beehiiv.schedulePost(beehiivResult.postId, scheduledFor);

        if (scheduleResult.success && savedRecord) {
          await supabase.updateNewsletter(savedRecord.id, {
            beehiiv_post_id: beehiivResult.postId,
            status: "scheduled",
            scheduled_for: scheduledFor,
          });
          console.log(`[newsletter] ✓ Scheduled on Beehiiv for ${scheduledFor}`);
        }
      } else {
        console.log("[newsletter] Beehiiv post created as draft (manual scheduling needed)");
        if (savedRecord && beehiivResult.postId) {
          await supabase.updateNewsletter(savedRecord.id, { beehiiv_post_id: beehiivResult.postId });
        }
      }
    }

    // ── Step 7: Save locally as backup ──
    const fullDraft = {
      ...draft,
      topic: topic.title,
      affiliateLink: affiliate.url,
      affiliateName: affiliate.name,
      affiliateCommission: affiliate.commission,
      weekNumber: getWeekNumber(),
      generatedAt: new Date().toISOString(),
      beehiivPostId: beehiivResult.postId || null,
      status: beehiivResult.success ? "scheduled" : "draft",
    };
    storage.saveDraft(fullDraft);

    // ── Step 8: Log success ──
    const durationMs = Date.now() - startTime;
    if (supabase.isConfigured()) {
      await supabase.logRun("newsletter", "success", {
        topic: topic.title,
        subject: draft.subject,
        affiliate: affiliate.name,
        beehiivPublished: beehiivResult.success,
        demo: draft.demo || false,
      }, null, durationMs);
    }
    storage.logRun("newsletter");

    console.log(`[newsletter] ═══ Pipeline complete (${durationMs}ms) ═══`);
    console.log(`[newsletter] Subject: "${draft.subject}"`);
    console.log(`[newsletter] Beehiiv: ${beehiivResult.success ? "PUBLISHED" : "draft only"}`);
    console.log(`[newsletter] AI mode: ${draft.demo ? "DEMO" : "LIVE"}`);

    return fullDraft;
  } catch (err) {
    console.error("[newsletter] Pipeline error:", err.message);
    const durationMs = Date.now() - startTime;
    if (supabase.isConfigured()) {
      await supabase.logRun("newsletter", "failed", {}, err.message, durationMs);
    }
    throw err;
  }
}

// ── Topic Selection ──
// Priority: 1) Unused inspiration 2) Unused curated ideas 3) Fallback calendar
async function pickTopic() {
  if (supabase.isConfigured()) {
    // Try inspiration first (50% of content from God of Prompt style)
    const inspiration = await supabase.getUnusedInspiration(5);
    if (inspiration.length > 0) {
      const pick = inspiration[Math.floor(Math.random() * Math.min(3, inspiration.length))];
      return {
        title: pick.our_topic_idea,
        category: "copywriting",
        source: "inspiration",
        inspirationId: pick.id,
        angle: pick.our_angle,
      };
    }

    // Try curated ideas
    const ideas = await supabase.getUnusedIdeas(5);
    if (ideas.length > 0) {
      const pick = ideas[0]; // Highest scored
      return {
        title: pick.topic,
        category: pick.category,
        source: "curator",
        ideaId: pick.id,
        angle: pick.angle,
      };
    }
  }

  // Fallback to calendar
  const weekNumber = getWeekNumber();
  return {
    title: TOPIC_CALENDAR[weekNumber % TOPIC_CALENDAR.length],
    category: "copywriting",
    source: "calendar",
  };
}

// ── Affiliate Selection ──
// Uses Supabase data with performance weighting, falls back to rotation
async function pickAffiliate(category) {
  if (supabase.isConfigured()) {
    const affiliates = await supabase.getAffiliates();
    if (affiliates.length > 0) {
      // Prefer affiliates that match the category and haven't been featured recently
      const matched = affiliates.filter(
        (a) => a.category_match && a.category_match.includes(category)
      );
      const pool = matched.length > 0 ? matched : affiliates;
      // Pick the one featured least recently (already sorted by last_featured_at ASC)
      return pool[0];
    }
  }

  // Fallback
  const weekNumber = getWeekNumber();
  return FALLBACK_AFFILIATES[weekNumber % FALLBACK_AFFILIATES.length];
}

// ── Performance Context ──
async function getPerformanceContext() {
  if (!supabase.isConfigured()) return "No performance data available yet.";

  const recent = await supabase.getRecentNewsletters(3);
  if (recent.length === 0) return "This is our first newsletter.";

  return recent.map((n) =>
    `"${n.subject}" — open rate: ${n.open_rate || "pending"}, clicks: ${n.click_rate || "pending"}`
  ).join("\n");
}

// ── Draft Generation ──
async function generateDraft(topic, affiliate, performanceContext) {
  const result = await claude.generateNewsletter(topic.title, {
    name: affiliate.name,
    url: affiliate.url,
    description: affiliate.description,
    performanceContext,
    angle: topic.angle,
  });
  return result;
}

// ── HTML Formatting ──
function formatAsHtml(draft) {
  const affiliateDisclosure = `<p style="font-size:12px;color:#888;margin-top:32px;">Disclosure: Some links in this email are affiliate links. We may earn a commission if you make a purchase — at no extra cost to you. We only recommend tools we genuinely believe in.</p>`;

  return `
<div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
  <p>${draft.greeting || "Hey there!"}</p>

  <div style="margin:20px 0;">
    ${(draft.mainContent || "").replace(/\n/g, "<br>")}
  </div>

  <div style="background:#f5f3ff;padding:16px;border-radius:8px;margin:24px 0;">
    <strong>Prompt Tip of the Week</strong><br>
    ${draft.tipOfTheWeek || ""}
  </div>

  <div style="background:#f0fdf4;padding:16px;border-radius:8px;margin:24px 0;">
    <strong>Tool of the Week: ${draft.affiliateName || ""}</strong><br>
    ${draft.toolSpotlight || ""}
  </div>

  <p><strong>${draft.callToAction || ""}</strong></p>

  <p>${draft.signoff || "Keep prompting,<br>The GeniusPrompts Team"}</p>

  ${affiliateDisclosure}
</div>`.trim();
}

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((now - start) / (7 * 24 * 60 * 60 * 1000));
}

function getLatestDraft() {
  const history = storage.getDraftHistory();
  if (history.length === 0) return null;
  return storage.getDraft(history[0].date);
}

module.exports = { run, getLatestDraft, pickTopic, pickAffiliate };
