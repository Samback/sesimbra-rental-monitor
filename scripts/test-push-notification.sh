#!/usr/bin/env bash
set -euo pipefail

# Run after enabling notifications on the device you want to test:
#   bash scripts/test-push-notification.sh
#
# The Worker sends this synthetic test to every device subscribed to the catalog.
# The token is read without echo and is passed to curl through its stdin config.

WORKER_URL="https://sesimbra-rental-push.samback.workers.dev"
CATALOG_URL="https://samback.github.io/sesimbra-rental-monitor/"

if [[ ! -t 0 ]]; then
  printf 'Run this script interactively so the token can be entered privately.\n' >&2
  exit 1
fi

read -r -s -p 'Cloudflare NOTIFY_TOKEN (input hidden): ' NOTIFY_TOKEN
printf '\n'

if [[ -z "$NOTIFY_TOKEN" ]]; then
  printf 'No token entered. Nothing was sent.\n' >&2
  exit 1
fi

trap 'unset NOTIFY_TOKEN EVENT_ID' EXIT
EVENT_ID="push-test-$(date +%s)-$$"

curl --fail-with-body --silent --show-error --config - <<EOF
url = "${WORKER_URL}/notify"
request = "POST"
header = "Authorization: Bearer ${NOTIFY_TOKEN}"
header = "Content-Type: application/json"
data = "{\\"eventId\\":\\"${EVENT_ID}\",\\"listingId\\":\\"${EVENT_ID}\",\\"type\\":\\"new\\",\\"title\\":\\"Sesimbra push test\\",\\"area\\":\\"Manual test\\",\\"price\\":\\"Push test\\",\\"url\\":\\"${CATALOG_URL}\\",\\"verified\\":true,\\"eligible\\":true,\\"longTerm\\":true,\\"filtered\\":false}"
EOF
