import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { createRuleService } from './rule-service.js';
import { createStyleService } from './style-service.js';
import { createRuleStyleManagerService, DEFAULT_STYLE_ID } from './rule-style-manager-service.js';

/**
 * I67 B1 规则与 B4 文风控制面 Host owner 测试（design §14.10「B1/B4 控制面」/ R14-2）。
 *
 * 触发检测消费者夹具（AGENTS §2 地基切片必配消费者夹具）：
 * - 生成消费者（writing-context 读 `rules.listActive` + `style.constantSegment`）
 *   与检测消费者（review-service 读 `rules.listActive` + `style.constantSegment` +
 *   `style.forbiddenExpressions`）消费的正是管理面保存的同一批 Host 存储 ——
 *   管理面保存后按这三种下游读取方式断言读到新真相。
 * - 负向：非法枚举、越界优先级、immutable 改写全部 fail-fast 零写拒绝。
 */
describe('I67 B1/B4 控制面 Host owner（R14-2）', () => {
  let roots: string[] = [];
  const tempRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i67-'));
    roots.push(root);
    return root;
  };
  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots = [];
  });

  const setup = async () => {
    const projectsRoot = await tempRoot();
    const rules = createRuleService(projectsRoot);
    const style = createStyleService(projectsRoot);
    const project = new ProjectRepository(projectsRoot);
    await project.createProject({ projectId: 'demo', name: '规则文风演示' });
    let disposed = 0;
    const manager = createRuleStyleManagerService({
      rules, style, projectsRoot,
      onDispose: (dispose) => { disposed += 1; void dispose; },
    });
    return { projectsRoot, rules, style, manager, disposed };
  };

  it('round-trip：规则与风格档案保存后读回相同值（含优先级/immutable/枚举）', async () => {
    const { manager } = await setup();
    const created = await manager.createRule('demo', {
      id: 'no-resurrection', scope: 'global', kind: 'taboo', statement: '死者不可复活。',
      priority: 100, immutable: true, examples: ['复活仪式失败'], active: true,
    });
    expect(created.version).toBe(1);
    expect(await manager.readRule('demo', 'no-resurrection')).toEqual(created);

    // mutable 规则可 round-trip 更新（version 递增）；immutable 规则另测拒绝。
    const mutable = await manager.createRule('demo', {
      id: 'monologue', scope: 'character', kind: 'genre', statement: '英雄不多话。',
      priority: 30, immutable: false, examples: [], active: true,
    });
    const updated = await manager.updateRule('demo', 'monologue', {
      scope: 'character', kind: 'genre', statement: '英雄极少数时候多话。',
      priority: 40, immutable: false, examples: ['决战独白'], active: true,
    });
    expect(updated.version).toBe(2);
    expect(await manager.readRule('demo', 'monologue')).toEqual(updated);

    const savedStyle = await manager.saveStyle('demo', {
      name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '精确的感官细节', chapterFormat: '场景断行 + 地点题注',
      dialogueConventions: '使用中文引号。', forbidden: ['突然之间', '命运的齿轮'],
    });
    expect(savedStyle.id).toBe(DEFAULT_STYLE_ID);
    expect(await manager.readStyle('demo')).toEqual(savedStyle);
    // list 投影 round-trip（rules 按 priority desc + id asc 排序：40 > 100 不成立，100 最高）。
    const projection = await manager.list('demo');
    expect(projection.rules.map((rule) => rule.id)).toEqual(['no-resurrection', 'monologue']);
    expect(projection.style).toEqual(savedStyle);
  });

  it('未初始化风格（I3 `{}` 占位）readStyle 返回 null，不当作损坏', async () => {
    const { manager } = await setup();
    expect(await manager.readStyle('demo')).toBeNull();
    const projection = await manager.list('demo');
    expect(projection.style).toBeNull();
  });

  it('非法枚举（scope/kind/person/tense/povScope）零写拒绝', async () => {
    const { manager } = await setup();
    await expect(manager.createRule('demo', {
      id: 'bad-scope', scope: 'galaxy' as never, kind: 'physics', statement: 'x',
      priority: 10, immutable: false, examples: [], active: true,
    })).rejects.toThrow();
    await expect(manager.createRule('demo', {
      id: 'bad-kind', scope: 'global', kind: 'destiny' as never, statement: 'x',
      priority: 10, immutable: false, examples: [], active: true,
    })).rejects.toThrow();
    await expect(manager.saveStyle('demo', {
      name: 'x', person: 'fourth' as never, tense: 'past', povScope: 'single',
      tone: 'a', proseStyle: 'b', chapterFormat: 'c', dialogueConventions: 'd', forbidden: [],
    })).rejects.toThrow();
    await expect(manager.saveStyle('demo', {
      name: 'x', person: 'first', tense: 'future' as never, povScope: 'single',
      tone: 'a', proseStyle: 'b', chapterFormat: 'c', dialogueConventions: 'd', forbidden: [],
    })).rejects.toThrow();
    await expect(manager.saveStyle('demo', {
      name: 'x', person: 'first', tense: 'past', povScope: 'omni' as never,
      tone: 'a', proseStyle: 'b', chapterFormat: 'c', dialogueConventions: 'd', forbidden: [],
    })).rejects.toThrow();
    // 零写：全部被拒后 readStyle 仍为 null、规则列表仍为空。
    expect(await manager.readStyle('demo')).toBeNull();
    expect((await manager.list('demo')).rules).toEqual([]);
  });

  it('越界优先级（<1 或 >100）零写拒绝，1 与 100 边界合法', async () => {
    const { manager } = await setup();
    const base = { scope: 'global' as const, kind: 'physics' as const, statement: 'x', immutable: false, examples: [] as string[], active: true };
    await expect(manager.createRule('demo', { ...base, id: 'too-low', priority: 0 })).rejects.toThrow(/优先级必须在/);
    await expect(manager.createRule('demo', { ...base, id: 'too-high', priority: 101 })).rejects.toThrow(/优先级必须在/);
    expect(await manager.createRule('demo', { ...base, id: 'min-ok', priority: 1 })).toMatchObject({ id: 'min-ok', priority: 1 });
    expect(await manager.createRule('demo', { ...base, id: 'max-ok', priority: 100 })).toMatchObject({ id: 'max-ok', priority: 100 });
    // update 同样拒绝越界。
    await expect(manager.updateRule('demo', 'min-ok', { ...base, priority: 0 })).rejects.toThrow(/优先级必须在/);
    expect((await manager.readRule('demo', 'min-ok')).priority).toBe(1);
  });

  it('immutable 非法改写失败：更新 immutable 规则（含 priority/statement/active）零写', async () => {
    const { manager } = await setup();
    await manager.createRule('demo', {
      id: 'fixed', scope: 'global', kind: 'physics', statement: '旧灯塔的海图只在月圆显字。',
      priority: 9, immutable: true, examples: [], active: true,
    });
    const before = await manager.readRule('demo', 'fixed');
    await expect(manager.updateRule('demo', 'fixed', {
      scope: 'global', kind: 'physics', statement: '改写尝试', priority: 1, immutable: true, examples: [], active: false,
    })).rejects.toThrow(/Immutable rule/);
    expect(await manager.readRule('demo', 'fixed')).toEqual(before);
  });

  it('触发检测消费者夹具：管理面保存后，生成/检测读取同一 Host 真相（listActive / constantSegment / forbiddenExpressions）', async () => {
    const { manager, rules, style } = await setup();
    // 先经管理面保存规则与风格（作者表单路径）。
    await manager.createRule('demo', {
      id: 'harbor-seal', scope: 'global', kind: 'physics', statement: '海港封印不可破。',
      priority: 7, immutable: true, examples: [], active: true,
    });
    await manager.createRule('demo', {
      id: 'draft-note', scope: 'character', kind: 'genre', statement: '英雄不多话。',
      priority: 3, immutable: false, examples: [], active: false,
    });
    await manager.saveStyle('demo', {
      name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '精确', chapterFormat: '场景断行', dialogueConventions: '中文引号',
      forbidden: ['突然之间', '命运的齿轮'],
    });
    // 生成消费者（writing-context）：rules.listActive + style.constantSegment。
    const active = await rules.listActive('demo');
    expect(active.map((view) => view.rule.id)).toEqual(['harbor-seal']);
    expect(active[0].rule.priority).toBe(7);
    expect(active[0].rule.immutable).toBe(true);
    expect((await style.constantSegment('demo')).profile.person).toBe('third-limited');
    expect((await style.constantSegment('demo')).profile.povScope).toBe('single');
    // 检测消费者（review-service）：同一 listActive + constantSegment + forbiddenExpressions。
    expect(await style.forbiddenExpressions('demo')).toEqual(['突然之间', '命运的齿轮']);
    // 再经管理面更新（作者把 draft-note 启用 + 提高优先级），下游立刻读到新真相。
    await manager.updateRule('demo', 'draft-note', {
      scope: 'character', kind: 'genre', statement: '英雄不多话。', priority: 8, immutable: false, examples: [], active: true,
    });
    const activeAfter = await rules.listActive('demo');
    expect(activeAfter.map((view) => view.rule.id)).toEqual(['draft-note', 'harbor-seal']);
    // 经管理面追加禁用表达，检测消费者立即读到。
    await manager.saveStyle('demo', {
      name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '精确', chapterFormat: '场景断行', dialogueConventions: '中文引号',
      forbidden: ['突然之间', '命运的齿轮', '猛地'],
    });
    expect(await style.forbiddenExpressions('demo')).toEqual(['突然之间', '命运的齿轮', '猛地']);
  });

  it('Fiber dispose 挂钩注册（H0-6）', async () => {
    const { disposed } = await setup();
    expect(disposed).toBe(1);
  });
});
