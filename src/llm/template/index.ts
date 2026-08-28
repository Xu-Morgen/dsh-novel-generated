import { PromptTemplateSchema, InstructPresetSchema, type InstructPreset, type PromptTemplate } from '../../core/schema/prompt-template.js';

/** One already-serialized named context block available to an A2 prompt template. */
export interface PromptSection {
  readonly id: string;
  readonly text: string;
}

/**
 * Render a configured prompt shell deterministically. Section text remains owned
 * by existing serializers; this module only selects their declared A2 order
 * (design §5.2), so it never becomes a second context assembler.
 */
export function renderPromptTemplate(
  templateInput: PromptTemplate,
  presetInput: InstructPreset | undefined,
  sections: readonly PromptSection[],
  userPrompt: string,
): string {
  const template = PromptTemplateSchema.parse(templateInput);
  const preset = presetInput === undefined ? undefined : InstructPresetSchema.parse(presetInput);
  if (preset && preset.backendRef !== template.backendRef) throw new Error('Instruct preset backend must match prompt template backend');
  if (typeof userPrompt !== 'string' || !userPrompt.trim()) throw new Error('User prompt is required');

  const byId = new Map<string, string>();
  for (const section of sections) {
    if (!section || typeof section.id !== 'string' || !section.id.trim() || typeof section.text !== 'string' || !section.text.trim()) {
      throw new Error('Prompt section requires a non-empty ID and text');
    }
    if (byId.has(section.id)) throw new Error(`Duplicate prompt section: ${section.id}`);
    byId.set(section.id, section.text);
  }
  const ordered = template.sectionOrder.map((id) => {
    const text = byId.get(id);
    if (text === undefined) throw new Error(`Prompt template section is missing: ${id}`);
    return text;
  });
  if (byId.size !== template.sectionOrder.length) throw new Error('Prompt template must declare every supplied section exactly once');

  const system = [preset?.systemPrompt, preset?.jailbreak].filter((value): value is string => Boolean(value?.trim())).join('\n\n');
  return [
    system ? `${template.roleHeaders.system}\n${system}` : undefined,
    ...ordered,
    `${template.roleHeaders.user}\n${userPrompt}`,
    template.roleHeaders.assistant,
  ].filter((value): value is string => value !== undefined).join('\n\n');
}

/** Test a preset's optional activation rule against the Host-owned user request. */
export function isInstructPresetActive(presetInput: InstructPreset | undefined, userPrompt: string): boolean {
  if (presetInput === undefined) return false;
  const preset = InstructPresetSchema.parse(presetInput);
  return preset.activationRegex === undefined || new RegExp(preset.activationRegex).test(userPrompt);
}
