import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = resolve(repoRoot, 'src/client');
const visiblePropNames = new Set(['label', 'hint', 'placeholder', 'title', 'aria-label']);
const excludedDirectories = new Set(['styles', 'test-harness']);
const excludedFiles = new Set(['mount-registry.ts', 'remote-namespace.ts']);

export const FORBIDDEN_AUTHOR_PATTERNS = Object.freeze([
  { label: 'internal-term', pattern: /\b(?:holder|revealPlan|status|Gate|ConfirmationGate|supersede|seq|diff|Stage)\b/giu },
  { label: 'iteration-id', pattern: /\bI\d+\b/gu },
  { label: 'policy-id', pattern: /\bN-\d+\b/gu },
  { label: 'raw-enum', pattern: /\b(?:protagonist|antagonist|supporting|extra|geography|history|faction|culture|race|concept|artifact|friendship|rivalry|romantic|enmity|allegiance|mentor|subordinate|planned|writing|done|rewritten|partially-revealed|candidate-ready|rewrite-requested|third-limited|third-omniscient)\b/giu },
]);

function stripAllowlistedText(value) {
  return value
    .replace(/\b(?:DOCX|TXT|Markdown)\b/giu, '')
    .replace(/https?:\/\/\S+/giu, '')
    .replace(/\b(?:gpt|o\d|deepseek|claude)-[a-z0-9._-]+\b/giu, '');
}

/** Scan one author-owned text value. Author prose and folded diagnostics are explicit exclusions. */
export function scanAuthorText(value, context = {}) {
  if (context.authorContent === true || context.advancedDetails === true || typeof value !== 'string') return [];
  const scanned = stripAllowlistedText(value);
  return FORBIDDEN_AUTHOR_PATTERNS.flatMap(({ label, pattern }) => {
    pattern.lastIndex = 0;
    return [...scanned.matchAll(pattern)].map((match) => ({ label, term: match[0], text: value }));
  });
}

function isNode(value) {
  return value !== null && typeof value === 'object' && typeof value.tag === 'string' && Array.isArray(value.children);
}

/** Walk the renderer-neutral El tree used by Client tests; data/class/value props are contracts, not copy. */
export function scanRenderedTree(root) {
  const violations = [];
  const visit = (value, context = {}) => {
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, context)); return; }
    if (!isNode(value)) {
      if (typeof value === 'string' || typeof value === 'number') violations.push(...scanAuthorText(String(value), context));
      return;
    }
    const advancedDetails = context.advancedDetails === true || (value.tag === 'details' && value.props?.['data-novel-advanced-view'] !== undefined);
    const authorContent = context.authorContent === true || ((value.tag === 'textarea' || value.tag === 'input') && value.props?.value !== undefined);
    for (const name of ['placeholder', 'title', 'aria-label']) {
      violations.push(...scanAuthorText(value.props?.[name], { advancedDetails, authorContent: false }));
    }
    value.children.forEach((child) => visit(child, { advancedDetails, authorContent }));
  };
  visit(root);
  return violations;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : sourceFiles(path);
    if (!entry.isFile() || !path.endsWith('.ts') || path.endsWith('.test.ts') || excludedFiles.has(entry.name)) return [];
    return [path];
  });
}

function literalText(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('');
  return undefined;
}

function collectVisibleLiterals(sourceFile) {
  const values = [];
  const collect = (node) => {
    const text = literalText(node);
    if (text !== undefined) values.push({ text, line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    else if (ts.isConditionalExpression(node)) { collect(node.whenTrue); collect(node.whenFalse); }
    else if (ts.isBinaryExpression(node)) { collect(node.left); collect(node.right); }
    else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(collect);
    else if (ts.isParenthesizedExpression(node)) collect(node.expression);
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'h') {
      const props = node.arguments[1];
      if (props !== undefined && ts.isObjectLiteralExpression(props)) {
        for (const property of props.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = property.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
          if (visiblePropNames.has(name)) collect(property.initializer);
        }
      }
      node.arguments.slice(2).forEach(collect);
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
      if (name === 'label' || name === 'hint') collect(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

/** TypeScript-AST scan of literals that flow to rendered children or author-facing props. */
export function scanAuthorPresentationSources() {
  const violations = [];
  let literalCount = 0;
  for (const path of sourceFiles(clientRoot)) {
    const source = readFileSync(path, 'utf8');
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const item of collectVisibleLiterals(sourceFile)) {
      literalCount += 1;
      for (const violation of scanAuthorText(item.text)) violations.push({ file: relative(repoRoot, path), line: item.line, ...violation });
    }
  }
  return { literalCount, violations };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = scanAuthorPresentationSources();
  if (result.violations.length > 0) {
    result.violations.forEach((item) => console.error(`${item.file}:${item.line}: ${item.term}: ${item.text}`));
    process.exitCode = 1;
  } else {
    console.log(`I161 author presentation: ${result.literalCount} AST-visible literals, zero forbidden terms`);
  }
}
