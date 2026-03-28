// ─────────────────────────────────────────────
// Welcome Drip Manager Module
// Checks every 15 minutes for drip actions due
// ─────────────────────────────────────────────
const beehiiv = require("../lib/beehiiv");
const storage = require("../lib/storage");

// Drip sequence definition (days after signup)
const DRIP_SEQUENCE = [
  { day: 0, tag: "welcome", label: "Welcome email" },
  { day: 1, tag: "tip_day1", label: "Day 1: First prompt tip" },
  { day: 3, tag: "tip_day3", label: "Day 3: Power user tip" },
  { day: 7, tag: "tip_day7", label: "Day 7: Advanced techniques" },
  { day: 14, tag: "affiliate_intro", label: "Day 14: Tool recommendations" },
  { day: 21, tag: "engagement_check", label: "Day 21: Engagement check" },
];

// Process a new subscriber webhook
async function handleNewSubscriber(subscriberData) {
  const email = subscriberData.email;
  if (!email) {
    console.warn("[welcome] No email in subscriber data");
    return { success: false, error: "No email" };
  }

  console.log(`[welcome] New subscriber: ${email}`);

  // Track in local storage
  storage.updateSubscriber(email, {
    email,
    subscribedAt: new Date().toISOString(),
    source: subscriberData.source || "website",
    dripStage: 0,
    dripHistory: [{ tag: "welcome", sentAt: new Date().toISOString() }],
    instagram: subscriberData.instagram || null,
  });

  storage.logRun("welcome-new");
  return { success: true, email };
}

// Check all subscribers for pending drip actions
async function checkDripActions() {
  const subscribers = storage.getSubscribers();
  const now = Date.now();
  let actionsPerformed = 0;

  for (const [email, sub] of Object.entries(subscribers)) {
    if (!sub.subscribedAt) continue;

    const subscribedAt = new Date(sub.subscribedAt).getTime();
    const daysSinceSignup = (now - subscribedAt) / (1000 * 60 * 60 * 24);
    const currentStage = sub.dripStage || 0;

    // Find next drip action that's due
    for (let i = currentStage; i < DRIP_SEQUENCE.length; i++) {
      const step = DRIP_SEQUENCE[i];

      if (daysSinceSignup >= step.day && i > currentStage - 1) {
        // Check if we already sent this step
        const alreadySent = (sub.dripHistory || []).some((h) => h.tag === step.tag);
        if (alreadySent) continue;

        console.log(`[welcome] Drip action: ${step.label} for ${email} (day ${Math.floor(daysSinceSignup)})`);

        // Add tag on Beehiiv if configured
        if (beehiiv.isConfigured()) {
          const subscriber = await beehiiv.getSubscriber(email);
          if (subscriber) {
            await beehiiv.addTags(subscriber.id, [step.tag]);
          }
        }

        // Update local tracking
        const history = sub.dripHistory || [];
        history.push({ tag: step.tag, sentAt: new Date().toISOString() });
        storage.updateSubscriber(email, {
          dripStage: i + 1,
          dripHistory: history,
        });

        actionsPerformed++;
        break; // Only one action per check per subscriber
      }
    }
  }

  if (actionsPerformed > 0) {
    console.log(`[welcome] ${actionsPerformed} drip action(s) performed`);
    storage.logRun("drip-check");
  }

  return { actionsPerformed };
}

// Get drip status for all subscribers
function getDripStatus() {
  const subscribers = storage.getSubscribers();
  const now = Date.now();

  return Object.entries(subscribers).map(([email, sub]) => {
    const daysSince = sub.subscribedAt
      ? Math.floor((now - new Date(sub.subscribedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return {
      email,
      daysSinceSignup: daysSince,
      currentStage: sub.dripStage || 0,
      totalStages: DRIP_SEQUENCE.length,
      lastAction: (sub.dripHistory || []).slice(-1)[0] || null,
    };
  });
}

module.exports = { handleNewSubscriber, checkDripActions, getDripStatus, DRIP_SEQUENCE };
