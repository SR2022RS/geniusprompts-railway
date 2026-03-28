// ─────────────────────────────────────────────
// Claude API wrapper
// ─────────────────────────────────────────────
const Anthropic = require("@anthropic-ai/sdk");

let client = null;

function getClient() {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_API;
    if (!key) {
      console.warn("[claude] ANTHROPIC_API_KEY not set — running in demo mode");
      return null;
    }
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

async function generate(systemPrompt, userPrompt, options = {}) {
  const claude = getClient();
  if (!claude) {
    return { content: null, demo: true, error: "No API key" };
  }

  try {
    const response = await claude.messages.create({
      model: options.model || "claude-sonnet-4-20250514",
      max_tokens: options.maxTokens || 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0]?.text || "";
    return { content: text, demo: false };
  } catch (err) {
    console.error("[claude] API error:", err.message);
    return { content: null, demo: true, error: err.message };
  }
}

// Generate a newsletter draft
async function generateNewsletter(topic, affiliateInfo) {
  const systemPrompt = `You are an expert email newsletter writer for "GeniusPrompts," a platform that helps marketers craft better AI prompts. Write engaging, actionable newsletter content that provides real value. Keep the tone professional but conversational. Always include practical tips readers can use immediately.

Format your response as JSON with these fields:
- subject: compelling email subject line (under 60 chars)
- preheader: preview text (under 100 chars)
- greeting: personalized opener
- mainContent: the main body (3-4 paragraphs, use markdown for formatting)
- tipOfTheWeek: a specific, actionable prompt tip
- toolSpotlight: a brief review of the affiliate tool (2-3 sentences)
- callToAction: clear CTA text
- signoff: brief sign-off`;

  const userPrompt = `Write this week's newsletter about: "${topic}"

Include a "Tool of the Week" spotlight for: ${affiliateInfo.name} (${affiliateInfo.url})
Tool description: ${affiliateInfo.description}

Make it feel personal and valuable — not salesy.`;

  const result = await generate(systemPrompt, userPrompt);
  if (result.content) {
    try {
      // Try to parse JSON from the response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return { ...JSON.parse(jsonMatch[0]), demo: false };
      }
    } catch {
      // If JSON parse fails, return raw content
      return { subject: topic, mainContent: result.content, demo: false };
    }
  }
  return getDemoNewsletter(topic, affiliateInfo);
}

// Generate content ideas
async function generateContentIdeas() {
  const systemPrompt = `You are a content strategist for "GeniusPrompts," an AI prompt tool for marketers. Generate fresh, specific newsletter topic ideas that would be valuable to our audience of marketers, copywriters, and content creators.

Format your response as a JSON array of objects with:
- topic: the topic title
- angle: the specific angle or hook
- category: one of (copywriting, email, social, ads, growth, productivity)
- estimatedEngagement: "high", "medium", or "low"`;

  const userPrompt = `Generate 5 newsletter topic ideas for this week. Focus on timely, practical topics about using AI prompts effectively. Consider trends in AI, marketing, and content creation. Each idea should be specific enough to write about immediately.

Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

  const result = await generate(systemPrompt, userPrompt);
  if (result.content) {
    try {
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to demo
    }
  }
  return getDemoIdeas();
}

// Demo fallbacks
function getDemoNewsletter(topic, affiliateInfo) {
  return {
    subject: `This Week: ${topic}`,
    preheader: "Your weekly dose of AI prompt mastery",
    greeting: "Hey there, prompt genius!",
    mainContent: `This week we're diving into **${topic}**. This is a demo draft — connect your Anthropic API key to get AI-generated content.\n\nIn the meantime, here's what you should know: great prompts start with clear context, specific constraints, and a defined output format.`,
    tipOfTheWeek: "Try adding 'Think step by step' to complex prompts — it dramatically improves reasoning quality.",
    toolSpotlight: `Check out ${affiliateInfo.name} — ${affiliateInfo.description}`,
    callToAction: "Try the GeniusPrompts generator now",
    signoff: "Keep prompting,\nThe GeniusPrompts Team",
    demo: true,
  };
}

function getDemoIdeas() {
  return [
    { topic: "5 Prompt Frameworks Every Marketer Should Know", angle: "Framework comparison", category: "copywriting", estimatedEngagement: "high" },
    { topic: "How to Use AI Prompts for Email A/B Testing", angle: "Data-driven approach", category: "email", estimatedEngagement: "high" },
    { topic: "The Art of Writing Prompts That Convert on Social", angle: "Platform-specific tips", category: "social", estimatedEngagement: "medium" },
    { topic: "Prompt Chaining: Advanced Technique for Complex Content", angle: "Tutorial walkthrough", category: "productivity", estimatedEngagement: "medium" },
    { topic: "AI Ads That Actually Convert: Prompt Secrets", angle: "Case study style", category: "ads", estimatedEngagement: "high" },
  ];
}

module.exports = { generate, generateNewsletter, generateContentIdeas };
