// Client-side keyword filter for browser-native sources.
// Matches posts related to AI, coding, tech, finance, geopolitics, and science.

const TOPIC_PATTERN = new RegExp([
  // AI/ML core
  'artificial intelligence', 'machine learning', 'deep learning', 'neural net',
  'LLM', 'large language model', 'GPT', 'ChatGPT', 'Claude', 'Gemini',
  'OpenAI', 'Anthropic', 'Mistral', 'Llama', 'Copilot', 'AI agent',
  'generative AI', 'foundation model', 'transformer',
  // AI coding tools
  'Cursor', 'Windsurf', 'Codeium', 'Tabnine', 'CodeWhisperer',
  'GitHub Copilot', 'Devin', 'SWE-bench', 'aider',
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
  // AI criticism & social commentary
  'AI hype', 'AI bubble', 'AI slop', 'AI grift', 'AI bro',
  'techbro', 'tech bro', 'AI doom', 'AI doomer', 'AI risk',
  'AI replace', 'AI job', 'AI layoff', 'AI takeover',
  'AI hallucin', 'AI bias', 'AI ethic', 'AI regulation',
  'AI copyright', 'AI theft', 'AI scraping', 'AI plagiar',
  'anti.?AI', 'ban AI', 'AI protest', 'AI strike',
  'AI art theft', 'AI generated', 'AI content', 'AI spam',
  'deepfake', 'misinformation', 'disinformation',
  'Luddite', 'techno.?feudal', 'surveillance',
  // General tech & programming
  'programming', 'software engineer', 'developer', 'open source',
  'GitHub', 'API', 'database', 'cloud computing', 'cybersecurity',
  'DevOps', 'kubernetes', 'docker', 'frontend', 'backend', 'full stack',
  'JavaScript', 'TypeScript', 'Python', 'Rust', 'golang',
  'React', 'Node\\.js', 'Linux', 'server', 'deploy',
  'startup', 'silicon valley', 'Y Combinator', 'venture capital',
  'bug', 'debug', 'refactor', 'pull request', 'merge',
  'algorithm', 'data structure', 'compiler', 'runtime',
  // Finance & crypto
  'stock market', 'Wall Street', 'S&P 500', 'Dow Jones', 'NASDAQ',
  'Federal Reserve', 'interest rate', 'inflation', 'recession',
  'bull market', 'bear market', 'IPO', 'hedge fund', 'private equity',
  'earnings', 'dividend', 'bonds?', 'treasury', 'yield curve',
  'forex', 'commodities', 'oil price', 'gold price',
  'Bitcoin', 'Ethereum', 'crypto', 'blockchain', 'DeFi',
  'NFT', 'Web3', 'Solana', 'altcoin', 'stablecoin',
  'Coinbase', 'Binance', 'SEC', 'regulation',
  'fintech', 'banking', 'JPMorgan', 'Goldman Sachs',
  // Geopolitics & world affairs
  'geopolitic', 'foreign policy', 'diplomacy', 'sanction',
  'NATO', 'United Nations', 'EU', 'European Union', 'G7', 'G20', 'BRICS',
  'trade war', 'tariff', 'embargo', 'treaty', 'summit',
  'Ukraine', 'Russia', 'China', 'Taiwan', 'Middle East', 'Gaza', 'Israel',
  'Iran', 'North Korea', 'OPEC', 'coup', 'election',
  'Pentagon', 'CIA', 'intelligence', 'espionage', 'cyber.?attack',
  'nuclear', 'missile', 'defense', 'military', 'war',
  'refugee', 'immigration', 'border', 'asylum',
  'climate change', 'Paris Agreement', 'COP\\d+',
  'World Bank', 'IMF', 'WTO',
  'Congress', 'Senate', 'White House', 'Supreme Court',
  'Brexit', 'sovereignty', 'territorial',
  // Science & tech news
  'robotics', 'quantum computing',
  'NASA', 'SpaceX', 'Tesla', 'Apple', 'Google', 'Microsoft', 'Meta',
  'chip', 'semiconductor', 'GPU', 'NVIDIA', 'AMD',
  // OpenClaw
  'OpenClaw', 'Clawdbot', 'lobstream', 'open.?claw',
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
