// Client-side keyword filter for browser-native sources.
// Matches posts related to AI coding / AI development specifically.

const AI_CODING_PATTERN = new RegExp([
  // AI/ML core
  'artificial intelligence', 'machine learning', 'deep learning', 'neural net',
  'LLM', 'large language model', 'GPT', 'ChatGPT', 'Claude', 'Gemini',
  'OpenAI', 'Anthropic', 'Mistral', 'Llama', 'Copilot', 'AI agent',
  'generative AI', 'foundation model', 'transformer',
  // AI coding tools
  'Cursor', 'Windsurf', 'Codeium', 'Tabnine', 'CodeWhisperer',
  'GitHub Copilot', 'Devin', 'SWE-bench', 'aider', 'Continue\\.dev',
  'AI coding', 'AI code', 'AI programming', 'AI developer', 'AI engineer',
  'vibe coding', 'vibe-coding', 'vibecoding',
  'code generation', 'code completion', 'code assistant',
  // AI dev concepts
  'prompt engineer', 'fine.?tun', 'RAG', 'retrieval augmented',
  'embeddings?', 'vector database', 'langchain', 'llamaindex',
  'hugging.?face', 'tokenizer', 'inference', 'RLHF',
  'AI API', 'model training', 'model deploy',
  'diffusion model', 'stable diffusion', 'midjourney', 'DALL-E',
  'computer vision', 'NLP', 'natural language processing',
  'AGI', 'superintelligence', 'AI safety', 'alignment',
  // OpenClaw
  'OpenClaw', 'Clawdbot', 'lobstream', 'open.?claw',
].map(kw => `\\b${kw}\\b`).join('|'), 'i');

// Check if text is mostly English (Latin characters).
// Returns true if >= 70% of letter characters are Latin.
function isMostlyEnglish(text) {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length === 0) return false;
  const latinCount = (letters.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
  return latinCount / letters.length >= 0.7;
}

export function matchesAICoding(text) {
  if (!text) return false;
  if (!isMostlyEnglish(text)) return false;
  return AI_CODING_PATTERN.test(text);
}
