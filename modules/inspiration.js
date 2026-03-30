// ─────────────────────────────────────────────
// Content Inspiration Module
// Analyzes God of Prompt content and generates
// our own unique angles inspired by his topics
// Runs daily at 5:30 AM EST
// ─────────────────────────────────────────────
const claude = require("../lib/claude");
const supabase = require("../lib/supabase");
const storage = require("../lib/storage");

// God of Prompt profile — used for Claude to understand his style
const INSPIRATION_SOURCE = {
  name: "God of Prompt",
  handle: "@godofprompt",
  platform: "X/Twitter + Beehiiv newsletter",
  style: "Bold, provocative hooks. Uses key emoji in subject lines. Short punchy sentences. Challenges readers ('You suck at prompting. Stop trying to do it yourself.'). Covers AI tools, prompt engineering, workflow automation. Monetizes via sponsorships (BELAY etc) and affiliate program. Newsletter has 7-minute reads with practical prompt tips.",
  topics: [
    "Prompt engineering techniques and frameworks",
    "AI tool reviews and launches (Claude, ChatGPT, etc)",
    "Automation workflows using AI",
    "Making money with AI skills",
    "AI productivity hacks",
    "Building systems with prompts",
    "Debunking AI myths and bad practices",
  ],
  recentSubjects: [
    "You suck at prompting.",
    "Karpathy's skill loop",
    "Claude just got employees.",
    "Your AI is Lying.",
    "God of Prompt 2.0 live",
    "You paid us $600K",
    "I was wrong.",
    "Stop ignoring this.",
  ],
};

async function run() {
  console.log("[inspiration] Analyzing God of Prompt for content ideas...");
  const startTime = Date.now();

  try {
    const result = await claude.generate(
      `You are a content strategist for "GeniusPrompts," a newsletter about AI prompts for marketers and entrepreneurs.

Your job: study a competitor's content themes and generate ORIGINAL topic ideas inspired by their approach — but tailored for OUR audience (marketers, not developers).

COMPETITOR PROFILE:
Name: ${INSPIRATION_SOURCE.name} (${INSPIRATION_SOURCE.handle})
Style: ${INSPIRATION_SOURCE.style}
Core topics: ${INSPIRATION_SOURCE.topics.join(", ")}
Recent subject lines: ${INSPIRATION_SOURCE.recentSubjects.join(" | ")}

RULES:
- Do NOT copy their content. Generate our own unique angles.
- Adapt their provocative hook style for a marketing audience.
- Each idea should be something we can write a full newsletter about.
- Mix tactical tips, tool reviews, and contrarian takes.
- Think about what would make a marketer forward this to a colleague.

Return a JSON array of 5 objects:
- original_title: the God of Prompt subject/topic that inspired this
- our_topic_idea: our unique newsletter topic
- our_angle: how we'd approach it differently for marketers
- category: one of (copywriting, email, social, ads, growth, productivity, learning, sales)
- hook: a punchy 1-line newsletter subject line in our voice

Return ONLY the JSON array.`,
      `Generate 5 content ideas for this week. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Make them timely and practical. Our audience is marketers and small business owners who use AI prompts to create content, not AI engineers.`,
      { maxTokens: 2048 }
    );

    let ideas = [];
    if (result.content) {
      try {
        const jsonMatch = result.content.match(/\[[\s\S]*\]/);
        if (jsonMatch) ideas = JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.error("[inspiration] Parse error:", err.message);
      }
    }

    if (ideas.length === 0) {
      ideas = getDefaultInspiration();
    }

    // Save to Supabase
    const records = ideas.map((idea) => ({
      source_name: INSPIRATION_SOURCE.name,
      source_platform: "x_twitter",
      original_title: idea.original_title || "General inspiration",
      original_content_summary: `Inspired by ${INSPIRATION_SOURCE.handle}'s content style`,
      our_angle: idea.our_angle,
      our_topic_idea: idea.our_topic_idea || idea.hook,
    }));

    if (supabase.isConfigured()) {
      await supabase.saveInspiration(records);
    }

    // Also save locally as backup
    storage.write("inspiration-latest.json", {
      ideas,
      source: INSPIRATION_SOURCE.name,
      generatedAt: new Date().toISOString(),
    });

    const durationMs = Date.now() - startTime;
    if (supabase.isConfigured()) {
      await supabase.logRun("inspiration", "success", { count: ideas.length }, null, durationMs);
    }
    storage.logRun("inspiration");

    console.log(`[inspiration] Generated ${ideas.length} ideas inspired by ${INSPIRATION_SOURCE.name}`);
    ideas.forEach((idea, i) => {
      console.log(`  ${i + 1}. ${idea.hook || idea.our_topic_idea}`);
    });

    return ideas;
  } catch (err) {
    console.error("[inspiration] Error:", err.message);
    if (supabase.isConfigured()) {
      await supabase.logRun("inspiration", "failed", {}, err.message, Date.now() - startTime);
    }
    return getDefaultInspiration();
  }
}

function getDefaultInspiration() {
  return [
    { original_title: "You suck at prompting", our_topic_idea: "Why Most Marketing Prompts Fail (And the 3-Line Fix)", our_angle: "Specific prompt failures marketers make — vague context, no constraints, wrong format", category: "copywriting", hook: "Your prompts are costing you customers." },
    { original_title: "Karpathy's skill loop", our_topic_idea: "The Prompt Iteration Loop That 10x'd Our Email Open Rates", our_angle: "Apply the build-test-learn loop specifically to email marketing prompts", category: "email", hook: "One prompt. Five iterations. 47% open rate." },
    { original_title: "Claude just got employees", our_topic_idea: "How to Use Claude's New Features for Marketing Workflows", our_angle: "Practical marketing use cases, not technical deep dives", category: "productivity", hook: "Claude just replaced your marketing intern." },
    { original_title: "Your AI is Lying", our_topic_idea: "When to Trust (and Verify) AI-Generated Marketing Claims", our_angle: "How to fact-check AI copy before it goes live and damages your brand", category: "ads", hook: "That stat your AI wrote? It's fake." },
    { original_title: "Stop ignoring this", our_topic_idea: "The AI Prompt Skill That Separates $50K from $500K Marketers", our_angle: "System prompts and context-setting as the highest-leverage marketing skill", category: "growth", hook: "This one skill is worth $450K." },
  ];
}

// Get current inspiration ideas
function getIdeas() {
  return storage.read("inspiration-latest.json", { ideas: [], generatedAt: null });
}

module.exports = { run, getIdeas, INSPIRATION_SOURCE };
