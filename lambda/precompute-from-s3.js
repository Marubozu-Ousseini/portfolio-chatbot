// precompute-from-s3.js
// Aggregate documents from an S3 prefix (rag-data/) into a single portfolio-documents.json
// and upload it to the bucket root for fast loading by the Lambda.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const PREFIX = process.env.S3_DATA_PREFIX || 'rag-data/';
const OUT_FILE = path.join(__dirname, '..', 'rag-data', 'portfolio-documents.json');
const OUT_KEY = 'portfolio-documents.json';

function streamToString(body) {
  return new Promise((resolve, reject) => {
    if (!body) return resolve('');
    if (body instanceof Uint8Array) {
      return resolve(new TextDecoder('utf-8').decode(body));
    }
    if (typeof body.text === 'function') {
      return body.text().then(resolve, reject);
    }
    const chunks = [];
    body.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    body.on('error', reject);
    body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

function resolveBucket() {
  if (process.env.S3_BUCKET_NAME) return process.env.S3_BUCKET_NAME;
  try {
    const out = execSync('terraform -chdir=../infrastructure output -raw aws_s3_bucket_portfolio_data_id', { stdio: ['ignore', 'pipe', 'ignore'] });
    return String(out).trim();
  } catch (e) {
    throw new Error('Unable to resolve S3 bucket name. Set S3_BUCKET_NAME env or run from a repo with Terraform outputs.');
  }
}

async function run() {
  const bucket = resolveBucket();
  const s3 = new S3Client({ region });
  const docs = [];

  console.log(`Listing s3://${bucket}/${PREFIX}`);
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
  const contents = listed.Contents || [];
  for (const obj of contents) {
    const key = obj.Key;
    if (!key || key.endsWith('/')) continue;
    const ext = (key.split('.').pop() || '').toLowerCase();
    try {
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await streamToString(got.Body);
      if (ext === 'json') {
        try {
          const parsed = JSON.parse(body);
          if (Array.isArray(parsed)) docs.push(...parsed);
          else if (parsed && (parsed.title || parsed.content)) docs.push(parsed);
        } catch (e) {
          console.warn('Skip bad JSON:', key, e.message);
        }
      } else if (ext === 'txt' || ext === 'md') {
        docs.push({ title: key.replace(PREFIX, ''), content: body, source: `s3:${key}` });
      }
    } catch (e) {
      console.warn('Read failed:', key, e.message);
    }
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

  // Write locally
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(unique, null, 2));
  console.log(`Wrote ${unique.length} docs to ${OUT_FILE}`);

  // Upload to bucket root
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: OUT_KEY,
    Body: Buffer.from(JSON.stringify(unique, null, 2)),
    ContentType: 'application/json'
  }));
  console.log(`Uploaded aggregated file to s3://${bucket}/${OUT_KEY}`);
}

run().catch(err => {
  console.error('Precompute from S3 failed:', err);
  process.exit(1);
});
