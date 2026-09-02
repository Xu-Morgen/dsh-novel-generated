import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { draftEntityId } from './client/draft-identity.js';
import { entitySelect } from './client/entity-selectors.js';
import type { El } from './client/shared.js';
import { cleanupClientTestEnv, collect, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';

const h: El = (tag, props, ...children) => ({ tag, props: props ?? null, children });

afterEach(cleanupClientTestEnv);

describe('I160 作者表单零手填技术 ID（R30-2）', () => {
  it('隐藏 identity helper 对同一语义稳定，并在 live 冲突时生成合法唯一值', () => {
    const first = draftEntityId('chapter', '1:潮汐来信', []);
    expect(draftEntityId('chapter', '1:潮汐来信', [])).toBe(first);
    expect(first).toMatch(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/);
    expect(draftEntityId('chapter', '1:潮汐来信', [first])).toBe(`${first}-2`);
    expect(draftEntityId('chapter', '1:潮汐来信', [first, `${first}-2`])).toBe(`${first}-3`);
  });

  it('名称选择器区分重名，并保留已删除 canonical 值而不显示原值或开放文本改写', () => {
    const tree = entitySelect(h, '视角角色', 'deleted-character', [
      { id: 'mira-1', label: '米拉' }, { id: 'mira-2', label: '米拉' },
    ], () => undefined, 'fixture') as FakeNode;
    const options = collect(tree, 'option');
    expect(options.map((option) => option.children[0])).toEqual(['请选择', '米拉（同名第 1 项）', '米拉（同名第 2 项）', '引用已缺失（保留原值）']);
    expect(collect(tree, 'select')[0]?.props?.value).toBe('deleted-character');
    expect(options.map((option) => String(option.children[0])).join('')).not.toContain('deleted-character');
    expect(collect(tree, 'input')).toHaveLength(0);
  });

  it('章节创建只提交作者选择对应的 canonical 角色值，章节标识由隐藏 helper 产生', async () => {
    let created: Record<string, unknown> | undefined;
    const app = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      characterList: async () => [{ id: 'mira', name: '米拉', kind: 'protagonist' }],
      chapterList: async () => [],
    }, {
      textMutation: {
        fingerprint: async () => ({ fingerprint: 'a'.repeat(64) }),
        chapterCreate: async (_projectId, input) => { created = input as Record<string, unknown>; return { fingerprint: 'b'.repeat(64) }; },
        chapterUpdate: async () => ({ fingerprint: 'b'.repeat(64) }),
        sceneCreate: async () => ({ fingerprint: 'b'.repeat(64) }),
        sceneUpdate: async () => ({ fingerprint: 'b'.repeat(64) }),
        reorder: async () => ({ fingerprint: 'b'.repeat(64) }),
      },
      sceneOutlineBinding: { read: async () => ({ manual: [], effective: [], fingerprint: 'c'.repeat(64) }) },
    });
    await flush();
    const render = () => app.registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-view'] === 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'materials')?.props?.onClick as () => void)();
    await flush();
    const title = collect(render(), 'input').find((node) => node.props?.['data-novel-management-input'] === 'chapter-title');
    (title?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '潮汐来信' } });
    const pov = collect(render(), 'select').find((node) => node.props?.['data-novel-entity-select'] === 'chapter-pov');
    (pov?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'mira' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-create'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(created).toMatchObject({ title: '潮汐来信', pov: 'mira', id: draftEntityId('chapter', '1:潮汐来信', []) });
    expect(collect(render(), 'input').some((node) => node.props?.['data-novel-management-input'] === 'chapter-id')).toBe(false);
  });

  it('产品源码不再包含旧手填技术标识控件或提示', () => {
    const files = [
      'src/client/layers/chapters.ts', 'src/client/layers/rule-style.ts', 'src/client/layers/search.ts',
      'src/client/layers/worldview.ts', 'src/client/layers/outline.ts',
    ];
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const forbidden of ['章节 ID', '场景 ID', 'POV ID', '细纲目标 ID', '调和计划 ID', '规则 ID', '角色 id', '条目 id', 'data-novel-rule-edit-id']) {
      expect(source).not.toContain(forbidden);
    }
  });
});
