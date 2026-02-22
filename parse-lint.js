const fs = require('fs');
const content = fs.readFileSync('lint-output.txt', 'utf8');
const lines = content.split('\n');
let currentFile = null;
const files = {};
const allWarnings = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('C:\\Users\\corew\\localpro-pos\\')) {
    currentFile = trimmed;
  } else if (trimmed.match(/^\d+:\d+\s+warning/) && currentFile) {
    if (!files[currentFile]) files[currentFile] = [];
    files[currentFile].push(trimmed);
    allWarnings.push({file: currentFile, warning: trimmed});
  }
}

const fileList = Object.keys(files).sort();
for (const f of fileList) {
  const rel = f.replace('C:\\Users\\corew\\localpro-pos\\', '');
  console.log(rel + ': ' + files[f].length);
}
console.log('\nTotal files: ' + fileList.length + ', Total warnings: ' + allWarnings.length);

// Count by type
let anyCount = 0, unusedCount = 0, depsCount = 0;
for (const w of allWarnings) {
  if (w.warning.includes('no-explicit-any')) anyCount++;
  else if (w.warning.includes('no-unused-vars')) unusedCount++;
  else if (w.warning.includes('exhaustive-deps')) depsCount++;
}
console.log('no-explicit-any: ' + anyCount);
console.log('no-unused-vars: ' + unusedCount);
console.log('exhaustive-deps: ' + depsCount);

// Save detailed output
const details = {};
for (const f of fileList) {
  details[f] = files[f];
}
fs.writeFileSync('lint-parsed.json', JSON.stringify(details, null, 2));
console.log('\nSaved to lint-parsed.json');
