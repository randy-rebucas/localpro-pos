// Lists t('key', ...) calls missing from the public dictionaries.
// Usage, from the repo root: node .claude/skills/1pos-public-design/scripts/check-copy.mjs [sourceDir] [dictionarySection]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [sourceDir = 'components/marketing', section = 'home'] = process.argv.slice(2);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const source = sourceFiles(sourceDir).map((file) => readFileSync(file, 'utf8')).join('\n');
const keys = new Set([...source.matchAll(/\bt\(\s*'(\w+)'/g)].map((match) => match[1]));

let missing = 0;
for (const lang of ['en', 'es']) {
  const dictionary = JSON.parse(readFileSync(`app/[lang]/dictionaries/${lang}.json`, 'utf8'))[section] ?? {};
  const absent = [...keys].filter((key) => !(key in dictionary));
  const unused = Object.keys(dictionary).filter((key) => !keys.has(key));
  missing += absent.length;
  console.log(`${lang}: ${keys.size - absent.length}/${keys.size} keys present`);
  if (absent.length) console.log(`  missing: ${absent.join(', ')}`);
  if (unused.length) console.log(`  unused: ${unused.join(', ')}`);
}

process.exit(missing ? 1 : 0);
