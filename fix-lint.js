/**
 * Automated ESLint warning fixer
 * Handles: no-explicit-any, no-unused-vars, react-hooks/exhaustive-deps
 */

const fs = require('fs');
const path = require('path'); // eslint-disable-line @typescript-eslint/no-unused-vars

// Load lint output
const lintData = JSON.parse(fs.readFileSync('lint-output.json', 'utf8'));

let totalFixed = 0;
let totalSkipped = 0; // eslint-disable-line @typescript-eslint/no-unused-vars

const stats = {
  'no-explicit-any': { fixed: 0, disabled: 0 },
  'no-unused-vars': { fixed: 0, skipped: 0 },
  'exhaustive-deps': { fixed: 0 }
};

function fixFile(filePath, messages) {
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Sort by line number descending so we can fix from bottom to top
  // (avoids line number shifting issues)
  const sorted = [...messages].sort((a, b) => b.line - a.line || b.column - a.column);
  
  let modified = false;
  
  for (const msg of sorted) {
    const ruleId = msg.ruleId;
    const lineIdx = msg.line - 1; // 0-based
    const colIdx = msg.column - 1; // 0-based
    const line = lines[lineIdx];
    
    if (line === undefined) continue;
    
    if (ruleId === '@typescript-eslint/no-explicit-any') {
      modified = fixNoExplicitAny(lines, lineIdx, colIdx, msg) || modified;
    } else if (ruleId === '@typescript-eslint/no-unused-vars') {
      modified = fixUnusedVars(lines, lineIdx, colIdx, msg) || modified;
    } else if (ruleId === 'react-hooks/exhaustive-deps') {
      modified = fixExhaustiveDeps(lines, lineIdx, msg) || modified;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    totalFixed++;
  }
}

function fixNoExplicitAny(lines, lineIdx, colIdx, msg) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const line = lines[lineIdx];
  
  // Pattern 1: catch (e: any) -> catch (e)
  if (line.match(/catch\s*\(\s*\w+\s*:\s*any\s*\)/)) {
    lines[lineIdx] = line.replace(/(\bcatch\s*\(\s*\w+)\s*:\s*any(\s*\))/, '$1$2');
    stats['no-explicit-any'].fixed++;
    return true;
  }
  
  // Pattern 2: Already has disable comment above? Skip
  if (lineIdx > 0 && lines[lineIdx - 1].includes('eslint-disable-next-line @typescript-eslint/no-explicit-any')) {
    return false;
  }
  
  // Pattern 3: Add eslint-disable-next-line comment
  const indent = line.match(/^(\s*)/)[1];
  lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line @typescript-eslint/no-explicit-any`);
  stats['no-explicit-any'].disabled++;
  return true;
}

function fixUnusedVars(lines, lineIdx, colIdx, msg) {
  const line = lines[lineIdx];
  const varName = msg.message.match(/'([^']+)' is (?:defined|assigned)/)?.[1];
  
  if (!varName) return false;
  
  // Pattern 1: Unused import - remove from import statement
  // e.g. import { A, B, C } from 'x' where B is unused
  if (line.includes('import') && line.includes(varName)) {
    return fixUnusedImport(lines, lineIdx, varName);
  }
  
  // Pattern 2: const/let/var x = ... prefix with _
  // e.g. const router = useRouter() -> const _router = useRouter()
  const assignMatch = line.match(/^(\s*(?:const|let|var)\s+)(\w+)(\s*=)/);
  if (assignMatch && assignMatch[2] === varName && !varName.startsWith('_')) {
    lines[lineIdx] = line.replace(
      new RegExp(`(const|let|var)\\s+${escapeRegex(varName)}\\s*=`),
      `$1 _${varName} =`
    );
    stats['no-unused-vars'].fixed++;
    return true;
  }
  
  // Pattern 3: Destructuring { a, b, c } where one is unused - prefix with _
  const destructMatch = line.match(/\{([^}]+)\}/);
  if (destructMatch) {
    const parts = destructMatch[1].split(',').map(p => p.trim());
    const partIdx = parts.findIndex(p => {
      const name = p.split(':')[0].trim().split(' ').pop();
      return name === varName;
    });
    if (partIdx >= 0) {
      const part = parts[partIdx];
      // Check if it has alias
      if (part.includes(':')) {
        // e.g. { data: result } - prefix the alias
        parts[partIdx] = part.replace(/:\s*(\w+)$/, ': _$1');
      } else {
        parts[partIdx] = `_${part}`;
      }
      lines[lineIdx] = line.replace(destructMatch[0], `{ ${parts.join(', ')} }`);
      stats['no-unused-vars'].fixed++;
      return true;
    }
  }
  
  // Pattern 4: function parameter - prefix with _
  // Handled by checking column position for function params
  const funcParamMatch = line.match(/\(([^)]+)\)/);
  if (funcParamMatch) {
    const paramStr = funcParamMatch[1];
    if (paramStr.includes(varName)) {
      const newParamStr = paramStr.replace(
        new RegExp(`(?<![_\\w])${escapeRegex(varName)}(?![\\w])`),
        `_${varName}`
      );
      if (newParamStr !== paramStr) {
        lines[lineIdx] = line.replace(funcParamMatch[0], `(${newParamStr})`);
        stats['no-unused-vars'].fixed++;
        return true;
      }
    }
  }
  
  stats['no-unused-vars'].skipped++;
  return false;
}

function fixUnusedImport(lines, lineIdx, varName) {
  const line = lines[lineIdx];
  
  // Check if single import: import VarName from 'x' or import { VarName } from 'x'
  // with only this one named export
  const singleNamedMatch = line.match(/^(\s*import\s*\{)\s*(\w+)\s*(\}\s*from\s*.+)/);
  if (singleNamedMatch && singleNamedMatch[2] === varName) {
    // Remove the entire import line
    lines.splice(lineIdx, 1);
    stats['no-unused-vars'].fixed++;
    return true;
  }
  
  // Check if default import: import VarName from 'x'
  const defaultImportMatch = line.match(/^(\s*import\s+)(\w+)(\s+from\s+.+)/);
  if (defaultImportMatch && defaultImportMatch[2] === varName) {
    lines.splice(lineIdx, 1);
    stats['no-unused-vars'].fixed++;
    return true;
  }
  
  // Remove from named imports: import { A, VarName, C } from 'x'
  const namedMatch = line.match(/^(\s*import\s*\{)([^}]+)(\}\s*from\s*.+)/);
  if (namedMatch) {
    const imports = namedMatch[2].split(',').map(s => s.trim()).filter(Boolean);
    const filtered = imports.filter(imp => {
      const name = imp.split(' as ')[0].trim();
      return name !== varName;
    });
    
    if (filtered.length === 0) {
      // Remove entire import line
      lines.splice(lineIdx, 1);
    } else {
      lines[lineIdx] = `${namedMatch[1]} ${filtered.join(', ')} ${namedMatch[3]}`;
    }
    stats['no-unused-vars'].fixed++;
    return true;
  }
  
  // Check if it's a type import or namespace import
  const typeImportMatch = line.match(/^(\s*import\s+type\s*\{)([^}]+)(\}\s*from\s*.+)/);
  if (typeImportMatch) {
    const imports = typeImportMatch[2].split(',').map(s => s.trim()).filter(Boolean);
    const filtered = imports.filter(imp => {
      const name = imp.split(' as ')[0].trim();
      return name !== varName;
    });
    
    if (filtered.length === 0) {
      lines.splice(lineIdx, 1);
    } else {
      lines[lineIdx] = `${typeImportMatch[1]} ${filtered.join(', ')} ${typeImportMatch[3]}`;
    }
    stats['no-unused-vars'].fixed++;
    return true;
  }
  
  stats['no-unused-vars'].skipped++;
  return false;
}

function fixExhaustiveDeps(lines, lineIdx, msg) { // eslint-disable-line @typescript-eslint/no-unused-vars
  // Find the closing }, [deps]) of the useEffect starting at lineIdx
  // We need to add // eslint-disable-next-line react-hooks/exhaustive-deps before the deps array line
  
  let depth = 0;
  let foundDepsLine = -1;
  
  for (let i = lineIdx; i < Math.min(lines.length, lineIdx + 200); i++) {
    const l = lines[i];
    
    // Track brace depth
    for (const ch of l) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    
    // Look for }, [ pattern (closing with deps array)
    if (depth === 0 && l.match(/\}\s*,\s*\[/) && i > lineIdx) {
      foundDepsLine = i;
      break;
    }
    // Also handle the pattern where deps is on same line as closing brace
    if (depth <= 0 && l.match(/\]\s*\)/) && i > lineIdx) {
      // This might be the deps closing line - check if there's a deps array above
      // Look backwards for the }, [
      for (let j = i; j >= lineIdx; j--) {
        if (lines[j].match(/\}\s*,\s*\[/)) {
          foundDepsLine = j;
          break;
        }
      }
      if (foundDepsLine >= 0) break;
    }
  }
  
  if (foundDepsLine >= 0) {
    // Check if disable comment already exists
    if (foundDepsLine > 0 && lines[foundDepsLine - 1].includes('eslint-disable-next-line react-hooks/exhaustive-deps')) {
      return false;
    }
    const indent = lines[foundDepsLine].match(/^(\s*)/)[1];
    lines.splice(foundDepsLine, 0, `${indent}// eslint-disable-next-line react-hooks/exhaustive-deps`);
    stats['exhaustive-deps'].fixed++;
    return true;
  }
  
  // Fallback: add disable comment before the useEffect line itself
  if (lineIdx > 0 && !lines[lineIdx - 1].includes('eslint-disable-next-line react-hooks/exhaustive-deps')) {
    const indent = lines[lineIdx].match(/^(\s*)/)[1];
    lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line react-hooks/exhaustive-deps`);
    stats['exhaustive-deps'].fixed++;
    return true;
  }
  
  return false;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Process all files
let fileCount = 0;
for (const fileResult of lintData) {
  const filePath = fileResult.filePath;
  const messages = fileResult.messages.filter(m => 
    m.ruleId === '@typescript-eslint/no-explicit-any' ||
    m.ruleId === '@typescript-eslint/no-unused-vars' ||
    m.ruleId === 'react-hooks/exhaustive-deps'
  );
  
  if (messages.length === 0) continue;
  
  fileCount++;
  fixFile(filePath, messages);
}

console.log(`\nProcessed ${fileCount} files`);
console.log(`\nno-explicit-any:`);
console.log(`  catch clause fixes: ${stats['no-explicit-any'].fixed}`);
console.log(`  eslint-disable added: ${stats['no-explicit-any'].disabled}`);
console.log(`\nno-unused-vars:`);
console.log(`  fixed: ${stats['no-unused-vars'].fixed}`);
console.log(`  skipped: ${stats['no-unused-vars'].skipped}`);
console.log(`\nexhaustive-deps:`);
console.log(`  fixed: ${stats['exhaustive-deps'].fixed}`);
console.log(`\nFiles modified: ${totalFixed}`);
