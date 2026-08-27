import { describe, expect, it } from 'vitest';
import {
  categoryOf,
  filterReviewIssues,
  issueIdOf,
  projectSceneIssues,
  summarizeReviewIssues,
  withStatus,
  type ReviewIssue,
} from './issue.js';

describe('I64 统一 issue 投影（五类问题 × 严重度 × 定位 × 状态）', () => {
  it('categoryOf 把 I21/I22/I24/I20 探测器 kind 映射到五类；未知 kind fail-closed', () => {
    expect(categoryOf('immutable-rule')).toBe('rule');
    expect(categoryOf('canon-conflict')).toBe('canon');
    expect(categoryOf('knowledge-leak')).toBe('knowledge');
    expect(categoryOf('relationship-drift')).toBe('relationship');
    expect(categoryOf('style-deviation')).toBe('style');
    expect(categoryOf('forbidden-expression')).toBe('style');
    expect(() => categoryOf('mystery-kind')).toThrow(/Unknown review issue kind/);
  });

  it('projectSceneIssues 投影出带正文定位/引用/严重度/来源的问题，同场景同 id 去重', () => {
    const location = { chapterId: 'chapter-1', sceneId: 'scene-1' };
    const issues = projectSceneIssues('chapter-1', 'scene-1', [
      { kind: 'canon-conflict', severity: 'hard', message: '与正史矛盾', references: ['evt-1'] },
      { kind: 'knowledge-leak', severity: 'hard', message: 'POV 泄漏', references: ['k-1'] },
      // 同场景内完全相同的违规只投影一次（确定性去重）。
      { kind: 'canon-conflict', severity: 'hard', message: '与正史矛盾', references: ['evt-1'] },
    ]);
    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.location).toEqual(location);
      expect(issue.status).toBe('open');
      expect(issue.references.length).toBeGreaterThan(0);
    }
    expect(issues.map((issue) => issue.category)).toEqual(['canon', 'knowledge']);
    expect(issues.map((issue) => issue.severity)).toEqual(['hard', 'hard']);
  });

  it('issueIdOf 确定性：相同内容恒等，不同场景/消息/引用不同', () => {
    const location = { chapterId: 'chapter-1', sceneId: 'scene-1' };
    const a = issueIdOf('style', 'style-deviation', location, '语气偏离', ['style-demo']);
    const b = issueIdOf('style', 'style-deviation', location, '语气偏离', ['style-demo']);
    expect(a).toBe(b);
    expect(a.startsWith('iss-')).toBe(true);
    expect(issueIdOf('style', 'style-deviation', location, '语气偏离', ['style-demo']))
      .not.toBe(issueIdOf('style', 'style-deviation', { chapterId: 'chapter-1', sceneId: 'scene-2' }, '语气偏离', ['style-demo']));
    expect(issueIdOf('style', 'style-deviation', location, '语气偏离', ['style-demo']))
      .not.toBe(issueIdOf('style', 'style-deviation', location, '语气偏离', ['style-other']));
  });

  it('withStatus 依据审计账本裁决做状态 join；无记录 → open', () => {
    const issue: ReviewIssue = {
      id: 'iss-1', category: 'relationship', severity: 'soft', kind: 'relationship-drift',
      message: '关系漂移', references: ['rel-1'], location: { chapterId: 'c', sceneId: 's' }, status: 'open',
    };
    expect(withStatus(issue, undefined).status).toBe('open');
    expect(withStatus(issue, 'continue').status).toBe('continued');
    expect(withStatus(issue, 'rewrite-requested').status).toBe('rewrite-requested');
  });

  it('summarizeReviewIssues 汇总总数/硬/软/五类计数', () => {
    const issues: readonly ReviewIssue[] = [
      issue('rule', 'hard'),
      issue('canon', 'hard'),
      issue('knowledge', 'hard'),
      issue('relationship', 'soft'),
      issue('style', 'soft'),
      issue('style', 'soft'),
    ];
    const summary = summarizeReviewIssues(issues);
    expect(summary).toEqual({
      total: 6, hard: 3, soft: 3,
      byCategory: { rule: 1, canon: 1, knowledge: 1, relationship: 1, style: 2 },
    });
  });

  it('filterReviewIssues 按分类/严重度/状态组合过滤；空过滤返回全部', () => {
    const issues: readonly ReviewIssue[] = [
      issue('rule', 'hard', 'open'),
      issue('canon', 'hard', 'open'),
      issue('relationship', 'soft', 'open'),
      issue('style', 'soft', 'continued'),
    ];
    expect(filterReviewIssues(issues, {})).toHaveLength(4);
    expect(filterReviewIssues(issues, { categories: ['rule', 'canon'] }).map((item) => item.category)).toEqual(['rule', 'canon']);
    expect(filterReviewIssues(issues, { severities: ['soft'] }).map((item) => item.severity)).toEqual(['soft', 'soft']);
    expect(filterReviewIssues(issues, { statuses: ['continued'] }).map((item) => item.id)).toEqual(['style-soft']);
    expect(filterReviewIssues(issues, { categories: ['style'], severities: ['soft'], statuses: ['continued'] }).map((item) => item.id)).toEqual(['style-soft']);
    // 组合无命中 → 空数组。
    expect(filterReviewIssues(issues, { categories: ['rule'], statuses: ['continued'] })).toEqual([]);
  });
});

let sequence = 0;
function issue(category: ReviewIssue['category'], severity: 'hard' | 'soft', status: ReviewIssue['status'] = 'open'): ReviewIssue {
  sequence += 1;
  return {
    id: `${category}-${severity}`,
    category, severity, kind: category === 'rule' ? 'immutable-rule' : `${category}-kind`,
    message: `消息 ${sequence}`, references: ['ref'],
    location: { chapterId: 'chapter-1', sceneId: 'scene-1' }, status,
  };
}
