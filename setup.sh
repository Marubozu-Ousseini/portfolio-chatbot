#!/bin/bash
# setup.sh - Initial setup for portfolio-chatbot
set -e
cd "$(dirname "$0")"

if [ -d lambda ]; then
  cd lambda
  echo "Installing Lambda dependencies..."
  npm install
  cd ..
fi

echo "Setup complete."
