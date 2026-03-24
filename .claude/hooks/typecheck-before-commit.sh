#!/usr/bin/env bash
COMMAND=$(echo "$CLAUDE_TOOL_INPUT" | node -e "
  const d = require('fs').readFileSync('/dev/stdin','utf8');
  console.log(JSON.parse(d).command || '');
")
if echo "$COMMAND" | grep -q "git commit"; then
  echo "Running TypeScript check before commit..."
  npx tsc --noEmit
fi
