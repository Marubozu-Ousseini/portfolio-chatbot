#!/bin/bash
# verify-setup.sh - Verify all required files for portfolio-chatbot
files=(
  "lambda/index.js"
  "lambda/package.json"
  "simple-rag.js"
  "infrastructure/main.tf"
  "infrastructure/variables.tf"
  "infrastructure/terraform.tfvars.example"
  ".env.example"
  "setup.sh"
  "deploy.sh"
  "load-env.sh"
  "chatbot-widget.js"
  "chatbot-widget.css"
)

all_ok=1
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file - MISSING"
    all_ok=0
  fi
done

if [ $all_ok -eq 1 ]; then
  echo "All required files are present."
else
  echo "Some files are missing. Please check above."
fi
