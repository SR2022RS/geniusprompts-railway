// ─────────────────────────────────────────────
// Supabase client wrapper
// ─────────────────────────────────────────────
const { createClient } = require("@supabase/supabase-js");

let client = null;

function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.warn("[supabase] Not configured — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
      return null;
    }
    client = createClient(url, key);
  }
  return client;
}

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ── Newsletters ──

async function saveNewsletter(draft) {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db.from("newsletters").insert(draft).select().single();
  if (error) { console.error("[supabase] saveNewsletter error:", error.message); return null; }
  return data;
}

async function updateNewsletter(id, updates) {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db.from("newsletters").update(updates).eq("id", id).select().single();
  if (error) { console.error("[supabase] updateNewsletter error:", error.message); return null; }
  return data;
}

async function getRecentNewsletters(limit = 10) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("newsletters").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) { console.error("[supabase] getRecentNewsletters error:", error.message); return []; }
  return data;
}

async function getNewslettersByStatus(status) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("newsletters").select("*").eq("status", status).order("created_at", { ascending: false });
  if (error) return [];
  return data;
}

// ── Content Ideas ──

async function saveContentIdeas(ideas) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("content_ideas").insert(ideas).select();
  if (error) { console.error("[supabase] saveContentIdeas error:", error.message); return []; }
  return data;
}

async function getUnusedIdeas(limit = 10) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("content_ideas").select("*").is("used_in_newsletter_id", null).order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return data;
}

async function markIdeaUsed(ideaId, newsletterId) {
  const db = getClient();
  if (!db) return;
  await db.from("content_ideas").update({ used_in_newsletter_id: newsletterId }).eq("id", ideaId);
}

// ── Affiliate Partners ──

async function getAffiliates() {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("affiliate_partners").select("*").eq("active", true).order("last_featured_at", { ascending: true, nullsFirst: true });
  if (error) return [];
  return data;
}

async function markAffiliateFeatured(affiliateId) {
  const db = getClient();
  if (!db) return;
  await db.from("affiliate_partners").update({ last_featured_at: new Date().toISOString() }).eq("id", affiliateId);
}

// ── Content Inspiration ──

async function saveInspiration(items) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("content_inspiration").insert(items).select();
  if (error) { console.error("[supabase] saveInspiration error:", error.message); return []; }
  return data;
}

async function getUnusedInspiration(limit = 10) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("content_inspiration").select("*").eq("used", false).order("scraped_at", { ascending: false }).limit(limit);
  if (error) return [];
  return data;
}

async function markInspirationUsed(id, newsletterId) {
  const db = getClient();
  if (!db) return;
  await db.from("content_inspiration").update({ used: true, used_in_newsletter_id: newsletterId }).eq("id", id);
}

// ── Subscribers ──

async function upsertSubscriber(subscriber) {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db.from("subscribers").upsert(subscriber, { onConflict: "email" }).select().single();
  if (error) { console.error("[supabase] upsertSubscriber error:", error.message); return null; }
  return data;
}

async function getSubscribersBySegment(segment) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("subscribers").select("*").eq("segment", segment);
  if (error) return [];
  return data;
}

async function getSubscriberCount() {
  const db = getClient();
  if (!db) return 0;
  const { count, error } = await db.from("subscribers").select("*", { count: "exact", head: true });
  if (error) return 0;
  return count;
}

// ── Run Log ──

async function logRun(taskName, status = "success", details = {}, errorMessage = null, durationMs = null) {
  const db = getClient();
  if (!db) return;
  await db.from("run_log").insert({
    task_name: taskName,
    status,
    duration_ms: durationMs,
    details,
    error_message: errorMessage,
  });
}

async function getRecentRuns(taskName, limit = 5) {
  const db = getClient();
  if (!db) return [];
  const { data, error } = await db.from("run_log").select("*").eq("task_name", taskName).order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return data;
}

module.exports = {
  isConfigured,
  getClient,
  saveNewsletter,
  updateNewsletter,
  getRecentNewsletters,
  getNewslettersByStatus,
  saveContentIdeas,
  getUnusedIdeas,
  markIdeaUsed,
  getAffiliates,
  markAffiliateFeatured,
  saveInspiration,
  getUnusedInspiration,
  markInspirationUsed,
  upsertSubscriber,
  getSubscribersBySegment,
  getSubscriberCount,
  logRun,
  getRecentRuns,
};
