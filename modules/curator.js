// ─────────────────────────────────────────────
// Content Curator Module
// Runs daily at 6:00 AM EST
// ─────────────────────────────────────────────
const claude = require("../lib/claude");
const storage = require("../lib/storage");

async function run() {
  console.log("[curator] Generating daily content ideas...");

  const ideas = await claude.generateContentIdeas();
  storage.saveContentIdeas(ideas);
  storage.logRun("curator");

  console.log(`[curator] Generated ${ideas.length} content ideas`);
  ideas.forEach((idea, i) => {
    console.log(`  ${i + 1}. [${idea.category}] ${idea.topic}`);
  });

  return ideas;
}

// Get current ideas
function getIdeas() {
  return storage.getContentIdeas();
}

module.exports = { run, getIdeas };
