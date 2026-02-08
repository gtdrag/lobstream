// Tier 1 — Keyword-based topic classifier
// Runs on every incoming post to detect topic matches via regex.
// No external dependencies.

// ── Topic keyword patterns ──────────────────────────────────────────────────
// Each pattern is a compiled RegExp (case-insensitive) built from an array of
// keyword phrases.  Word-boundary anchors (\b) prevent partial-word matches
// (e.g. "governor" will NOT trigger the "go" keyword under 'tech').

function buildPattern(keywords) {
  const escaped = keywords.map((kw) =>
    kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

// ── Individual topic patterns (exported for testing / extension) ────────────

export const aiPattern = buildPattern([
  'artificial intelligence',
  'machine learning',
  'neural net',
  'neural network',
  'deep learning',
  'LLM',
  'GPT',
  'ChatGPT',
  'Claude',
  'OpenAI',
  'Anthropic',
  'Gemini',
  'Llama',
  'Mistral',
  'transformer',
  'fine-tune',
  'fine-tuning',
  'RLHF',
  'diffusion model',
  'stable diffusion',
  'midjourney',
  'DALL-E',
  'copilot',
  'AI agent',
  'large language model',
  'generative AI',
  'foundation model',
  'prompt engineer',
  'RAG',
  'retrieval augmented',
  'computer vision',
  'NLP',
  'natural language processing',
  'reinforcement learning',
  'AGI',
  'superintelligence',
  'AI safety',
  'alignment',
]);

export const openclawPattern = buildPattern([
  'OpenClaw',
  'Clawdbot',
  'lobstream',
  'open claw',
  'open-claw',
]);

export const politicsPattern = buildPattern([
  'election',
  'congress',
  'senate',
  'president',
  'democrat',
  'republican',
  'liberal',
  'conservative',
  'policy',
  'legislation',
  'capitol',
  'governor',
  'parliament',
  'prime minister',
  'Biden',
  'Trump',
  'vote',
  'ballot',
  'campaign',
  'political',
  'partisan',
  'bipartisan',
  'impeach',
  'Supreme Court',
  'SCOTUS',
  'executive order',
  // Progressive / left-wing
  'capitalism',
  'socialism',
  'socialist',
  'fascism',
  'fascist',
  'antifascist',
  'anti-fascist',
  'inequality',
  'wealth gap',
  'billionaire',
  'oligarch',
  'working class',
  'union',
  'labor',
  'strike',
  'mutual aid',
  'solidarity',
  'abolish',
  'defund',
  'Medicare',
  'universal healthcare',
  'living wage',
  'minimum wage',
  'housing crisis',
  'gentrification',
  'climate justice',
  'racial justice',
  'social justice',
  'reparations',
  'colonialism',
  'imperialism',
  'propaganda',
  'protest',
  'activism',
  'activist',
  'grassroots',
  'progressive',
  'human rights',
  'civil rights',
  'LGBTQ',
  'trans rights',
  'reproductive rights',
  'abortion',
  'Roe v Wade',
  'authoritarianism',
  'white supremacy',
  'neo-nazi',
  'far right',
  'alt-right',
  'insurrection',
  'disinformation',
  'propaganda',
  'corporate greed',
  'late capitalism',
  'eat the rich',
  'class war',
  'austerity',
  'privatization',
  'nationalize',
]);

export const cryptoPattern = buildPattern([
  'bitcoin',
  'ethereum',
  'crypto',
  'blockchain',
  'NFT',
  'DeFi',
  'web3',
  'token',
  'solana',
  'dogecoin',
  'mining',
  'wallet',
  'exchange',
  'BTC',
  'ETH',
  'cryptocurrency',
  'decentralized',
  'smart contract',
  'Coinbase',
  'Binance',
  'altcoin',
  'stablecoin',
]);

export const financePattern = buildPattern([
  'stock market',
  'Wall Street',
  'S&P 500',
  'Dow Jones',
  'NASDAQ',
  'Federal Reserve',
  'interest rate',
  'inflation',
  'recession',
  'bull market',
  'bear market',
  'IPO',
  'hedge fund',
  'private equity',
  'earnings',
  'dividend',
  'bonds',
  'treasury',
  'yield curve',
  'forex',
  'commodities',
  'fintech',
  'banking',
  'JPMorgan',
  'Goldman Sachs',
  'venture capital',
]);

export const geopoliticsPattern = buildPattern([
  'geopolitics',
  'foreign policy',
  'diplomacy',
  'sanctions',
  'NATO',
  'United Nations',
  'European Union',
  'G7',
  'G20',
  'BRICS',
  'trade war',
  'tariff',
  'embargo',
  'treaty',
  'summit',
  'Ukraine',
  'Russia',
  'China',
  'Taiwan',
  'Middle East',
  'Gaza',
  'Israel',
  'Iran',
  'North Korea',
  'OPEC',
  'coup',
  'Pentagon',
  'CIA',
  'nuclear',
  'missile',
  'defense',
  'military',
  'refugee',
  'immigration',
  'climate change',
  'World Bank',
  'IMF',
  'WTO',
  'Brexit',
  'sovereignty',
]);

export const techPattern = buildPattern([
  'programming',
  'software',
  'developer',
  'startup',
  'silicon valley',
  'app',
  'code',
  'open source',
  'GitHub',
  'API',
  'database',
  'cloud computing',
  'cybersecurity',
  'SaaS',
  'DevOps',
  'microservices',
  'kubernetes',
  'docker',
  'frontend',
  'backend',
  'full stack',
  'JavaScript',
  'Python',
  'Rust',
  'Go',
  'TypeScript',
]);

export const sciencePattern = buildPattern([
  'research',
  'study',
  'NASA',
  'climate',
  'physics',
  'biology',
  'chemistry',
  'genome',
  'CRISPR',
  'quantum',
  'telescope',
  'Mars',
  'experiment',
  'peer review',
  'journal',
  'scientist',
  'discovery',
  'breakthrough',
  'evolution',
  'vaccine',
  'neuroscience',
]);

// ── Ordered lookup table ────────────────────────────────────────────────────
// Maps topic name -> { pattern, confidence }.
// openclaw gets a higher confidence (0.95) because matches are very specific;
// all other topics use 0.8.

const topics = [
  { name: 'ai',          pattern: aiPattern,          confidence: 0.8  },
  { name: 'openclaw',    pattern: openclawPattern,    confidence: 0.95 },
  { name: 'politics',    pattern: politicsPattern,    confidence: 0.8  },
  { name: 'crypto',      pattern: cryptoPattern,      confidence: 0.8  },
  { name: 'finance',     pattern: financePattern,     confidence: 0.8  },
  { name: 'geopolitics', pattern: geopoliticsPattern, confidence: 0.8  },
  { name: 'tech',        pattern: techPattern,        confidence: 0.8  },
  { name: 'science',     pattern: sciencePattern,     confidence: 0.8  },
];

// ── classify(text) ──────────────────────────────────────────────────────────
// Returns { topics: string[], confidence: number, tier: 1 } when at least one
// topic matches, or null when nothing matches.
//
// A single post can match multiple topics.  The returned confidence is the
// highest confidence among all matched topics (so if openclaw matches alongside
// another topic, the result confidence is 0.95).

export function classify(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }

  const matched = [];
  let highestConfidence = 0;

  for (const topic of topics) {
    if (topic.pattern.test(text)) {
      matched.push(topic.name);
      if (topic.confidence > highestConfidence) {
        highestConfidence = topic.confidence;
      }
    }
  }

  if (matched.length === 0) {
    return null;
  }

  return {
    topics: matched,
    confidence: highestConfidence,
    tier: 1,
  };
}
