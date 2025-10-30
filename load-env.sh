#!/bin/bash
# load-env.sh - Load environment variables from .env
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Loaded environment variables from .env"
else
  echo ".env file not found!"
  exit 1
fi
