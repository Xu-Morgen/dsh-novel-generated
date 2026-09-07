/** I188 / design §14.34: sole owner of shared buttons, fields and feedback. */
export const CONTROLS_STYLES = `
:where(.desktop-shell, .nv-workbench) :where(button), .nv-btn {
  box-sizing: border-box;
  min-height: 40px;
  max-width: 100%;
  border: 1px solid var(--nv-line-strong);
  border-radius: 8px;
  padding: 8px 16px;
  background: var(--nv-paper-raised);
  color: var(--nv-ink);
  font-family: var(--nv-sans);
  font-size: 14px;
  line-height: 22px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
:where(.desktop-shell, .nv-workbench) button:hover:not(:disabled), .nv-btn:hover:not(:disabled) {
  background: var(--nv-hover);
}
:where(.desktop-shell, .nv-workbench) button:active:not(:disabled), .nv-btn:active:not(:disabled) {
  box-shadow: inset 0 0 0 1px currentColor;
}
:where(.desktop-shell, .nv-workbench) button:disabled, .nv-btn:disabled {
  color: var(--nv-ink-dim);
  background: var(--nv-hover);
  border-color: var(--nv-line);
  border-style: dashed;
  cursor: not-allowed;
}
.nv-btn--primary {
  color: #fff;
  background: var(--nv-cinnabar);
  border-color: var(--nv-cinnabar);
}
.nv-btn--primary:hover:not(:disabled) {
  color: #fff;
  background: var(--nv-accent-hover);
}
.nv-btn--ghost {
  color: var(--nv-ink-dim);
  background: transparent;
  border-color: transparent;
}
.nv-btn--danger {
  color: var(--nv-danger);
  border-color: var(--nv-danger);
  background: var(--nv-danger-soft);
}
.nv-btn--choice[aria-pressed="true"] {
  color: var(--nv-cinnabar);
  border-color: var(--nv-cinnabar);
  background: var(--nv-accent-soft);
  font-weight: 600;
}
.nv-btn--compact { min-height: 32px; padding: 4px 8px; }
.nv-control-reason { color: var(--nv-ink-dim); font-size: 12px; line-height: 18px; }
.nv-editor__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--nv-grid); }
:where(.desktop-shell, .nv-workbench) :focus-visible {
  outline: 2px solid var(--nv-cinnabar);
  outline-offset: 2px;
  scroll-margin: 16px;
}
:where(.desktop-shell, .nv-workbench) :where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea), .nv-field__input {
  box-sizing: border-box;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--nv-line-strong);
  border-radius: 8px;
  background: var(--nv-paper-raised);
  color: var(--nv-ink);
  font: 14px/22px var(--nv-sans);
}
.nv-field__input { width: 100%; resize: vertical; }
.nv-field__input:focus { border-color: var(--nv-cinnabar); }
.nv-editor__error, .nv-editor__badge {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid currentColor;
  border-radius: 8px;
  font: 14px/22px var(--nv-sans);
  overflow-wrap: anywhere;
}
.nv-editor__error { color: var(--nv-danger); background: var(--nv-danger-soft); }
.nv-editor__badge { color: var(--nv-warn); background: var(--nv-warn-soft); }
`;
