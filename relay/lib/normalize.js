const MAX_TEXT_LENGTH = 2000;

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Check if text is mostly English (Latin characters).
 * Returns true if >= 70% of letter characters are Latin.
 */
export function isMostlyEnglish(text) {
  if (!text) return false;
  const letters = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (letters.length === 0) return false;
  const latinCount = (letters.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
  return latinCount / letters.length >= 0.7;
}

/**
 * Normalize a raw message from any source into a consistent format.
 *
 * @param {object} rawMessage - Raw data from a source connector
 * @param {string} rawMessage.source - Source identifier (e.g. 'mastodon', 'fourchan')
 * @param {string} rawMessage.text - Message text (may contain HTML)
 * @param {string} [rawMessage.author] - Author name or handle
 * @param {number|string} [rawMessage.timestamp] - Unix timestamp in ms, or ISO string
 * @returns {{ source: string, text: string, author: string, timestamp: number }}
 */
export function normalize(rawMessage) {
  const { source, text, author, timestamp } = rawMessage;

  // Strip HTML and trim whitespace
  let cleaned = stripHtml(text).trim();

  // Truncate to max length
  if (cleaned.length > MAX_TEXT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_TEXT_LENGTH);
  }

  // Parse timestamp to unix ms
  let ts;
  if (typeof timestamp === 'number') {
    ts = timestamp;
  } else if (typeof timestamp === 'string') {
    ts = new Date(timestamp).getTime();
  } else {
    ts = Date.now();
  }

  return {
    source: source || 'unknown',
    text: cleaned,
    author: author || 'anonymous',
    timestamp: ts,
  };
}
