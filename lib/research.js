// ─────────────────────────────────────────────
// Web research via Claude with web search
// Falls back to Claude general knowledge
// ─────────────────────────────────────────────
const claude = require("./claude");

async function searchTrending() {
  console.log("[research] Searching for trending AI/marketing topics...");

  const result = await claude.generate(
    `You are a research analyst tracking the AI and marketing industry. Your job is to find the most timely, interesting topics that prompt engineers and marketers would care about.

Focus on:
- New AI tool launches or major updates
- Prompt engineering techniques gaining traction
- Marketing automation trends
- AI writing/content creation developments
- Notable experiments or case studies

Return a JSON array of 5-7 research findings. Each object:
- topic: the headline/topic
- summary: 2-3 sentence summary of what's happening
- angle: how GeniusPrompts newsletter could cover this
- category: one of (copywriting, email, social, ads, growth, productivity, learning)
- timeliness: "breaking", "this_week", or "evergreen"

Return ONLY the JSON array.`,
    `Find the most interesting AI, prompt engineering, and marketing topics from the past 7 days. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Focus on things that would make someone stop scrolling and read a newsletter about it.`,
    { maxTokens: 2048 }
  );

  if (result.content) {
    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("[research] Parse error:", err.message);
    }
  }

  return getDefaultResearch();
}

function getDefaultResearch() {
  return [
    { topic: "Claude's Extended Thinking for Complex Prompts", summary: "Anthropic's extended thinking feature lets Claude reason through complex prompts step by step, producing dramatically better outputs for multi-step tasks.", angle: "Teach readers how to structure prompts that leverage extended thinking", category: "productivity", timeliness: "this_week" },
    { topic: "The Rise of Prompt Chaining Workflows", summary: "More marketers are chaining multiple AI prompts together to create complete content pipelines — from research to outline to draft to edit.", angle: "Step-by-step guide to building a prompt chain for content creation", category: "copywriting", timeliness: "evergreen" },
    { topic: "AI-Generated Email Subject Lines Outperform Human", summary: "New data shows AI-written email subject lines achieve 15-25% higher open rates when given proper context and audience data.", angle: "Share the exact prompt formula for high-performing subject lines", category: "email", timeliness: "this_week" },
  ];
}

module.exports = { searchTrending };
