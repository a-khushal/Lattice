#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <owner/repo> <webhook-url> [secret]"
  exit 1
fi

REPO_SLUG="$1"
WEBHOOK_URL="$2"
WEBHOOK_SECRET="${3:-${GITHUB_WEBHOOK_SECRET:-}}"

if [[ -z "$WEBHOOK_SECRET" ]]; then
  echo "Missing webhook secret. Pass it as arg #3 or export GITHUB_WEBHOOK_SECRET."
  exit 1
fi

gh auth status >/dev/null

gh api \
  "repos/${REPO_SLUG}/hooks" \
  --method POST \
  -f name="web" \
  -F active=true \
  -f "events[]=push" \
  -f "config[url]=${WEBHOOK_URL}" \
  -f "config[content_type]=json" \
  -f "config[secret]=${WEBHOOK_SECRET}" \
  -f "config[insecure_ssl]=0" >/dev/null

echo "Webhook registered for ${REPO_SLUG} -> ${WEBHOOK_URL}"
