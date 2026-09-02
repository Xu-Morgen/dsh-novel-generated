import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorEnumLabel } from './client/presentation.js';
import { structuredEditor } from './client/structured-editor.js';
import type { El } from './client/shared.js';
import { collect, type FakeNode } from './client/test-harness.js';
// @ts-expect-error The executable scanner intentionally lives outside the TypeScript build graph.
import { scanAuthorPresentationSources, scanAuthorText, scanRenderedTree } from '../scripts/scan-author-presentation.mjs';

const h: El = (tag, props, ...children) => ({ tag, props: props ?? null, children });

describe('I161 中文作者术语与结构化表单（R30-3）', () => {
  it('结构化编辑器不暴露 JSON，中文选项仍提交 canonical 值', () => {
    const candidate = { id: 'rule-tide', scope: 'global', kind: 'magic', statement: '潮汐钟每日只能倒转一次。', active: true };
    let changed: unknown;
    const tree = structuredEditor(h, candidate, (value) => { changed = value; }, 'rule-style-rules') as FakeNode;
    expect(collect(tree, 'textarea')).toHaveLength(0);
    expect(collect(tree, 'input').some((node) => node.props?.value === 'rule-tide')).toBe(false);
    const kind = collect(tree, 'select').find((node) => node.props?.value === 'magic');
    expect(kind).toBeDefined();
    expect(collect(kind as FakeNode, 'option').map((option) => option.children[0])).toContain('魔法规则');
    (kind?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'technology' } });
    expect(changed).toEqual({ ...candidate, kind: 'technology' });
  });

  it('未知枚举 fail closed 为中文，不回显原始值', () => {
    expect(authorEnumLabel('future-wire-value', '状态')).toBe('无法识别的状态');
    expect(authorEnumLabel('future-wire-value', '状态')).not.toContain('future-wire-value');
  });

  it('动态 DOM 扫描覆盖正文、placeholder 和 ARIA，但跳过作者内容与折叠技术详情', () => {
    const tree = h('section', null,
      h('p', null, '原始状态 planned'),
      h('input', { placeholder: 'Gate 状态', value: '作者写了 holder 作为台词' }),
      h('button', { 'aria-label': 'Stage 9' }, '按钮'),
      h('details', { 'data-novel-advanced-view': '' }, h('pre', null, 'ConfirmationGate diff')),
    );
    const violations = scanRenderedTree(tree);
    expect(violations.map((item: { term: string }) => item.term)).toEqual(expect.arrayContaining(['planned', 'Gate', 'Stage']));
    expect(violations.some((item: { term: string }) => item.term === 'holder' || item.term === 'ConfirmationGate' || item.term === 'diff')).toBe(false);
  });

  it('窄 allowlist 允许文件格式、模型、地址和作者内容', () => {
    expect(scanAuthorText('DOCX / TXT / Markdown · gpt-4o · https://example.test/v1')).toEqual([]);
    expect(scanAuthorText('作者正文中的 holder 和 Stage 9', { authorContent: true })).toEqual([]);
    expect(scanAuthorText('变更 holder 需经 Gate')).toHaveLength(2);
  });

  it('静态 TypeScript AST 扫描仅看作者文案，data 锚点与注释不误报', () => {
    expect(scanAuthorPresentationSources().violations).toEqual([]);
  });

  it('旧六层与规则/文风原始 JSON 编辑控件已退役', () => {
    const source = ['src/client/onboarding-panels.ts', 'src/client/import-interpretation-review.ts']
      .map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(source).not.toContain('data-novel-onboarding-edit-text');
    expect(source).not.toMatch(/h\(['"]textarea['"][^\n]*(?:rule-style-import-rules|rule-style-import-style)/u);
    expect(source).toContain('structuredEditor');
  });
});
