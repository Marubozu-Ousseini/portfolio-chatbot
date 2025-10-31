#!/bin/bash
# deploy.sh - Build, package, and deploy portfolio-chatbot backend
set -e
cd "$(dirname "$0")"

YES=false
if [ "$1" = "--yes" ] || [ "$1" = "-y" ]; then YES=true; fi

# 1. Optional: precompute portfolio data (if data-extractor.js exists)
if [ -f data-extractor.js ]; then
  echo "Preparing portfolio data (precomputed RAG)..."
  node data-extractor.js || echo "data-extractor.js skipped/failed"
fi

# 2. Build Lambda package
cd lambda
echo "Packaging Lambda..."
zip -q -r function.zip index.js simple-rag.js package.json node_modules
cd ..

# 3. Deploy infrastructure with Terraform
cd infrastructure
terraform init
terraform plan -out=tfplan.bin
if [ "$YES" = true ]; then
  terraform apply -auto-approve tfplan.bin
else
  echo "Review the Terraform plan above. Proceed with apply? [y/N]"
  read -r ANSWER
  if [ "$ANSWER" = "y" ] || [ "$ANSWER" = "Y" ]; then
    terraform apply tfplan.bin
  else
    echo "Aborted before apply."
    exit 0
  fi
fi
cd ..

# 4. Upload portfolio data to S3
if [ -f rag-data/portfolio-documents.json ]; then
  aws s3 cp rag-data/portfolio-documents.json s3://$(terraform -chdir=infrastructure output -raw aws_s3_bucket_portfolio_data_id)/
fi

echo "Deployment complete."
