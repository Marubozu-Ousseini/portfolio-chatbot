#!/bin/bash
# deploy.sh - Build, package, and deploy portfolio-chatbot backend
set -e
cd "$(dirname "$0")"

# 1. Extract portfolio data (if data-extractor.js exists)
if [ -f data-extractor.js ]; then
  # Load env (for SCRAPE_URLS, etc.) if available
  if [ -f ./load-env.sh ]; then
    source ./load-env.sh
  fi
  echo "Extracting portfolio data..."
  node data-extractor.js
fi

# 2. Build Lambda package
cd lambda
zip -r function.zip index.js package.json node_modules > /dev/null
cd ..

# 3. Deploy infrastructure with Terraform
cd infrastructure
terraform init
terraform apply -auto-approve
cd ..

# 4. Upload portfolio data to S3
if [ -f rag-data/portfolio-documents.json ]; then
  aws s3 cp rag-data/portfolio-documents.json s3://$(terraform -chdir=infrastructure output -raw aws_s3_bucket_portfolio_data_id)/
fi

echo "Deployment complete."
