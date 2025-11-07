#!/usr/bin/env node

// Local test harness for the Lambda handler
// Usage:
//   node local-test.js "your message here"
// Defaults:
//   AWS_REGION: us-east-1
//   S3_BUCKET_NAME: portfolio-chatbot-data-prod
//   S3_DATA_PREFIX: rag-data/

process.env.AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'portfolio-chatbot-data-prod';
process.env.S3_DATA_PREFIX = process.env.S3_DATA_PREFIX || 'rag-data/';
process.env.MAX_TOKENS = process.env.MAX_TOKENS || '300';
process.env.TEMPERATURE = process.env.TEMPERATURE || '8';

const { handler } = require('./index');

async function main() {
  // Parse args: optional --name "Your Name" followed by the message
  const argv = process.argv.slice(2);
  let name = '';
  let msgParts = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') {
      name = argv[i + 1] || '';
      i += 1;
    } else {
      msgParts.push(argv[i]);
    }
  }
  const msg = msgParts.join(' ') || 'What AI projects have you worked on?';
  const event = {
    version: '2.0',
    routeKey: 'POST /chat',
    rawPath: '/chat',
    requestContext: { http: { method: 'POST', path: '/chat' } },
    headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message: msg, name: name || undefined }),
    isBase64Encoded: false,
  };

  const res = await handler(event);
  try {
    console.log('Status:', res.statusCode);
    const payload = JSON.parse(res.body);
    console.log('Response:', payload);
  } catch (e) {
    console.log('Raw body:', res.body);
  }
}

main().catch((err) => {
  console.error('Local test failed:', err);
  process.exit(1);
});
