import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = resolve(repoRoot, 'src/client');

/**
 * I132 author-language scanner (R18-7). It scans rendered string literals only;
 * operation names, wire keys, DOM anchors, comments, tests, and the dictionary
 * itself are implementation contracts rather than author-visible copy.
 */
const excluded = new Set([
  'presentation.ts',
  'nav.ts',
  'remote-namespace.ts',
  'mount-registry.ts',
  'shared.ts',
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.test.ts')) return [];
    if (excluded.has(entry.name) || path.includes('/test-harness/')) return [];
    return [path];
  });
}

function authorTerms() {
  const dictionary = readFileSync(resolve(clientRoot, 'presentation.ts'), 'utf8');
  const match = dictionary.match(/AUTHOR_VISIBLE_TERM_DENYLIST\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  if (!match) throw new Error('I132 author term dictionary is missing');
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function stringLiterals(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...withoutComments.matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gs)]
    .map((match) => match[0].startsWith('`')
      ? match[0].slice(1, -1).replace(/\$\{[^{}]*\}/g, '')
      : match[0].slice(1, -1));
}

export function scanAuthorLexicon() {
  const terms = authorTerms();
  const violations = [];
  for (const path of sourceFiles(clientRoot)) {
    const relative = path.slice(repoRoot.length + 1);
    for (const literal of stringLiterals(readFileSync(path, 'utf8'))) {
      for (const term of terms) {
        if (literal.includes(term)) violations.push({ file: relative, term, literal });
      }
    }
  }
  return { terms, violations };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = scanAuthorLexicon();
  if (result.violations.length > 0) {
    for (const violation of result.violations) console.error(`${violation.file}: ${violation.term}: ${violation.literal}`);
    process.exitCode = 1;
  } else {
    console.log(`I132 author lexicon: ${result.terms.length} forbidden terms, zero rendered-literal violations`);
  }
}
