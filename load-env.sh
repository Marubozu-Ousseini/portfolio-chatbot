#!/bin/bash
# load-env.sh - Load environment variables from .env
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
  echo "Loaded environment variables from .env"
else
  echo ".env file not found, continuing with environment defaults."
fi
