/** I191 / design §14.34: C5 single navigation tree, prose, edit and version presentation.
 * Shared buttons/fields remain exclusively in controls.ts; styles.ts composes this section.
 */
export const CHAPTERS_STYLES = `
/* Current-chapter scenes share the navigation column; prose takes the remaining space. */
.nv-chapters {
  display: grid;
  grid-template-columns: minmax(180px, 224px) minmax(0, 1fr);
  gap: calc(var(--nv-grid) * 2);
  align-items: start;
  min-height: 0;
}

/* I107 章节区四种互斥操作模式（design §14.14 / R18-9）：tab 容器保留在
   正文栏内；只有当前 tabpanel 进入布局，避免隐藏面板继续制造请求或焦点。 */
.nv-chapters__modes {
  display: flex;
  align-items: stretch;
  gap: calc(var(--nv-grid) * 0.5);
  overflow-x: auto;
  border-bottom: 1px solid var(--nv-line);
}

.nv-chapters__mode {
  display: inline-flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.35);
  flex: 0 0 auto;
  padding: calc(var(--nv-grid) * 0.65) calc(var(--nv-grid) * 0.8);
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--nv-ink-dim);
  cursor: pointer;
  font-family: var(--nv-sans);
  font-size: 12px;
  white-space: nowrap;
}

.nv-chapters__mode:hover,
.nv-chapters__mode:focus-visible {
  color: var(--nv-ink);
  background: var(--nv-paper-raised);
}

.nv-chapters__mode.is-active {
  border-bottom-color: var(--nv-cinnabar);
  color: var(--nv-ink);
}

.nv-chapters__mode-badge {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--nv-cinnabar);
  color: var(--nv-paper);
  font-size: 10px;
  line-height: 1.4;
  text-align: center;
}

.nv-chapters__mode-panel {
  min-width: 0;
  padding-top: calc(var(--nv-grid) * 0.75);
}

.nv-chapters__pane {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
  max-height: 70vh;
  overflow-y: auto;
  padding-right: calc(var(--nv-grid) * 0.5);
}

.nv-chapters__pane--body {
  max-height: none;
  overflow-y: visible;
}

.nv-chapters__item-title,
.nv-chapters__item-meta,
.nv-chapters__item-summary {
  display: block;
  overflow-wrap: anywhere;
}

.nv-chapters__item-meta,
.nv-chapters__item-summary {
  font-size: 12px;
  color: var(--nv-ink-faint);
  margin-top: calc(var(--nv-grid) * 0.25);
}

.nv-chapters__empty {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
  line-height: 1.7;
}

.nv-chapters__chapter-node { min-width: 0; }
.nv-chapters__scenes { padding: 8px 0 8px 12px; margin: 4px 0 12px 8px; border-left: 2px solid var(--nv-line); display: grid; gap: 6px; }
.nv-chapters__scenes > h3 { font-size: 13px; color: var(--nv-ink-dim); }
.nv-chapters__tools, .nv-chapters__finalization-tools { border-block: 1px solid var(--nv-line); padding: 12px 0; }
.nv-chapters__tools > summary, .nv-chapters__finalization-tools > summary { cursor: pointer; color: var(--nv-ink-dim); }
.nv-chapters__pane--body { padding: clamp(12px, 2vw, 28px); background: var(--nv-paper-raised); border: 1px solid var(--nv-line); border-radius: 12px; }
.nv-chapters__prose {
  max-width: 46em;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 1.25);
}

.nv-chapters__paragraph {
  margin: 0;
  font-family: var(--nv-serif);
  font-size: 18px;
  line-height: 1.9;
  color: var(--nv-ink);
}

.nv-chapters__state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-chapters__error-text {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-danger);
  line-height: 1.6;
}

/* I61 C5 正文编辑（design §5.12 / §14.9 / R13-2）：编辑模式表单、范围提示、
   保存动作、reparse 提案面板与脏文本离开确认条。 */
.nv-chapters__read,
.nv-chapters__editor {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 1.25);
}

.nv-chapters__editor-input {
  font-family: var(--nv-serif);
  font-size: 18px;
  line-height: 1.9;
  min-height: 52vh;
  resize: vertical;
}

.nv-chapters__editor-range {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
  line-height: 1.6;
}

.nv-chapters__reparse {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.7;
}

.nv-chapters__reparse-status {
  margin: 0 0 calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}

.nv-chapters__reparse--proposed,
.nv-chapters__reparse--accepting {
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-chapters__reparse--done,
.nv-chapters__reparse--rejected {
  color: var(--nv-ink-dim);
}

.nv-chapters__reparse--error {
  color: var(--nv-danger);
}

.nv-chapters__reparse-hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
  line-height: 1.6;
}

.nv-chapters__leave {
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-cinnabar);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-chapters__leave-hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
  line-height: 1.6;
}

/* I70 C5 正文版本与分支（design §14.10「正文版本与分支」/ R14-5）：版本列表、
   命名存档、选用与行 diff 视图。Client 只提交受控命令，版本真相始终在 Host。 */
.nv-branch {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
  margin-top: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-branch__body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-branch__hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
  line-height: 1.6;
}

.nv-branch__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__item {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.25);
  padding: calc(var(--nv-grid) * 0.5);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.5);
}

.nv-branch__item.is-chosen {
  border-color: var(--nv-cinnabar);
}

.nv-branch__item-head {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__label {
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
  overflow-wrap: anywhere;
}

.nv-branch__badge {
  font-size: 11px;
  line-height: 1.5;
  color: var(--nv-cinnabar);
  border: 1px solid var(--nv-cinnabar);
  border-radius: 999px;
  padding: 0 calc(var(--nv-grid) * 0.5);
}

.nv-branch__meta {
  font-size: 11px;
  color: var(--nv-ink-faint);
}

.nv-branch__save {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__message {
  color: var(--nv-ok);
}

.nv-branch__diff {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
  padding: calc(var(--nv-grid) * 0.5);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.5);
  max-height: 40vh;
  overflow-y: auto;
}

.nv-branch__diff-title {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-branch__diff-lines {
  display: flex;
  flex-direction: column;
}

.nv-branch__line {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nv-branch__line--same {
  color: var(--nv-ink-faint);
}

.nv-branch__line--del {
  color: var(--nv-danger);
}

.nv-branch__line--add {
  color: var(--nv-ok);
}

.nv-panel {
  padding: calc(var(--nv-grid) * 2);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}
`;
