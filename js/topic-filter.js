// Client-side keyword filter for browser-native sources.
// Focused on Claude, Anthropic, and AI/LLM content.

const TOPIC_PATTERN = new RegExp([
  // Claude & Anthropic (primary focus)
  'Claude', 'Anthropic', 'Claude Code', 'Claude Opus', 'Claude Sonnet',
  'Claude Haiku', 'Claude API', 'claude\\.ai', 'anthropic\\.com',
  'Constitutional AI', 'RLHF',
  // AI/LLM core
  'artificial intelligence', 'machine learning', 'deep learning', 'neural net',
  'LLM', 'large language model', 'GPT', 'ChatGPT', 'Gemini',
  'OpenAI', 'Mistral', 'Llama', 'Copilot', 'AI agent',
  'generative AI', 'foundation model',
  // AI coding tools
  'Cursor', 'Windsurf', 'Codeium', 'Tabnine', 'CodeWhisperer',
  'GitHub Copilot', 'Devin', 'SWE-bench', 'aider',
  'AI coding', 'AI code', 'AI programming', 'AI developer',
  'vibe coding', 'vibe-coding', 'vibecoding',
  'code generation', 'code completion', 'code assistant',
  // AI concepts
  'prompt engineer', 'fine.?tun', 'RAG', 'retrieval augmented',
  'embeddings?', 'vector database', 'langchain', 'llamaindex',
  'hugging.?face', 'tokenizer', 'inference',
  'diffusion model', 'stable diffusion', 'midjourney', 'DALL-E',
  'computer vision', 'NLP', 'natural language processing',
  'AGI', 'superintelligence', 'AI safety', 'alignment',
  'transformer', 'attention mechanism', 'context window',
  // AI social commentary
  'AI hype', 'AI bubble', 'AI slop', 'AI grift',
  'AI doom', 'AI risk', 'AI replace', 'AI job', 'AI takeover',
  'AI hallucin', 'AI bias', 'AI ethic', 'AI regulation',
  'AI copyright', 'AI generated', 'deepfake',
  'anti.?AI', 'AI art',
  // AI companies & products
  'Perplexity', 'Cohere', 'Stability AI', 'Runway',
  'Inflection', 'Character\\.AI', 'Replika', 'Jasper AI',
  'Scale AI', 'Weights & Biases', 'Hugging Face',
  'NVIDIA', 'GPU', 'TPU', 'chip', 'semiconductor',
  // OpenClaw & Moltbook
  'OpenClaw', 'Clawdbot', 'lobstream', 'open.?claw',
  'Moltbook', 'submolt', 'Crustafarianism', 'molt',
].map(kw => `\\b${kw}\\b`).join('|'), 'i');

// Check if text is mostly English (Latin characters).
function isMostlyEnglish(text) {
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length === 0) return false;
  const latinCount = (letters.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
  return latinCount / letters.length >= 0.7;
}

export function matchesAICoding(text) {
  if (!text) return false;
  if (!isMostlyEnglish(text)) return false;
  return TOPIC_PATTERN.test(text);
}
