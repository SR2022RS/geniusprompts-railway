// ─────────────────────────────────────────────
// Beehiiv API wrapper
// ─────────────────────────────────────────────

const API_BASE = "https://api.beehiiv.com/v2";

function getHeaders() {
  const key = process.env.BEEHIIV_API_KEY;
  if (!key) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

function getPublicationId() {
  return process.env.BEEHIIV_PUBLICATION_ID || null;
}

function isConfigured() {
  return !!(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID);
}

// Get all subscribers (paginated)
async function getSubscribers(params = {}) {
  const headers = getHeaders();
  const pubId = getPublicationId();
  if (!headers || !pubId) {
    console.warn("[beehiiv] Not configured — skipping getSubscribers");
    return { data: [], total: 0, demo: true };
  }

  try {
    const query = new URLSearchParams({
      limit: params.limit || "100",
      ...(params.page && { page: params.page }),
      ...(params.status && { status: params.status }),
    });

    const res = await fetch(`${API_BASE}/publications/${pubId}/subscriptions?${query}`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    return { data: data.data || [], total: data.total_results || 0, demo: false };
  } catch (err) {
    console.error("[beehiiv] getSubscribers error:", err.message);
    return { data: [], total: 0, demo: true, error: err.message };
  }
}

// Get a specific subscriber by email
async function getSubscriber(email) {
  const headers = getHeaders();
  const pubId = getPublicationId();
  if (!headers || !pubId) return null;

  try {
    const res = await fetch(
      `${API_BASE}/publications/${pubId}/subscriptions?email=${encodeURIComponent(email)}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0] || null;
  } catch (err) {
    console.error("[beehiiv] getSubscriber error:", err.message);
    return null;
  }
}

// Add tags to a subscriber
async function addTags(subscriberId, tags) {
  const headers = getHeaders();
  const pubId = getPublicationId();
  if (!headers || !pubId) {
    console.warn("[beehiiv] Not configured — skipping addTags");
    return { success: false, demo: true };
  }

  try {
    const res = await fetch(
      `${API_BASE}/publications/${pubId}/subscriptions/${subscriberId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          custom_fields: tags.map((tag) => ({ name: "drip_tag", value: tag })),
        }),
      }
    );
    return { success: res.ok, demo: false };
  } catch (err) {
    console.error("[beehiiv] addTags error:", err.message);
    return { success: false, error: err.message };
  }
}

// Get subscriber count
async function getSubscriberCount() {
  const headers = getHeaders();
  const pubId = getPublicationId();
  if (!headers || !pubId) return { count: 0, demo: true };

  try {
    const res = await fetch(
      `${API_BASE}/publications/${pubId}/subscriptions?limit=1&status=active`,
      { headers }
    );
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return { count: data.total_results || 0, demo: false };
  } catch (err) {
    console.error("[beehiiv] getSubscriberCount error:", err.message);
    return { count: 0, demo: true, error: err.message };
  }
}

// Get recent subscribers (last N hours)
async function getRecentSubscribers(hoursAgo = 24) {
  const headers = getHeaders();
  const pubId = getPublicationId();
  if (!headers || !pubId) return [];

  try {
    const res = await fetch(
      `${API_BASE}/publications/${pubId}/subscriptions?limit=100&status=active&order_by=created&direction=desc`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;
    return (data.data || []).filter(
      (sub) => new Date(sub.created * 1000).getTime() > cutoff
    );
  } catch (err) {
    console.error("[beehiiv] getRecentSubscribers error:", err.message);
    return [];
  }
}

module.exports = {
  isConfigured,
  getSubscribers,
  getSubscriber,
  addTags,
  getSubscriberCount,
  getRecentSubscribers,
};
