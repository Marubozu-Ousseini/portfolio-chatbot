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
    if (!userMessage) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing message' })
      };
    }
    // Load portfolio data from S3 (legacy file + any docs under prefix)
    let portfolioDocs = await loadPortfolioDocsFromS3();

    // Scraping disabled; rely solely on S3-provided portfolioDocs
    // Fast-path: simple factoid Q&A should return concise answers without LLM when possible
  const wantsAgentName = /(what\s+is\s+)?(the\s+)?name\s+of\s+(the\s+)?(ai|assistant|chatbot|agent)\b|\b(ai|assistant|chatbot|agent)\b.*\bname\b|\bwhat\s+is\s+your\s+name\b/i.test(userMessage);
    if (wantsAgentName) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Sensei', sources: ['config.js'] })
      };
    }

    // Early concise handler: "about Ousseini" or bio-style queries
    const wantsAbout = /(tell\s+me\s+about\s+(ousseini|you|the\s+(owner|author))|who\s+is\s+(ousseini|the\s+owner|the\s+author)|about\s+(ousseini|you))/i.test(userMessage);
    if (wantsAbout) {
      // Prefer an explicit About/Summary doc
      let aboutDoc = (portfolioDocs || []).find(d => /^about$/i.test(String(d.title || '')) || /^summary$/i.test(String(d.title || '')));
      if (!aboutDoc) {
        // Fallback: pick the richest doc containing first-person bio cues
        const candidates = (portfolioDocs || []).filter(d => /\b(i am|cloud|ai|consultant|experience|skills)\b/i.test(String(d.content || '')));
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
          body: JSON.stringify({ message: trimmed, sources: [aboutDoc.source || aboutDoc.title || 'config.js'] })
        };
      }
      // If no doc found, fall through to RAG/LLM with generic path
    }
    
    

    // Special-case: If user asks about AI certifications, respond with ONLY AI-related certifications
    const wantsAICerts = /\b(ai|artificial intelligence)\b/i.test(userMessage) && /\b(cert|certif|certificate|certification)s?\b/i.test(userMessage);
    if (wantsAICerts) {
      const aiCerts = [];
      for (const d of portfolioDocs) {
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
            message: aiCerts.map(c => `- ${c}`).join('\n'),
            sources: ['config.js']
          })
        };
      }
      // If asked specifically about AI certifications but none detected, say you don't know
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: "I don't know.", sources: [] })
      };
    }

    // Special-case: If user asks about certifications, answer directly as a clean list without URLs
    const wantsCerts = /\bcertification(s)?\b/i.test(userMessage);
    if (wantsCerts) {
      const certs = [];
      for (const d of portfolioDocs) {
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
            message: list,
            sources: ['config.js']
          })
        };
      }
    }

    // Special-case: Contact / Pricing / Availability
    // Follow the instruction from the prompt exactly and DO NOT strip the URL.
    const wantsContact = /(\bcontact\b|reach\s+(?:him|out)|get\s+in\s+touch|email|hire|pricing|rate|availability|collaborat(?:e|ion)|book|schedule)/i.test(userMessage);
    if (wantsContact) {
      const contactMsg = 'For pricing, availability, or collaboration inquiries, please visit the contact section at https://ousseinioumarou.com/#contact to reach out directly.';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: contactMsg, sources: [] })
      };
    }

    

    // Special-case: Teaching/mentoring/training experience
    const teachingRe = /(teach|instruct|train|mentor|lecture|workshop|course|class|university|academy)/i;
    const wantsTeaching = teachingRe.test(userMessage);
    if (wantsTeaching) {
      // Prefer docs that explicitly mention teaching-related terms
      const matches = (portfolioDocs || []).filter(d => teachingRe.test(String(d.title || '')) || teachingRe.test(String(d.content || '')));
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
          body: JSON.stringify({ message: msg, sources: [chosen.source || chosen.title || 'config.js'] })
        };
      }
      // fall through if nothing matched; let RAG/LLM try
    }

    // Special-case: If user asks about AI projects, return only AI-related projects as a bullet list
    const wantsAIProjects = /(\bai\b|artificial intelligence)/i.test(userMessage) && /(project|work|built|done|experience)/i.test(userMessage);
    if (wantsAIProjects) {
      const aiProjects = [];
      for (const d of portfolioDocs) {
        const title = String(d.title || '');
        const content = String(d.content || '');
        const isProjectDoc = d.source === 'config.js' && title && !/^\s*certification\s*:/i.test(title) && !/^skills$/i.test(title) && !/^about$/i.test(title) && !/^summary$/i.test(title);
        const hasAI = /(\bAI\b|artificial intelligence|machine learning|SageMaker|TensorFlow|PyTorch|LLM|agent)/i.test(title + ' ' + content);
        if (isProjectDoc && hasAI) {
          // Short summary: first sentence up to 140 chars
          const firstSentence = content.split(/(?<=[.!?])\s+/)[0] || '';
          const summary = firstSentence.length > 140 ? firstSentence.slice(0, 137) + '…' : firstSentence;
          aiProjects.push({ title: title.trim(), summary: summary.trim() });
        }
      }
      if (aiProjects.length) {
        const list = aiProjects.map(p => `- ${p.title}${p.summary ? ` — ${p.summary}` : ''}`).join('\n');
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: list + '\nSee the Projects section for details.',
            sources: ['config.js']
          })
        };
      }
    }

    

    // RAG: Find relevant context
    const { context, sources } = getRelevantContext(userMessage, portfolioDocs);

    // If nothing relevant found, short-circuit with safe fallback without calling LLM
    if (!context || !context.trim()) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: "I don't have that specific information. How can I help further?",
          sources: []
        })
      };
    }

    // If context is a greeting, return a hardcoded friendly message
    if (context && context.startsWith('This is a greeting.')) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: "👋 Hi! How can I assist you today?",
          sources: []
        })
      };
    }

  // Build prompt for Llama 3 (concise; avoid meta language or disclaimers)
  // Prompt for RAG-based portfolio chatbot query generation
  // Minimal fix: defer interpolation until usage time to avoid ReferenceError on selectedInfo
  const STAR_PROMPT_PROJECTS = (selectedInfo) => `You are Sensei, a professional smart portfolio assistant representing Ousseini's work. Using ONLY the information below, prepare 2-3 concise STAR-formatted examples about AI/Machine Learning/Cloud projects.

  Information:
  ${selectedInfo}

  Guidelines:
  - Provide 2-3 examples maximum
  - Each example MUST include: Situation, Task, Action, Result (labeled clearly)
  - Keep each example to 3-4 short sentences total
  - Be specific and concrete using ONLY the provided information
  - NO URLs, NO assumptions
  - Focus strictly on AI/ML/Cloud projects
  - Complete all sentences fully - never stop mid-phrase
  - Start each example in new line
  - Avoid redundancy and verbose language

  Response:`;

// Main RAG Response Prompt (Replace RESPONSE_FORMATTING_PROMPT)
// NOTE: This is for NON-PROJECT questions (skills, certifications, general experience)
const MAIN_RESPONSE_PROMPT = `You are Sensei, an AI assistant for Ousseini's professional portfolio website. You help visitors learn about Ousseini's experience, skills, projects, and certifications.

CRITICAL IDENTITY RULES:
- YOU are Sensei (the AI assistant), Ousseini's assistant
- Ousseini is the portfolio owner (he/him/his)
- When asked about "you/your", talk about Sensei (yourself)
- When asked about "he/him/his/Ousseini", talk about Ousseini
- Never confuse the two identities

Retrieved Information:
${context}

User Question: ${userMessage}

Response Guidelines:
- ONLY use information from the retrieved RAG
- If information is missing, say: "I don't have that specific information. How can I help further?"
- Keep responses under 200 words unless more detail is requested
- Use a friendly yet professional tone
- Be concise and avoid redundancy
- Complete all sentences fully - never stop mid-phrase
- Understand the question clearly and stay in context
- DO NOT use STAR format (that's only for project questions)

For Skills/Certifications/Experience (NON-PROJECT):
- List items clearly with bullet points if appropriate
- Be direct and informative
- No need for Situation/Task/Action/Result structure

For Contact/Pricing Questions:
- Redirect to: "For pricing, availability, or collaboration inquiries, please visit the contact section at [https://ousseinioumarou.com/#contact] to reach out directly."

Security Rules:
- NEVER fabricate or assume information not in the context
- NEVER disclose personal details beyond what's provided
- NEVER make commitments on Ousseini's behalf
- NEVER answer questions unrelated to the portfolio

Suggested Questions (if user seems unsure, proposes 2-3 examples):
You can help with questions like:
- What are Ousseini's key experiences?
- What skills does he have?
- What certifications has he earned?
- What projects has he worked on?

Response:`;

// Greeting Handler Prompt (for conversation initiation)
const GREETING_PROMPT = `You are Sensei, Ousseini's portfolio assistant. Respond warmly to this greeting and:
1. Introduce yourself briefly
2. Ask for the user's name

Keep response concise.

User message: ${userMessage}

Response:`;

// Farewell Handler Prompt
const FAREWELL_PROMPT = `You are Sensei. The user is saying goodbye. Respond warmly:
1. Thank them for visiting
2. Use their name if you learned it during the conversation
3. Invite them to return

Keep response under 2 sentences.

User message: ${userMessage}

Response:`;

// Context-Free Fallback Prompt (when RAG returns nothing)
const FALLBACK_PROMPT = `You are Sensei, Ousseini's portfolio assistant. The user asked a question but no relevant information was found in the portfolio context.

User Question: ${userMessage}

Respond politely that you don't have that information, then suggest 2 example questions you CAN help with:
- What are Ousseini's key projects?
- What certifications does he have?
- What skills does he specialize in?

Keep response concise.

Response:`;
    // Combine prompts
    // Minimal fix: use the already-constructed MAIN_RESPONSE_PROMPT
    const prompt = MAIN_RESPONSE_PROMPT;

    // Call Bedrock (Llama 3)
    const bedrockParams = {
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt,
        max_gen_len: parseInt(process.env.MAX_TOKENS) || 500,
        temperature: parseFloat(process.env.TEMPERATURE) || 0.7
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
      t = t.replace(/\s+/g, ' ').trim();
      return t;
    };
    botMessage = sanitizeMeta(botMessage);
    // If the model expressed uncertainty, ensure we ask how to help further
    const unknownRe = /(i\s+don't\s+(have|know)|not\s+mentioned|no\s+information|no\s+data|not\s+sure)/i;
    if (unknownRe.test(botMessage)) {
      if (!/how can i help further\?/i.test(botMessage)) {
        botMessage = ensureSentenceEnds(botMessage.replace(/[\.!?]*$/, '')) + ' How can I help further?';
      }
    }
  // Remove any URLs and greeting fluff from final message
    botMessage = botMessage.replace(/https?:\/\/\S+/gi, '').trim();
    botMessage = botMessage.replace(/^(hi|hello|hey|hi there|hello there)[!,\.\s-]*/i, '').trim();
    // Remove any URLs from final message
    botMessage = botMessage.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  // Final safeguard: ensure it ends with punctuation
  botMessage = ensureSentenceEnds(botMessage);

    // Return response
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: botMessage, sources })
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
