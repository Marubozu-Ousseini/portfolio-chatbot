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

    
    // Special-case: STAR-formatted response for any project-related questions
    const wantsProjectSTAR = /(project|projects|built|developed|implemented|case study|portfolio)/i.test(userMessage);
    if (wantsProjectSTAR) {
      const keywords = [
        'project', 'built', 'developed', 'implemented', 'designed', 'architecture', 'deployment',
        'ai', 'machine learning', 'sagemaker', 'tensorflow', 'pytorch', 'llm', 'agent',
        'migration', 'modernization', 'replatform', 'rehost', 'kubernetes', 'docker', 'serverless'
      ];
      const top = pickTopDocs(portfolioDocs, keywords, 3);
      if (top.length) {
        const selectedInfo = top.map((d, i) => {
          const title = (d.title || `Example ${i + 1}`).trim();
          const content = String(d.content || '').trim();
          const snippet = content.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
          return `Title: ${title}\nDetails: ${snippet}`;
        }).join('\n\n');

        const STAR_PROMPT = `You are a professional portfolio assistant. Using ONLY the information below, prepare 2-3 concise STAR-formatted examples (Situation, Task, Action, Result) about the user's question on projects.\n\nInformation:\n${selectedInfo}\n\nGuidelines:\n- Provide 2-3 examples.\n- Each example must include Situation, Task, Action, Result labels.\n- Keep each example to 2-4 short lines total.\n- No URLs. No meta commentary.\n- Be specific and concrete based on the information.\n\nResponse:`;

        const bedrockParamsSTAR = {
          modelId: MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            prompt: STAR_PROMPT,
            max_gen_len: parseInt(process.env.MAX_TOKENS) || 500,
            temperature: parseFloat(process.env.TEMPERATURE) || 0.7
          })
        };
  const bedrockResSTAR = await bedrock.send(new InvokeModelCommand(bedrockParamsSTAR));
  const bedrockBodySTAR = JSON.parse(await streamToString(bedrockResSTAR.body));
        let starMessage =
          (Array.isArray(bedrockBodySTAR.results) && bedrockBodySTAR.results[0]?.generated_text) ||
          bedrockBodySTAR.generation ||
          bedrockBodySTAR.outputText ||
          bedrockBodySTAR.completion ||
          '';

        // Sanitize but preserve newlines and STAR labels
        if (starMessage) {
          starMessage = starMessage.replace(/```[\s\S]*?```/g, '');
          starMessage = starMessage.replace(/https?:\/\/\S+/gi, '');
          starMessage = starMessage.replace(/\baccording to (the )?context\b/gi, '');
          starMessage = starMessage.replace(/^\s*note\s*[:\-—].*$/gim, '');
          starMessage = starMessage.replace(/\s+\n/g, '\n').trim();
        }

        const starSources = Array.from(new Set(top.map(d => d.source).filter(Boolean)));
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: starMessage, sources: starSources })
        };
      }
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

    // Special-case: STAR-formatted response for migration experience
    const wantsMigrationSTAR = /(migrat|moderniz|replatform|rehost|re-architect|move to (the )?cloud)/i.test(userMessage) || (/(experience|examples)/i.test(userMessage) && /(migrat|move|moderniz|cloud)/i.test(userMessage));
    if (wantsMigrationSTAR) {
      const keywords = [
        'migrat', 'migration', 'moderniz', 'replatform', 'rehost', 're-architect', 'cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes'
      ];
      const top = pickTopDocs(portfolioDocs, keywords, 3);
      if (top.length) {
        const selectedInfo = top.map((d, i) => {
          const title = (d.title || `Example ${i + 1}`).trim();
          const content = String(d.content || '').trim();
          const snippet = content.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
          return `Title: ${title}\nDetails: ${snippet}`;
        }).join('\n\n');

  const STAR_PROMPT = `You are a professional portfolio assistant. Using ONLY the information below, prepare 2-3 concise STAR-formatted examples (Situation, Task, Action, Result) about migration/modernization work.

Information:
${selectedInfo}

Guidelines:
- Provide 2-3 examples.
- Each example must include Situation, Task, Action, Result labels.
- Keep each example to 2-4 short lines total.
- No URLs. No meta commentary.
- Be specific and concrete based on the information.

Response:`;

        const bedrockParamsSTAR = {
          modelId: MODEL_ID,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            prompt: STAR_PROMPT,
            max_gen_len: parseInt(process.env.MAX_TOKENS) || 500,
            temperature: parseFloat(process.env.TEMPERATURE) || 0.7
          })
        };
  const bedrockResSTAR = await bedrock.send(new InvokeModelCommand(bedrockParamsSTAR));
  const bedrockBodySTAR = JSON.parse(await streamToString(bedrockResSTAR.body));
        let starMessage =
          (Array.isArray(bedrockBodySTAR.results) && bedrockBodySTAR.results[0]?.generated_text) ||
          bedrockBodySTAR.generation ||
          bedrockBodySTAR.outputText ||
          bedrockBodySTAR.completion ||
          '';

        // Sanitize but preserve newlines and STAR labels
        if (starMessage) {
          starMessage = starMessage.replace(/```[\s\S]*?```/g, '');
          starMessage = starMessage.replace(/https?:\/\/\S+/gi, '');
          starMessage = starMessage.replace(/\baccording to (the )?context\b/gi, '');
          starMessage = starMessage.replace(/^\s*note\s*[:\-—].*$/gim, '');
          starMessage = starMessage.replace(/\s+\n/g, '\n').trim();
        }

        const starSources = Array.from(new Set(top.map(d => d.source).filter(Boolean)));
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
          body: JSON.stringify({ message: starMessage, sources: starSources })
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
          message: "I don't have that specific information in the portfolio context. Try asking about projects, skills, or certifications.",
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
const QUERY_GENERATION_PROMPT = `You are a helpful assistant for a personal portfolio website. Your role is to answer questions about the portfolio owner's experience, projects, skills, and background based on the provided context.

Given the user's question, extract the most relevant information from the context below and provide a clear, concise answer.

Context:
{context}

User Question: {question}

Instructions:
- Only use information from the provided context
- If the context doesn't contain relevant information, politely say you don't have that information
- Keep responses professional and friendly
- Focus on highlighting skills, projects, and experience
- Be concise but informative

Answer:`;

// Prompt for conversational response formatting
const RESPONSE_FORMATTING_PROMPT = `You are an AI assistant representing a professional portfolio. Based on the retrieved information, provide a natural, engaging response.

Retrieved Information:
{retrieved_info}

User Question: {question}

Guidelines:
- Provide accurate information only from the retrieved context
- Use a friendly, professional tone
- If asked about projects, highlight key technologies and outcomes
- If asked about skills, mention proficiency levels when available
- If asked about experience, focus on relevant roles and achievements
- Keep responses between 2-4 sentences unless more detail is requested
- If information isn't available, suggest alternative questions they might ask

Response:`;
    // Combine prompts
    const prompt = RESPONSE_FORMATTING_PROMPT
      .replace('{retrieved_info}', context)
      .replace('{question}', userMessage);

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

    // Sanitize output to avoid leaked code blocks or test cases
    const cleanOutput = (text) => {
      let t = String(text || '');
      // Drop anything after a code fence or headings that look like examples
      t = t.replace(/```[\s\S]*$/m, '');
      t = t.replace(/(^|\n)### [\s\S]*$/m, '');
      // Remove any pipe-separated extras (keep first segment only)
      if (t.includes('|')) t = t.split('|')[0];
      // Collapse newlines, trim
      t = t.split('\n').map(s => s.trim()).filter(Boolean).join(' ');
      // Keep only first 1-2 sentences
      const sentences = t
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);
      t = sentences.slice(0, 2).join(' ');
      // Limit length
      if (t.length > 400) t = t.slice(0, 400).trim();
      // Strip dangling quotes/backticks
      t = t.replace(/["'`]+$/, '').trim();
      return t;
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
  // Remove any URLs and greeting fluff from final message
  botMessage = botMessage.replace(/https?:\/\/\S+/gi, '').trim();
  botMessage = botMessage.replace(/^(hi|hello|hey|hi there|hello there)[!,.\s-]*/i, '').trim();
      // Remove any URLs from final message
      botMessage = botMessage.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();

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
