/**
 * I83 styles 分区 · panels：生成队列与知情揭示管理面（I65/I66）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
export const PANELS_STYLES = `
/* I65 生成队列（design §14.9 / R13-6）：范围勾选 + 配置 + 控制 + 任务列表。 */
.nv-queue__cards {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
  margin: 0 0 var(--nv-grid);
}

.nv-queue__card {
  display: flex;
  align-items: baseline;
  gap: calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
}

.nv-queue__card-title {
  font-weight: 600;
}

.nv-queue__card-meta {
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-queue__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nv-grid);
  align-items: flex-end;
}

.nv-queue__option {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
  padding-bottom: calc(var(--nv-grid) * 0.75);
}

.nv-queue__summary {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nv-ink-dim);
}

.nv-queue__tasks {
  list-style: none;
  margin: var(--nv-grid) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-queue__task {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  background: var(--nv-paper);
}

.nv-queue__task--failed {
  border-color: var(--nv-cinnabar);
}

.nv-queue__task--candidate-ready {
  border-color: var(--nv-cinnabar);
}

.nv-queue__task-main {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-queue__task-title {
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
}

.nv-queue__badge {
  border-radius: calc(var(--nv-grid) * 0.5);
  padding: 0 calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 11px;
  line-height: 1.6;
  border: 1px solid var(--nv-line);
  color: var(--nv-ink-dim);
}

.nv-queue__badge--running {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-queue__badge--candidate-ready,
.nv-queue__badge--failed {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-queue__task-meta {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-queue__task-error {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-cinnabar);
}

.nv-queue__empty {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
}

/* I66 知情与揭示管理面（design §14.10 / R14-1）：事实/角色双视图 + 揭示/holder 提案。 */
.nv-knowledge__summary {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nv-ink-dim);
}

.nv-knowledge__view-tabs {
  display: flex;
  gap: calc(var(--nv-grid) * 0.5);
  margin: 0 0 var(--nv-grid);
}

.nv-knowledge__view-tabs .nv-btn.is-active {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-knowledge__facts,
.nv-knowledge__characters {
  list-style: none;
  margin: 0 0 var(--nv-grid);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-knowledge__fact,
.nv-knowledge__character {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  background: var(--nv-paper);
}

.nv-knowledge__fact.is-selected {
  border-color: var(--nv-cinnabar);
}

.nv-knowledge__fact-main,
.nv-knowledge__character-main {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.75);
  flex-wrap: wrap;
}

.nv-knowledge__fact-text {
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
  flex: 1 1 100%;
}

.nv-knowledge__character-name {
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
}

.nv-knowledge__badge {
  border-radius: calc(var(--nv-grid) * 0.5);
  padding: 0 calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 11px;
  line-height: 1.6;
  border: 1px solid var(--nv-line);
  color: var(--nv-ink-dim);
}

.nv-knowledge__badge--hidden {
  border-color: var(--nv-line);
  color: var(--nv-ink-faint);
}

.nv-knowledge__badge--partially-revealed {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-knowledge__badge--revealed {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-knowledge__fact-meta {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-knowledge__pov-hint {
  margin: calc(var(--nv-grid) * 0.5) 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__character-empty {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-knowledge__character-knows {
  list-style: none;
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.25);
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__action {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: var(--nv-grid);
  margin: 0 0 var(--nv-grid);
  background: var(--nv-paper);
}

.nv-knowledge__action-title {
  margin: 0 0 calc(var(--nv-grid) * 0.75);
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 13px;
  color: var(--nv-ink);
}

.nv-knowledge__holders {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--nv-grid) * 0.75);
  margin: 0 0 var(--nv-grid);
}

.nv-knowledge__holder {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.25);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
}

.nv-knowledge__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nv-grid);
  align-items: flex-end;
}

.nv-knowledge__pending {
  margin: var(--nv-grid) 0 0;
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
}

.nv-knowledge__pending summary {
  font-family: var(--nv-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--nv-ink);
  cursor: pointer;
}

.nv-knowledge__pending ul {
  list-style: none;
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-knowledge__pending-text {
  margin: 0 0 calc(var(--nv-grid) * 0.25);
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__message {
  margin: var(--nv-grid) 0 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__hint {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nv-ink-faint);
}

.nv-knowledge__empty {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
}
`;
