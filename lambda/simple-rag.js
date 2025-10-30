// simple-rag.js - Lightweight RAG (TF-IDF) for portfolio chatbot
// Exports: getRelevantContext(userMessage, portfolioDocs)

const natural = require('natural');
const tokenizer = new natural.WordTokenizer();


// portfolioDocs: [{ title, content, source }]
function getRelevantContext(userMessage, portfolioDocs) {
  if (!Array.isArray(portfolioDocs)) return { context: '', sources: [] };
  const greetings = [
    'hello', 'hi', 'hey', 'greetings', 'bonjour', 'salut', 'hola', 'hallo', 'ciao', 'yo', 'good morning', 'good afternoon', 'good evening'
  ];
  const msg = userMessage.trim().toLowerCase();
  if (greetings.some(g => msg === g || msg.startsWith(g + ' ') || msg.endsWith(' ' + g))) {
    return {
      context: "This is a greeting. Respond with a warm, friendly welcome and offer to help with portfolio questions.",
      sources: []
    };
  }
  const questionTokens = tokenizer.tokenize(msg);

  // Keyword hints to boost relevant documents (e.g., certifications)
  const hints = [
    'certification', 'certifications', 'certificate', 'certified', 'ai', 'ml', 'machine', 'learning', 'deep', 'learning', 'project', 'experience', 'skill'
  ];

  let scored = portfolioDocs.map(doc => {
    const content = (doc.content || '').toLowerCase();
    const title = (doc.title || '').toLowerCase();
    const docTokens = tokenizer.tokenize(content + ' ' + title);
    // Simple TF overlap
    let score = questionTokens.filter(t => docTokens.includes(t)).length;
    // Boost by keyword hints
    for (const h of hints) {
      if (content.includes(h) || title.includes(h)) score += 0.5;
    }
    return { ...doc, score };
  });
  scored = scored.filter(d => d.score > 0).sort((a, b) => b.score - a.score);
  // Take top 2-3 docs
  let top = scored.slice(0, 3);

  // If nothing scored and the question mentions certifications, fallback to keyword filter
  if (!top.length && /certif/.test(msg)) {
    const filtered = portfolioDocs.filter(d => (d.content || '').toLowerCase().includes('certif'));
    top = filtered.slice(0, 3);
  }

  // Build concise context: prefer sentences that match question tokens or hints
  const want = new Set([...questionTokens, ...hints]);
  const sentSplit = (txt) => (txt || '').split(/(?<=[\.!?])\s+/);
  let pieces = [];
  for (const d of top) {
    const sents = sentSplit(d.content || '');
    const matched = sents.filter(s => {
      const lower = s.toLowerCase();
      for (const w of want) if (lower.includes(w)) return true;
      return false;
    });
    if (matched.length) pieces.push(matched.join(' '));
    else pieces.push((d.content || '').slice(0, 400));
  }
  let context = pieces.join('\n---\n');
  if (context.length > 1500) context = context.slice(0, 1500);
  const sources = top.map(d => d.source || d.title).filter(Boolean);
  return { context, sources };
}

module.exports = { getRelevantContext };
