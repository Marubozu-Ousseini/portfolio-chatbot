const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const s3 = new S3Client({ region });
const bedrock = new BedrockRuntimeClient({ region });
const BUCKET = process.env.S3_BUCKET_NAME;
const DATA_KEY = 'portfolio-documents.json';
const DATA_PREFIX = process.env.S3_DATA_PREFIX || 'rag-data/';
const MODEL_ID = 'meta.llama3-8b-instruct-v1:0';
// Runtime scraping disabled by default to reduce cost/latency. Use precomputed S3 docs instead.
const SCRAPE_URLS = [];
const { getRelevantContext } = require('./simple-rag');
const fs = require('fs');
const path = require('path');

function loadSiteConfig() {
  try {
    const cfgPath = path.join(__dirname, 'config.js');
    if (!fs.existsSync(cfgPath)) return {};
    try {
      // Try Node-style require first
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(cfgPath);
      return mod && (mod.siteContent || mod.default || mod) || {};
    } catch (_) {
      // Fallback: evaluate browser-style config that sets window.siteContent
      const vm = require('vm');
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const sandbox = { window: {} };
      vm.runInNewContext(raw, sandbox);
      return sandbox.window.siteContent || sandbox.window.config || {};
    }
  } catch (e) {
    console.warn('Config load failed:', e.message);
    return {};
  }
}

function getBotSettings() {
  const cfg = loadSiteConfig();
  const chatbot = (cfg && cfg.chatbot) || {};
  return {
    experienceOnlyOnAsk: chatbot.experienceOnlyOnAsk !== false, // default true
    ragTriggerTopics: Array.isArray(chatbot.ragTriggerTopics) && chatbot.ragTriggerTopics.length
      ? chatbot.ragTriggerTopics
      : ['experience', 'experiences', 'management', 'leadership', 'crypto', 'cryptocurrency', 'blockchain', 'teaching', 'mentor', 'mentoring', 'business', 'administration', 'business administration'],
  };
}

function shouldUseRag(userMessage, settings) {
  const msg = String(userMessage || '').toLowerCase();
  const topics = (settings && settings.ragTriggerTopics) || [];
  return topics.some(t => t && msg.includes(String(t).toLowerCase()));
}

async function streamToString(body) {
  if (!body) return '';
  // body can be a Uint8Array or a stream
  if (body instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(body);
  }
  if (typeof body.text === 'function') {
    return body.text();
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    body.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    body.on('error', reject);
    body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

// Strip common Markdown markers and normalize whitespace (plain text only)
function stripMarkdown(s) {
  let t = String(s || '');
  // Remove fenced code blocks
  t = t.replace(/```[\s\S]*?```/g, ' ');
  // Inline code
  t = t.replace(/`([^`]+)`/g, '$1');
  // Headings
  t = t.replace(/^[ \t]*#{1,6}\s+.*$/gm, ' ');
  // Blockquotes
  t = t.replace(/^>\s?/gm, '');
  // Lists (-, *, +, or numbered)
  t = t.replace(/^[\t ]*(?:[-*+]|\d+\.)\s+/gm, '');
  // Bold/italic
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');
  // Horizontal rules
  t = t.replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '');
  // Tables - drop pipes (keep text)
  t = t.replace(/\|/g, ' ');
  // Collapse whitespace
  t = t.replace(/\r/g, ' ').split('\n').map(x => x.trim()).filter(Boolean).join(' ');
  return t.trim();
}

function ensureSentenceEnds(text) {
  if (!text) return text;
  const t = String(text).trim();
  if (/[\.!?]$/.test(t)) return t;
  return t + '.';
}

// Lightweight language detection (English vs French) using accents and common tokens
function detectLanguage(userMessage = '') {
  const msg = String(userMessage || '').toLowerCase();
  if (!msg) return 'en';
  // Immediate French detection for common greetings or explicit language mention
  if (/\b(bonjour|salut|fran[cç]ais)\b/.test(msg)) return 'fr';
  const hasAccents = /[àâçéèêëîïôùûüÿœæ]/i.test(msg);
  const frHints = [
    'bonjour', 'salut', 'merci', "s'il", 's’il', 'svp', 'comment', 'vous', 'tu', 'êtes', 'etre', 'est-ce',
    'quel', 'quelle', 'quels', 'quelles', 'où', 'pourquoi', 'parlez', 'français', 'francais',
    'tarif', 'tarifs', 'prix', 'disponibilité', 'disponibilite', 'projet', 'projets', 'compétence', 'competence',
    'certification', 'collaborer', 'embaucher', 'contacter', 'contacte', 'aide'
  ];
  let score = 0;
  for (const h of frHints) if (msg.includes(h)) score += 1;
  if (hasAccents) score += 1;
  return score >= 2 ? 'fr' : 'en';
}

// Helper: pick top-N docs by keyword frequency
function pickTopDocs(docs, keywords, limit = 3) {
  const scores = docs.map((d, idx) => {
    const text = `${d.title || ''} ${d.content || ''}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const re = new RegExp(kw, 'gi');
      const matches = text.match(re);
      if (matches) score += matches.length;
    }
    return { idx, score };
  });
  scores.sort((a, b) => b.score - a.score);
  const result = [];
  for (const s of scores) {
    if (s.score <= 0) break;
    result.push(docs[s.idx]);
    if (result.length >= limit) break;
  }
  return result;
}

// Load documents from legacy JSON and any files under a prefix in S3
async function loadPortfolioDocsFromS3() {
  const docs = [];
  // 1) Legacy single JSON file (array or single doc)
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: DATA_KEY }));
    const text = await streamToString(obj.Body);
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) docs.push(...parsed);
      else if (parsed && (parsed.title || parsed.content)) docs.push(parsed);
    } catch (e) {
      console.warn('Legacy JSON parse failed:', e.message);
    }
  } catch (e) {
    if (e.code !== 'NoSuchKey') {
      console.warn('Legacy load skipped:', e.message);
    }
  }

  // 2) Any files under prefix (JSON arrays, JSON single doc, txt/md)
  try {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: DATA_PREFIX }));
    for (const item of (listed.Contents || [])) {
      const key = item.Key;
      if (!key || key.endsWith('/')) continue;
      if (key === DATA_KEY || key.endsWith('/' + DATA_KEY)) continue;
      const ext = (key.split('.').pop() || '').toLowerCase();
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const body = await streamToString(obj.Body);
        if (ext === 'json') {
          try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed)) docs.push(...parsed);
            else if (parsed && (parsed.title || parsed.content)) docs.push(parsed);
          } catch (err) {
            console.error('Bad JSON in', key, err.message);
          }
        } else if (ext === 'txt' || ext === 'md') {
          docs.push({ title: key.replace(DATA_PREFIX, ''), content: body, source: `s3:${key}` });
        }
      } catch (err) {
        console.warn('Failed to read', key, err.message);
      }
    }
  } catch (e) {
    console.warn('Prefix listing skipped:', e.message);
  }

  // Deduplicate (title + first 40 chars of content)
  const seen = new Set();
  const unique = [];
  for (const d of docs) {
    const t = String(d.title || '').trim();
    const c = String(d.content || '').slice(0, 40);
    const k = `${t}::${c}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(d);
    }
  }
  return unique;
}

// --- START: Dynamic Prompt Definitions ---

// Prompt for RAG-based portfolio chatbot query generation (STAR format for projects)
const STAR_PROMPT_PROJECTS = (selectedInfo, isFrench) => {
  const langPrompt = isFrench ? `Réponds en français. Utilise les termes Situation, Tâche, Action, Résultat.` : `Respond in English. Use the terms Situation, Task, Action, Result.`;

  return `You are Sensei, a professional smart portfolio assistant representing Ousseini's work.
  Using ONLY the information below, prepare 2-3 concise STAR-formatted examples about AI, Machine Learning, or Cloud projects.

  Information:
  ${selectedInfo}

  Guidelines:
  - Provide 2-3 examples MAXIMUM.
  - Each example MUST include: **Situation, Task, Action, Result** (labeled clearly).
  - Keep each example to **3-4 short, punchy sentences** total.
  - Be specific and concrete using ONLY the provided information.
  - NO URLs, NO assumptions.
  - Focus strictly on AI/ML/Cloud projects/experience.
  - Start each example on a new line.
  - **${langPrompt}**
  - Avoid redundancy and verbose language.

  Response:`;
};

// Main RAG Response Prompt (for non-project questions like skills, certifications, general experience)
const MAIN_RESPONSE_PROMPT = (context, userMessage, userName, isFrench) => {
  const namePhrase = userName ? `, ${userName}` : '';
  const langPrompt = isFrench ? `Réponds en français. Adresse l'utilisateur par son nom si pertinent: "${userName}".` : `Respond in English. Address the user by name if appropriate: "${userName}".`;

  return `You are Sensei, an AI assistant for Ousseini's professional portfolio website.
  Your primary goal is to provide accurate, specific, and concise answers using ONLY the 'Retrieved Information' below.

  CRITICAL IDENTITY RULES:
  - YOU are Sensei (the AI assistant).
  - Ousseini is the portfolio owner (he/him/his).
  - Never confuse the two.

  Retrieved Information:
  ${context}

  User Question: ${userMessage}

  Response Guidelines:
  - **Be accurate and specific:** ONLY use the information provided in 'Retrieved Information'.
  - **No echo:** Do NOT repeat or paraphrase the user's question. Do not start with phrases like "You asked...". Start directly with the answer.
  - **Stay on-topic:** Do not mention Ousseini's experiences, projects, or skills unless the user explicitly asks about them. Avoid unsolicited summaries or self-promotion.
  - **Concision:** Keep the response under 200 words and strictly answer the user's request.
  - **No self-evaluation:** Do NOT append meta questions or reflective checks like "Is this response accurate and concise?" or anything asking the user to validate guideline compliance.
  - **Fall-back:** If information is truly missing, say: "${isFrench ? "Je n'ai pas cette information précise" + namePhrase + ". Comment puis-je vous aider autrement ?" : "I don't have that specific information" + namePhrase + ". How can I help further?"}"
  - **Tone:** Maintain a friendly, professional, and confident tone.
  - **${langPrompt}**
  - **DO NOT** use STAR format (that is reserved for project questions).
  - **For Contact/Pricing:** Redirect to: "${isFrench ? 'Pour les tarifs, la disponibilité ou une collaboration, veuillez visiter la section contact sur https://ousseinioumarou.com/#contact pour prendre directement contact.' : 'For pricing, availability, or collaboration inquiries, please visit the contact section at https://ousseinioumarou.com/#contact to reach out directly.'}"

  Response:`;
};

// Greeting Handler Prompt (for conversation initiation)
const GREETING_PROMPT = (userMessage, userName, isFrench, experienceOnlyOnAsk) => {
  const namePrompt = userName ? (isFrench ? `Bonjour ${userName} !` : `Hello ${userName}!`) : (isFrench ? `Comment vous appelez-vous ?` : `What is your name?`);
  const intro = isFrench
    ? (experienceOnlyOnAsk ? `Je suis Sensei, l'assistant d'Ousseini. ${namePrompt}` : `Je suis Sensei, l'assistant d'Ousseini, et je peux aussi partager ses expériences si vous le souhaitez. ${namePrompt}`)
    : (experienceOnlyOnAsk ? `I'm Sensei, Ousseini's portfolio assistant. ${namePrompt}` : `I'm Sensei, Ousseini's portfolio assistant, and I can share his experiences if you'd like. ${namePrompt}`);

  return `You are Sensei, Ousseini's portfolio assistant. The user is starting a conversation. Respond warmly and use the following template to maintain persona.

  User message: ${userMessage}

  Response Guideline:
  - Respond ONLY with the following message, tailored to the language: "${intro}"
  - NO need to generate text via the LLM for this prompt, just return the instruction.

  Response:`;
};

// Farewell Handler Prompt
const FAREWELL_PROMPT = (userMessage, userName, isFrench) => {
  const namePhrase = userName ? `, ${userName}` : '';
  const farewellMsg = isFrench
    ? `Merci de votre visite${namePhrase} ! N'hésitez pas à revenir si vous avez d'autres questions sur le portfolio d'Ousseini. Au revoir !`
    : `Thank you for visiting${namePhrase}! Feel free to return if you have any more questions about Ousseini's portfolio. Goodbye!`;

  return `You are Sensei. The user is saying goodbye. Respond warmly and use the following template to maintain persona.

  User message: ${userMessage}

  Response Guideline:
  - Respond ONLY with the following message, tailored to the language: "${farewellMsg}"
  - Keep response under 2 sentences.
  - NO need to generate text via the LLM for this prompt, just return the instruction.

  Response:`;
};

// --- END: Dynamic Prompt Definitions ---


exports.handler = async (event) => {
  try {
    // Lightweight health/status endpoint for GET /status
    const method = (event && event.requestContext && event.requestContext.http && event.requestContext.http.method) || event.httpMethod || '';
    const rawPath = event.rawPath || (event.requestContext && event.requestContext.http && event.requestContext.http.path) || event.path || '';
    if (String(method).toUpperCase() === 'GET' && /\/status$/i.test(String(rawPath))) {
      const payload = {
        status: 'ok',
        region,
        modelId: MODEL_ID,
        bucket: BUCKET || null,
        prefix: DATA_PREFIX || null,
        time: new Date().toISOString()
      };
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(payload)
      };
    }

    // Parse input
    const body = event.body ? JSON.parse(event.body) : {};
    const userMessage = body.message;
    const userName = (typeof body.name === 'string' ? body.name : '')
      .replace(/[^\p{L} '\-]/gu, '')
      .trim();
    if (!userMessage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing message' })
      };
    }
    const lang = detectLanguage(userMessage);
    const isFrench = lang === 'fr';
    // Global rule: any French input gets a fixed disclaimer response and stops.
    if (isFrench) {
      const msg = "Bonjour ! Je peux répondre uniquement en anglais. Please ask your questions in English. Please tell me your name so I can personalize replies.";
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      };
    }
  // Load feature flags from config and portfolio data from S3 (legacy file + any docs under prefix)
  const settings = getBotSettings();
  let portfolioDocs = await loadPortfolioDocsFromS3();
  const configOnlyDocs = (portfolioDocs || []).filter(d => String(d.source || '').toLowerCase() === 'config.js');

    // Scraping disabled; rely solely on S3-provided portfolioDocs
    
    // Check for Greetings and Farewells first
    const isGreeting = /(hi|hello|hey|greetings|bonjour|salut|coucou)/i.test(userMessage) && !/(what|who|where|how|when|cert|skill|project)/i.test(userMessage);
    const isFarewell = /(bye|goodbye|cya|later|thank|thanks|merci|au\s*revoir|a\s*bientot|finish|stop)/i.test(userMessage);

    if (isGreeting) {
      // Ask for name at chat start if not provided
      const askNameTail = userName ? '' : ' Please tell me your name so I can personalize replies.';
      // French greeting: acknowledge in FR, but inform English-only for answers
      if (isFrench) {
        const greet = userName ? `Bonjour ${userName} !` : 'Bonjour !';
        const msg = `${greet} Je peux répondre uniquement en anglais. Please ask your questions in English.${askNameTail}`;
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        };
      }
      // Default English greeting
      const hello = userName ? `Hello ${userName}!` : 'Hello!';
      const intro = `${hello} I'm Sensei, Ousseini's portfolio assistant. How can I assist you today?${askNameTail}`;
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: intro })
      };
    }

    // Fast-path: simple factoid Q&A should return concise answers without LLM when possible
    const wantsAgentName = /(what\s+is\s+)?(the\s+)?name\s+of\s+(the\s+)?(ai|assistant|chatbot|agent)\b|\b(ai|assistant|chatbot|agent)\b.*\bname\b|\bwhat\s+is\s+your\s+name\b/i.test(userMessage);
    if (wantsAgentName) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Sensei' })
      };
    }
          // Redundant safeguard (kept for safety). French inputs are already handled above with a fixed message.
          if (isFrench) {
            const msg = "Bonjour ! Je peux répondre uniquement en anglais. Please ask your questions in English. Please tell me your name so I can personalize replies.";
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg })
            };
          }

    // Early concise handler: "about Ousseini" or bio-style queries
    const wantsAbout = /(tell\s+me\s+about\s+(ousseini|you|the\s+(owner|author))|who\s+is\s+(ousseini|the\s+owner|the\s+author)|about\s+(ousseini|you))/i.test(userMessage);
    if (wantsAbout) {
      // Prefer an explicit About/Summary doc from config only
      let aboutDoc = (configOnlyDocs || []).find(d => /^about$/i.test(String(d.title || '')) || /^summary$/i.test(String(d.title || '')));
      if (!aboutDoc) {
        // Fallback: pick the richest doc containing first-person bio cues
        const candidates = (configOnlyDocs || []).filter(d => /\b(i am|cloud|ai|consultant|experience|skills)\b/i.test(String(d.content || '')));
        aboutDoc = candidates.sort((a, b) => (String(b.content||'').length||0) - (String(a.content||'').length||0))[0];
      }
      if (aboutDoc && aboutDoc.content) {
        const sents = String(aboutDoc.content).split(/(?<=[.!?])\s+/).filter(Boolean);
        // Join the first 2-3 sentences without adding ellipses or markdown
        let summary = sents.slice(0, 3).join(' ');
        summary = stripMarkdown(summary);
        // If very long, reduce to first 2 sentences to stay concise
        if (summary.length > 600) {
          summary = stripMarkdown(sents.slice(0, 2).join(' '));
        }
        const trimmed = ensureSentenceEnds(summary);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed })
        };
      }
      // If no doc found, fall through to RAG/LLM with generic path
    }
    
    // Special-case: If user asks about AI certifications, respond with ONLY AI-related certifications
    const wantsAICerts = /\b(ai|artificial intelligence)\b/i.test(userMessage) && /\b(cert|certif|certificate|certification)s?\b/i.test(userMessage);
    if (wantsAICerts) {
      const aiCerts = [];
      for (const d of configOnlyDocs) {
        const title = String(d.title || '');
        const content = String(d.content || '');
        const isCertDoc = /^\s*certification\s*:/i.test(title);
        const hasAI = /(\bAI\b|artificial intelligence|machine learning|generative AI)/i.test(title + ' ' + content);
        if (isCertDoc && hasAI) {
          const m = title.match(/^[Cc]ertification\s*:\s*(.+)$/);
          const name = (m && m[1]) ? m[1].trim() : title.replace(/^\s*certification\s*:\s*/i, '').trim();
          if (name && !aiCerts.includes(name)) aiCerts.push(name);
        }
      }
      if (aiCerts.length) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
          body: JSON.stringify({
            message: aiCerts.map(c => `- ${c}`).join('\n')
          })
        };
      }
      // If asked specifically about AI certifications but none detected, fall through to RAG/LLM
    }

    // Special-case: If user asks about certifications, answer directly as a clean list without URLs
    const wantsCerts = /\bcertification(s)?\b/i.test(userMessage);
    if (wantsCerts) {
      const certs = [];
      for (const d of configOnlyDocs) {
        if (!d || !d.title) continue;
        if (typeof d.title === 'string' && d.title.toLowerCase().startsWith('certification')) {
          const name = d.title.replace(/^Certification:\s*/i, '').trim();
          if (name) certs.push(name);
        }
      }
      const uniqueCerts = [...new Set(certs)];
      if (uniqueCerts.length) {
        const list = uniqueCerts.map(c => `- ${c}`).join('\n');
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: list
          })
        };
      }
    }

    // Special-case: Contact / Pricing / Availability (Uses LLM's prompt for this for consistency)
    const wantsContact = /(\bcontact\b|reach\s+(?:him|out)|get\s+in\s+touch|email|hire|pricing|rate|availability|collaborat(?:e|ion)|book|schedule)/i.test(userMessage)
      || /(contacter|prix|tarif|tarifs|disponibilit\w+|collaborer|embaucher)/i.test(userMessage);
    if (wantsContact) {
      const msg = 'For pricing, availability, collaboration or direct contact please use the website contact page: https://ousseinioumarou.com/#contact';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      };
    }

    

    // Special-case: Teaching/mentoring/training experience
    const teachingRe = /(teach|instruct|train|mentor|lecture|workshop|course|class|university|academy)/i;
    const wantsTeaching = teachingRe.test(userMessage);
    if (wantsTeaching) {
      // Prefer docs that explicitly mention teaching-related terms
      const matches = (configOnlyDocs || []).filter(d => teachingRe.test(String(d.title || '')) || teachingRe.test(String(d.content || '')));
      const chosen = matches.sort((a, b) => (String(b.content||'').length||0) - (String(a.content||'').length||0))[0];
      if (chosen && chosen.content) {
        const sents = String(chosen.content).split(/(?<=[.!?])\s+/).filter(Boolean);
        let summary = sents.filter(s => teachingRe.test(s)).slice(0, 3).join(' ');
        if (!summary) summary = sents.slice(0, 3).join(' ');
        summary = stripMarkdown(summary);
        if (summary.length > 600) summary = stripMarkdown(sents.slice(0, 2).join(' '));
        const msg = ensureSentenceEnds(summary);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        };
      }
      // fall through if nothing matched; let RAG/LLM try
    }

    // Special-case: Skills listing
    const wantsSkills = /(\bskills?\b|\bskillset\b|\bstack\b|technolog(?:y|ies)|tooling|\btech\s*stack\b|compétence|competence|compétences|competences)/i.test(userMessage);
    if (wantsSkills) {
      // Collect skills from config-only docs
      const skillDocs = (configOnlyDocs || []).filter(d => /^skills$/i.test(String(d.title || '')) || /\bskills?\b/i.test(String(d.title || '')));
      const items = new Set();
      for (const d of skillDocs) {
        const text = String(d.content || '').trim();
        if (!text) continue;
        if (text.includes('|')) {
          // Category lines separated by |
          const parts = text.split('|').map(s => s.trim()).filter(Boolean);
          for (const p of parts) {
            // Extract names after "Category:" if present
            const m = p.split(':');
            const names = (m.length > 1 ? m.slice(1).join(':') : p).split(',').map(s => s.trim()).filter(Boolean);
            names.forEach(n => items.add(n));
          }
        } else {
          text.split(',').map(s => s.trim()).filter(Boolean).forEach(n => items.add(n));
        }
      }
      const list = Array.from(items).slice(0, 50).map(s => `- ${s}`).join('\n');
      const message = list || (isFrench ? "Aucune compétence trouvée dans la configuration." : "No skills found in configuration.");
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      };
    }

    // Special-case: If user asks about AI projects, return only AI-related projects as a bullet list
    const wantsAIProjects = /(\bai\b|artificial intelligence)/i.test(userMessage) && /(project|work|built|done|experience)/i.test(userMessage);
    if (wantsAIProjects) {
      // RAG for AI Projects - Use RAG to get the most relevant context, then format as STAR
  const useRag = shouldUseRag(userMessage, settings);
  const docsForAIProjects = useRag ? portfolioDocs : configOnlyDocs;
  const { context: projectContext } = getRelevantContext(userMessage, docsForAIProjects);
      
      if (!projectContext || !projectContext.trim()) {
        const message = isFrench
          ? ("Je n'ai pas d'information spécifique sur les projets d'IA" + (userName ? `, ${userName}` : '') + ". Comment puis-je vous aider autrement ?")
          : ("I don't have specific AI project information" + (userName ? `, ${userName}` : '') + ". How can I help further?");
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        };
      }

      const prompt = STAR_PROMPT_PROJECTS(projectContext, isFrench);
      // Fall through to LLM call with the STAR prompt
      // We set a flag to skip the main RAG prompt generation later
      
      const bedrockParams = {
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          prompt,
          max_gen_len: parseInt(process.env.MAX_TOKENS) || 500,
          temperature: parseFloat(process.env.TEMPERATURE) || 8
        })
      };
      const bedrockRes = await bedrock.send(new InvokeModelCommand(bedrockParams));
      const bedrockBody = JSON.parse(await streamToString(bedrockRes.body));
      let botMessage =
        (Array.isArray(bedrockBody.results) && bedrockBody.results[0]?.generated_text) ||
        bedrockBody.generation ||
        bedrockBody.outputText ||
        bedrockBody.completion ||
        (isFrench ? 'Désolé, je n\'ai pas pu générer de réponse.' : 'Sorry, I could not generate a response.');

      // Simple clean up for STAR output (keep newlines for formatting)
      const cleanStarOutput = (text) => {
        let t = String(text || '').replace(/```[\s\S]*?```/g, ''); // Remove code blocks
        t = t.replace(/^\s*Response:\s*/i, '').trim(); // Remove prompt tag
        t = t.replace(/\s+/g, ' ').trim(); // Normalize spaces (not newlines)
        return t;
      };
      botMessage = cleanStarOutput(botMessage);
      
      // Return STAR response
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: botMessage })
      };
    }

    

    // RAG: Find relevant context for all other questions
  const useRagGeneral = shouldUseRag(userMessage, settings);
  const docsForGeneral = useRagGeneral ? portfolioDocs : configOnlyDocs;
  const { context } = getRelevantContext(userMessage, docsForGeneral);

    // If nothing relevant found, short-circuit with safe fallback without calling LLM
    if (!context || !context.trim()) {
      const message = isFrench
        ? ("Je n'ai pas cette information précise" + (userName ? `, ${userName}` : '') + ". Comment puis-je vous aider autrement ?")
        : ("I don't have that specific information" + (userName ? `, ${userName}` : '') + ". How can I help further?");
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      };
    }

    // Build prompt for Llama 3 (for non-project questions)
  // Force English prompt regardless of detected language (French handling disabled beyond greeting)
  let prompt = MAIN_RESPONSE_PROMPT(context, userMessage, userName, false);

    // Call Bedrock (Llama 3)
    const bedrockParams = {
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt,
        max_gen_len: parseInt(process.env.MAX_TOKENS) || 500,
        temperature: parseFloat(process.env.TEMPERATURE) || 8
      })
    };
    const bedrockRes = await bedrock.send(new InvokeModelCommand(bedrockParams));
    const bedrockBody = JSON.parse(await streamToString(bedrockRes.body));
    // Handle multiple possible schemas across providers/models
    let botMessage =
      (Array.isArray(bedrockBody.results) && bedrockBody.results[0]?.generated_text) ||
      bedrockBody.generation ||
      bedrockBody.outputText ||
      bedrockBody.completion ||
      'Sorry, I could not generate a response.';

    // Sanitize output to avoid leaked code blocks, markdown, or truncated phrases
    const cleanOutput = (text) => {
      let t = String(text || '');
      // Drop entire fenced code blocks
      t = t.replace(/```[\s\S]*?```/g, '');
      // Strip markdown markers comprehensively
      t = stripMarkdown(t);
      // Keep only first 1-2 sentences
      const sentences = t
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);
      let result = sentences.slice(0, 2).join(' ');
      // Ensure it ends with punctuation and no dangling markers
      result = result.replace(/["'`]+$/, '').trim();
      result = ensureSentenceEnds(result);
      return result;
    };
    botMessage = cleanOutput(botMessage);

    // Remove undesired meta phrases like "according to the context" or lines starting with "Note:"
    const sanitizeMeta = (text) => {
      if (!text) return text;
      let t = String(text);
      t = t.replace(/\baccording to the context\b/gi, '');
      t = t.replace(/\baccording to (the )?provided context\b/gi, '');
      t = t.replace(/^\s*note\s*[:\-—].*$/gim, '');
      t = t.replace(/\(\s*no source url is provided\s*\)/gi, '');
      // Remove trailing self-assessment / guideline meta questions
      t = t.replace(/(?:Is this response|Est-ce que cette réponse)[^.?!]*[?]/gi, '');
      t = t.replace(/Does it follow the guidelines[?]/gi, '');
      t = t.replace(/Respecte(?:[- ]|)t-il les consignes[?]/gi, '');
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    };
    botMessage = sanitizeMeta(botMessage);
    // Prevent echoing the user's question in the answer
    (function stripEcho() {
      try {
        const q = String(userMessage || '').trim();
        if (!q || q.length < 4) return;
        const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Remove exact question at start if present
        botMessage = botMessage.replace(new RegExp('^\n?\s*' + esc + '\\s*[-:–—]*\n?\s*', 'i'), '').trim();
        // Remove generic echo phrases
        botMessage = botMessage.replace(/^(you\s+asked|vous\s+avez\s+demandé|vous\s+avez\s+demande)[:,\-–—]?\s*/i, '').trim();
        botMessage = botMessage.replace(/^question\s*[:,\-–—]?\s*/i, '').trim();
        // Remove leading quotes around restated question
        botMessage = botMessage.replace(/^"[^"]+"\s*/i, '').trim();
      } catch (_) {}
    })();
    // If the model expressed uncertainty, ensure we ask how to help further
    const unknownRe = /(i\s+don't\s+(have|know)|not\s+mentioned|no\s+information|no\s+data|not\s+sure|je\s+ne\s+sais\s+pas|pas\s+d['’]information)/i;
    if (unknownRe.test(botMessage)) {
      const enTail = ' How can I help further' + (userName ? `, ${userName}` : '') + '?';
      const frTail = ' Comment puis-je vous aider autrement' + (userName ? `, ${userName}` : '') + ' ?';
      if (!/how can i help further\?/i.test(botMessage) && !/comment puis-je vous aider/i.test(botMessage)) {
        botMessage = ensureSentenceEnds(botMessage.replace(/[\.!?]*$/, '')) + (isFrench ? frTail : enTail);
      }
    }
    // Remove any URLs from final message
    botMessage = botMessage.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  // Final safeguard: ensure it ends with punctuation
  botMessage = ensureSentenceEnds(botMessage);

    // Return response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: botMessage })
    };
  } catch (err) {
    console.error('Lambda error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: err.message })
    };
  }
};