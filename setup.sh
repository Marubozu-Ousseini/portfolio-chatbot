#!/bin/bash
# setup.sh - Initial setup for portfolio-chatbot
set -e
cd "$(dirname "$0")"

if [ -d lambda ]; then
  cd lambda
  echo "Installing Lambda dependencies..."
  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi
  cd ..
fi

echo "Setup complete."
