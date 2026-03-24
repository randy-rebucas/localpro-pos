#!/usr/bin/env bash
FILE=$(echo "$CLAUDE_TOOL_INPUT" | node -e "
  const d = require('fs').readFileSync('/dev/stdin','utf8');
  const p = JSON.parse(d);
  console.log(p.file_path || p.path || '');
")
if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
  npx eslint --max-warnings=0 "$FILE" 2>&1
fi
