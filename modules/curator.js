// ─────────────────────────────────────────────
// Content Curator Module (Enhanced)
// Runs daily at 6:00 AM EST
// Uses web research + inspiration to generate ideas
// Avoids repeating past topics
// ─────────────────────────────────────────────
const claude = require("../lib/claude");
const research = require("../lib/research");
const supabase = require("../lib/supabase");
const storage = require("../lib/storage");

async function run() {
  console.log("[curator] Generating daily content ideas (research-backed)...");
  const startTime = Date.now();

  try {
    // Step 1: Get fresh research
    const trendingTopics = await research.searchTrending();
    console.log(`[curator] Got ${trendingTopics.length} trending topics from research`);

    // Step 2: Get past topics to avoid repeats
    let pastTopics = [];
    if (supabase.isConfigured()) {
      const recent = await supabase.getRecentNewsletters(8);
      pastTopics = recent.map((n) => n.topic);
    }

    // Step 3: Get inspiration ideas already generated
    let inspirationTopics = [];
    if (supabase.isConfigured()) {
      const inspiration = await supabase.getUnusedInspiration(5);
      inspirationTopics = inspiration.map((i) => i.our_topic_idea);
    }

    // Step 4: Generate curated ideas via Claude
    const result = await claude.generate(
      `You are a content strategist for "GeniusPrompts," a newsletter for marketers who use AI prompts. Generate newsletter topic ideas based on trending research and competitor analysis.

TRENDING TOPICS (from web research):
${trendingTopics.map((t) => `- ${t.topic}: ${t.summary}`).join("\n")}

ALREADY COVERED (avoid repeats):
${pastTopics.length > 0 ? pastTopics.map((t) => `- ${t}`).join("\n") : "- None yet"}

INSPIRATION PIPELINE (already queued, don't duplicate):
${inspirationTopics.length > 0 ? inspirationTopics.map((t) => `- ${t}`).join("\n") : "- None"}

Generate 5 UNIQUE ideas that:
- Are timely (based on the research above)
- Target marketers and business owners (not developers)
- Could each fill a full newsletter issue
- Include actionable prompt tips readers can use immediately
- Are different from what's already covered or queued

Return a JSON array:
- topic: newsletter headline
- angle: the specific hook or approach
- category: one of (copywriting, email, social, ads, growth, productivity, learning)
- estimatedEngagement: "high", "medium", or "low"
- basedOn: which trending topic inspired this (or "original")

Return ONLY the JSON array.`,
      `Generate 5 content ideas for the week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      { maxTokens: 1500 }
    );

    let ideas = [];
    if (result.content) {
      try {
        const jsonMatch = result.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) ideas = JSON.parse(jsonMatch[0]);
      } catch {
        // fall through to demo
      }
    }

    if (ideas.length === 0) {
      ideas = await claude.generateContentIdeas();
    }

    // Save to Supabase
    if (supabase.isConfigured() && ideas.length > 0) {
      const records = ideas.map((idea) => ({
        topic: idea.topic,
        angle: idea.angle || idea.basedOn,
        category: idea.category,
        source: "curator",
        estimated_engagement: idea.estimatedEngagement || "medium",
      }));
      await supabase.saveContentIdeas(records);
    }

    // Save locally as backup
    storage.saveContentIdeas(ideas);

    const durationMs = Date.now() - startTime;
    if (supabase.isConfigured()) {
      await supabase.logRun("curator", "success", { count: ideas.length }, null, durationMs);
    }
    storage.logRun("curator");

    console.log(`[curator] Generated ${ideas.length} research-backed content ideas`);
    ideas.forEach((idea, i) => {
      console.log(`  ${i + 1}. [${idea.category}] ${idea.topic}`);
    });

    return ideas;
  } catch (err) {
    console.error("[curator] Error:", err.message);
    if (supabase.isConfigured()) {
      await supabase.logRun("curator", "failed", {}, err.message, Date.now() - startTime);
    }
    return [];
  }
}

function getIdeas() {
  return storage.getContentIdeas();
}

module.exports = { run, getIdeas };
