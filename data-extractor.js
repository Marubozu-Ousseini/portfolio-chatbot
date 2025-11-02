// data-extractor.js - Extract portfolio content from config.js to rag-data/portfolio-documents.json
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.js');
const outputPath = path.join(__dirname, 'rag-data', 'portfolio-documents.json');

if (!fs.existsSync(configPath)) {
  console.error('config.js not found. Please copy your portfolio config.js here.');
  process.exit(1);
}

let config;
try {
  // Try as Node module first
  // eslint-disable-next-line import/no-dynamic-require, global-require
  config = require(configPath);
} catch (e) {
  // Fallback for browser-style config (e.g., window.siteContent = {...})
  const vm = require('vm');
  const raw = fs.readFileSync(configPath, 'utf-8');
  const context = { window: {} };
  try {
    vm.runInNewContext(raw, context);
    config = context.window.siteContent || context.window.config || {};
  } catch (err) {
    console.error('Failed to evaluate config.js in VM:', err.message);
    config = {};
  }
}


// Example: extract sections, projects, skills, etc. (robust to missing/non-array)
const docs = [];
if (Array.isArray(config.sections)) {
  for (const section of config.sections) {
    docs.push({
      title: section && section.title ? section.title : 'Section',
      content: section && section.content ? section.content : '',
      source: 'config.js'
    });
  }
}
if (Array.isArray(config.projects)) {
  for (const project of config.projects) {
    const title = (project && (project.title || project.name || project.titleFr)) || 'Project';
    const desc = (project && (project.description || project.descriptionFr)) || '';
    docs.push({ title, content: desc, source: 'config.js' });
  }
}
// Skills from multiple shapes
const skillArrays = [];
if (Array.isArray(config.skills)) skillArrays.push(config.skills);
if (config.profile && Array.isArray(config.profile.skills)) skillArrays.push(config.profile.skills);
// Also support object shape: { Category: [{ name: "..."}, ...], ... }
if (config.skills && typeof config.skills === 'object' && !Array.isArray(config.skills)) {
  try {
    const categoryLines = [];
    for (const [category, items] of Object.entries(config.skills)) {
      if (Array.isArray(items)) {
        const names = items.map(it => (it && (it.name || it.nameFr)) || '').filter(Boolean);
        if (names.length) categoryLines.push(`${category}: ${names.join(', ')}`);
      }
    }
    if (categoryLines.length) {
      docs.push({ title: 'Skills', content: categoryLines.join(' | '), source: 'config.js' });
    }
  } catch (e) {
    // ignore
  }
}
if (skillArrays.length) {
  const merged = [...new Set(skillArrays.flat().filter(Boolean))];
  if (merged.length) {
    docs.push({ title: 'Skills', content: merged.join(', '), source: 'config.js' });
  }
}

// Certifications from multiple shapes
const certArrays = [];
if (Array.isArray(config.certifications)) certArrays.push(config.certifications);
if (config.profile && Array.isArray(config.profile.certifications)) certArrays.push(config.profile.certifications);
// Support credly.manualCertifications shape
if (config.credly && Array.isArray(config.credly.manualCertifications)) {
  for (const cert of config.credly.manualCertifications) {
    if (!cert) continue;
    const title = cert.name ? `Certification: ${cert.name}` : 'Certification';
    const bits = [];
    if (cert.description) bits.push(cert.description);
    if (cert.issued_at_date) bits.push(`Issued: ${cert.issued_at_date}`);
    if (cert.public_url) bits.push(`Link: ${cert.public_url}`);
    const content = bits.join(' \n');
    docs.push({ title, content, source: 'config.js' });
  }
}
if (certArrays.length) {
  const merged = [...new Set(certArrays.flat().filter(Boolean))];
  if (merged.length) {
    docs.push({ title: 'Certifications', content: merged.join(', '), source: 'config.js' });
  }
}

// Optional common fields
if (typeof config.about === 'string' && config.about.trim()) {
  docs.push({ title: 'About', content: config.about.trim(), source: 'config.js' });
}
if (typeof config.summary === 'string' && config.summary.trim()) {
  docs.push({ title: 'Summary', content: config.summary.trim(), source: 'config.js' });
}
// Personal info description as About fallback
if (config.personalInfo && typeof config.personalInfo.description === 'string' && config.personalInfo.description.trim()) {
  docs.push({ title: 'About', content: config.personalInfo.description.trim(), source: 'config.js' });
}

// Scrape URLs and include results (Node 18+ global fetch)
// Disabled by default to keep RAG strictly sourced from config.js.
// Enable by setting SCRAPE_URLS to a comma-separated list, or to the literal value "default"
// to use the pre-defined URLs.
let SCRAPE_URLS = [];
if (typeof process.env.SCRAPE_URLS === 'string') {
  const v = process.env.SCRAPE_URLS.trim();
  if (v.toLowerCase() === 'default') {
    SCRAPE_URLS = [
      'https://www.linkedin.com/in/marubozu/',
      'https://www.ousseinioumarou.com/'
    ];
  } else if (v.length) {
    SCRAPE_URLS = v.split(',').map(s => s.trim()).filter(Boolean);
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrapeAll() {
  const results = [];
  for (const url of SCRAPE_URLS) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (chatbot-extractor)' } });
      const html = await res.text();
      const text = stripHtml(html);
      if (text) results.push({ title: url, content: text, source: url });
    } catch (e) {
      console.error('Scrape failed for', url, e.message);
    }
  }
  return results;
}

(async () => {
  const scraped = await scrapeAll();
  for (const doc of scraped) docs.push(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(docs, null, 2));
  console.log('Extracted portfolio data to', outputPath, `(+${scraped.length} scraped URLs)`);
})();
