#!/usr/bin/env bash
# scripts/fetch-words.sh
# Fetches Wordle words for the last N days from NYTimes and writes words.json
#
# Usage:
#   ./scripts/fetch-words.sh          # last 30 days (default)
#   ./scripts/fetch-words.sh 60       # last 60 days
#
# Output: scripts/words.json

set -euo pipefail

DAYS=${1:-30}
NYTIMES_BASE="https://www.nytimes.com/svc/wordle/v2"
OUTPUT="$(dirname "$0")/words.json"

echo "Fetching Wordle words for the last $DAYS days..."
echo "{" > "$OUTPUT"

fetched=0
failed=0
first=true

for i in $(seq "$DAYS" -1 0); do
  # Compute date: today - i days (works on macOS and Linux)
  if date -v -"${i}"d '+%Y-%m-%d' &>/dev/null 2>&1; then
    DATE=$(date -v -"${i}"d '+%Y-%m-%d')   # macOS
  else
    DATE=$(date -d "-${i} days" '+%Y-%m-%d') # Linux
  fi

  RESPONSE=$(curl -sf --max-time 5 "${NYTIMES_BASE}/${DATE}.json" 2>/dev/null || true)

  if [ -z "$RESPONSE" ]; then
    echo "  ⚠  $DATE — skipped (no response)"
    ((failed++)) || true
    continue
  fi

  WORD=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['solution'].upper())" 2>/dev/null || true)
  PUZZLE_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('days_since_launch') or d.get('id') or 0)" 2>/dev/null || true)

  if [ -z "$WORD" ]; then
    echo "  ⚠  $DATE — skipped (parse error)"
    ((failed++)) || true
    continue
  fi

  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> "$OUTPUT"
  fi

  printf '  "%s": { "word": "%s", "puzzleId": %s }' "$DATE" "$WORD" "$PUZZLE_ID" >> "$OUTPUT"
  echo "  ✓  $DATE → $WORD (#$PUZZLE_ID)"
  ((fetched++)) || true
done

echo "" >> "$OUTPUT"
echo "}" >> "$OUTPUT"

echo ""
echo "Done: $fetched fetched, $failed failed."
echo "Output: $OUTPUT"
