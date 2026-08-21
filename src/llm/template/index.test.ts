import { describe, expect, it } from 'vitest';
import { isInstructPresetActive, renderPromptTemplate } from './index.js';

const template = {
  id: 'chapter', backendRef: 'draft',
  roleHeaders: { system: 'SYSTEM', user: 'USER', assistant: 'ASSISTANT' },
  sectionOrder: ['state', 'outline'], stopSequences: [],
};

describe('I31 prompt templates', () => {
  it('renders the declared section order with its persisted Instruct framing', () => {
    const prompt = renderPromptTemplate(template, { id: 'safe', backendRef: 'draft', systemPrompt: '用中文写作。', jailbreak: '保持正史。' }, [
      { id: 'outline', text: 'OUTLINE' }, { id: 'state', text: 'STATE' },
    ], '继续这一幕。');
    expect(prompt).toBe('SYSTEM\n用中文写作。\n\n保持正史。\n\nSTATE\n\nOUTLINE\n\nUSER\n继续这一幕。\n\nASSISTANT');
  });

  it('activates a preset only when its configured Host-side rule matches', () => {
    expect(isInstructPresetActive({ id: 'chapter-only', backendRef: 'draft', systemPrompt: 'x', activationRegex: '^chapter:' }, 'chapter: continue')).toBe(true);
    expect(isInstructPresetActive({ id: 'chapter-only', backendRef: 'draft', systemPrompt: 'x', activationRegex: '^chapter:' }, 'revise: continue')).toBe(false);
  });

  it('rejects missing, extra, duplicate, or cross-backend prompt input', () => {
    expect(() => renderPromptTemplate(template, undefined, [{ id: 'state', text: 'STATE' }], 'x')).toThrow(/missing: outline/);
    expect(() => renderPromptTemplate(template, undefined, [{ id: 'state', text: 'STATE' }, { id: 'outline', text: 'OUTLINE' }, { id: 'other', text: 'OTHER' }], 'x')).toThrow(/declare every supplied/);
    expect(() => renderPromptTemplate(template, undefined, [{ id: 'state', text: 'STATE' }, { id: 'state', text: 'OTHER' }], 'x')).toThrow(/Duplicate/);
    expect(() => renderPromptTemplate(template, { id: 'other', backendRef: 'other', systemPrompt: '' }, [{ id: 'state', text: 'STATE' }, { id: 'outline', text: 'OUTLINE' }], 'x')).toThrow(/must match/);
  });
});
