import { ruleSchema, type ActiveRuleView } from '../schema/rules.js';
import { styleProfileSchema, type ConstantStyleSegment } from '../schema/style.js';
import {
  characterCoreSchema,
  type CharacterCore,
  type CharacterKind,
  type SceneCharacterView,
} from '../schema/characters.js';
import { worldEntrySchema, type WorldEntry, type WorldEntryHit } from '../schema/worldview.js';
import { worldStateSchema, type CharacterState, type WorldState } from '../schema/state.js';
import { relationshipSchema, relationshipSummary, type RelationshipSummarySource } from '../schema/relationship.js';
import { ContextAssemblyError, type ContextAssembler, type ContextSectionSerializer } from './index.js';

/**
 * B1 constant-layer prompt serializer (design §8). It validates consumer views
 * and sorts itself, so equivalent inputs remain stable even when a caller did
 * not obtain them directly from RuleRepository.listActive().
 */
export const ruleContextSerializer: ContextSectionSerializer = {
  id: 'rules',
  heading: 'Rules',
  serialize(source: unknown): string {
    if (!Array.isArray(source)) throw new ContextAssemblyError('Rules context source must be an array');
    const rules = source.map((view) => validateActiveRuleView(view));
    return rules
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
      .map((rule) => {
        const examples = rule.examples.length === 0 ? '' : `\n  examples: ${rule.examples.join(' | ')}`;
        return `- id: ${rule.id}\n  priority: ${rule.priority}\n  scope: ${rule.scope}\n  kind: ${rule.kind}\n  immutable: ${rule.immutable}\n  statement: ${rule.statement}${examples}`;
      })
      .join('\n');
  },
};

/**
 * B4 constant-layer prompt serializer (design §8). The segment's duplicated
 * forbidden view is checked against its canonical profile to reject stale or
 * caller-mutated consumer data rather than silently changing prompt meaning.
 */
export const styleContextSerializer: ContextSectionSerializer = {
  id: 'style',
  heading: 'Style',
  serialize(source: unknown): string {
    if (!isStyleSegment(source)) throw new ContextAssemblyError('Style context source is required');
    const profile = styleProfileSchema.parse(source.profile);
    if (!sameStrings(profile.forbidden, source.forbidden)) {
      throw new ContextAssemblyError('Style forbidden expressions must match the profile');
    }
    const forbidden = source.forbidden.length === 0 ? '(none)' : source.forbidden.map((item) => `- ${item}`).join('\n');
    return [
      `id: ${profile.id}`,
      `name: ${profile.name}`,
      `person: ${profile.person}`,
      `tense: ${profile.tense}`,
      `povScope: ${profile.povScope}`,
      `tone: ${profile.tone}`,
      `proseStyle: ${profile.proseStyle}`,
      `chapterFormat: ${profile.chapterFormat}`,
      `dialogueConventions: ${profile.dialogueConventions}`,
      'forbidden:',
      forbidden,
    ].join('\n');
  },
};

/**
 * B3 character serializer (development plan I13 / design §8.1). It receives
 * only the scene-relevant {@link SceneCharacterView} slice and re-derives the
 * view's `name`/`kind`/`pov` from the canonical core, rejecting any caller
 * mutation. Output is stable-sorted by name then id. Cross-layer
 * `relationships`/`knowledgeIds` are deliberately not injected yet (I16/I18).
 */
export const characterContextSerializer: ContextSectionSerializer = {
  id: 'characters',
  heading: 'Characters',
  truncatable: true,
  optional: true,
  serialize(source: unknown): string {
    if (!Array.isArray(source)) throw new ContextAssemblyError('Characters context source must be an array');
    const characters = source.map((view) => validateSceneCharacterView(view));
    return characters
      .sort((left, right) => left.name.localeCompare(right.name) || left.character.id.localeCompare(right.character.id))
      .map(renderCharacter)
      .join('\n');
  },
};

/**
 * B2 worldview serializer (development plan I13 / design §8.1). It receives
 * only trigger-hit {@link WorldEntryHit} entries and validates their consistency
 * against the canonical entry; non-active hits are rejected. Output is
 * stable-sorted by entry id.
 */
export const worldContextSerializer: ContextSectionSerializer = {
  id: 'worldview',
  heading: 'Worldview',
  truncatable: true,
  optional: true,
  serialize(source: unknown): string {
    if (!Array.isArray(source)) throw new ContextAssemblyError('Worldview context source must be an array');
    const hits = source.map((hit) => validateWorldEntryHit(hit));
    return hits
      .sort((left, right) => left.entryId.localeCompare(right.entryId))
      .map(renderWorldHit)
      .join('\n');
  },
};

/**
 * C2 state serializer (development plan I13 / design §8.1 item 2). It emits a
 * compact structured snapshot — key/value lines, never prose — with characters
 * and opaque flag keys stable-sorted for byte-identical output.
 */
/** C1 relationship serializer: only pairs present in the current scene are injected. */
export const relationshipContextSerializer: ContextSectionSerializer = {
  id: 'relationships',
  heading: 'Relationships',
  truncatable: true,
  optional: true,
  serialize(source: unknown): string {
    if (source === undefined) return '';
    if (!isRelationshipSummarySource(source)) throw new ContextAssemblyError('Invalid relationship context source');
    return relationshipSummary(source)
      .map(({ relationship }) => renderRelationship(relationship))
      .join('\n');
  },
};

export const stateContextSerializer: ContextSectionSerializer = {
  id: 'state',
  heading: 'State',
  truncatable: true,
  serialize(source: unknown): string {
    const state = parseWorldState(source);
    return renderWorldState(state);
  },
};

/**
 * Register all five current serializers in their canonical section order.
 * This is the I13 registrar; the I12 two-section registrar remains available
 * for the historical B1/B4 slice.
 */
export function registerContextSerializers(assembler: ContextAssembler): ContextAssembler {
  return assembler
    .register(ruleContextSerializer)
    .register(styleContextSerializer)
    .register(characterContextSerializer)
    .register(worldContextSerializer)
    .register(relationshipContextSerializer)
    .register(stateContextSerializer);
}

/**
 * Register the two fixed I12 serializers. Since I13 the assembler requires all
 * five sections, so this subset cannot assemble alone; use
 * {@link registerContextSerializers} for a complete prompt.
 */
export function registerI12Serializers(assembler: ContextAssembler): ContextAssembler {
  return assembler.register(ruleContextSerializer).register(styleContextSerializer);
}

interface ValidatedSceneCharacter {
  character: CharacterCore;
  name: string;
  kind: CharacterKind;
  pov: boolean;
}

interface ValidatedWorldHit {
  entry: WorldEntry;
  entryId: string;
  ancestors: string[];
  level: number;
}

function validateActiveRuleView(value: unknown) {
  if (!isActiveRuleView(value)) throw new ContextAssemblyError('Invalid active rule context source');
  const rule = ruleSchema.parse(value.rule);
  if (!rule.active || value.scope !== rule.scope || value.priority !== rule.priority || value.immutable !== rule.immutable) {
    throw new ContextAssemblyError(`Invalid active rule context source: ${rule.id}`);
  }
  return rule;
}

function validateSceneCharacterView(value: unknown): ValidatedSceneCharacter {
  if (!isSceneCharacterView(value)) throw new ContextAssemblyError('Invalid scene character context source');
  const result = characterCoreSchema.safeParse(value.character);
  if (!result.success) throw new ContextAssemblyError('Invalid scene character context source');
  const character = result.data;
  const name = character.name;
  const kind = character.kind;
  const pov = kind === 'pov';
  if (value.name !== name || value.kind !== kind || value.pov !== pov) {
    throw new ContextAssemblyError(`Invalid scene character context source: ${character.id}`);
  }
  return { character, name, kind, pov };
}

function validateWorldEntryHit(value: unknown): ValidatedWorldHit {
  if (!isWorldEntryHit(value)) throw new ContextAssemblyError('Invalid world entry hit context source');
  const result = worldEntrySchema.safeParse(value.entry);
  if (!result.success) throw new ContextAssemblyError('Invalid world entry hit context source');
  const entry = result.data;
  if (value.entryId !== entry.id) {
    throw new ContextAssemblyError(`Invalid world entry hit context source: ${entry.id}`);
  }
  if (!Array.isArray(value.ancestors) || value.ancestors.some((ancestor) => typeof ancestor !== 'string' || !ancestor.trim())) {
    throw new ContextAssemblyError(`Invalid world entry hit context source: ${entry.id}`);
  }
  if (value.level !== value.ancestors.length) {
    throw new ContextAssemblyError(`Invalid world entry hit context source: ${entry.id}`);
  }
  if (entry.status !== 'active') {
    throw new ContextAssemblyError(`World entry hit must be active: ${entry.id}`);
  }
  return { entry, entryId: entry.id, ancestors: value.ancestors, level: value.level };
}

function isRelationshipSummarySource(value: unknown): value is RelationshipSummarySource {
  if (!value || typeof value !== 'object') return false;
  const source = value as { relationships?: unknown; characterIds?: unknown };
  return Array.isArray(source.relationships)
    && source.relationships.every((item) => relationshipSchema.safeParse(item).success)
    && Array.isArray(source.characterIds)
    && source.characterIds.every((id) => typeof id === 'string' && id.length > 0);
}

function renderRelationship(relationship: RelationshipSummarySource['relationships'][number]): string {
  return [
    `- id: ${relationship.id}`,
    `  from: ${relationship.from}`,
    `  to: ${relationship.to}`,
    `  type: ${relationship.type}`,
    `  affinity: ${relationship.affinity}`,
    `  trust: ${relationship.trust}`,
    `  status: ${relationship.status}`,
    `  milestones: ${list(relationship.milestones)}`,
    `  knownTo: ${list(relationship.knownTo)}`,
  ].join('\n');
}

function parseWorldState(value: unknown): WorldState {
  const result = worldStateSchema.safeParse(value);
  if (!result.success) throw new ContextAssemblyError('Invalid state context source');
  return result.data;
}

function renderCharacter(view: ValidatedSceneCharacter): string {
  const character = view.character;
  const arc = character.arc;
  return [
    `- id: ${character.id}`,
    `  name: ${character.name}`,
    `  kind: ${character.kind}`,
    `  pov: ${view.pov}`,
    `  aliases: ${list(character.aliases)}`,
    `  personality: ${character.personality}`,
    `  background: ${character.background}`,
    `  motivation: ${character.motivation}`,
    `  goals: ${list(character.goals)}`,
    `  flaws: ${list(character.flaws)}`,
    `  abilities: ${list(character.abilities)}`,
    `  speechStyle: ${character.speechStyle}`,
    `  staticTraits: ${list(character.staticTraits)}`,
    '  arc:',
    `    startingPoint: ${arc.startingPoint}`,
    `    desiredEnd: ${arc.desiredEnd}`,
    `    keyBeats: ${list(arc.keyBeats)}`,
  ].join('\n');
}

function renderWorldHit(hit: ValidatedWorldHit): string {
  const entry = hit.entry;
  const lines = [
    `- id: ${entry.id}`,
    `  kind: ${entry.kind}`,
    `  title: ${entry.title}`,
    `  keywords: ${list(entry.keywords)}`,
    `  content: ${entry.content}`,
  ];
  if (hit.ancestors.length > 0) lines.push(`  ancestors: ${hit.ancestors.join(', ')}`);
  return lines.join('\n');
}

function renderWorldState(state: WorldState): string {
  const scene = state.scene;
  const lines = [
    `id: ${state.id}`,
    `seq: ${state.seq}`,
    `storyTime: ${state.storyTime}`,
    'scene:',
    `  location: ${scene.location}`,
    `  timeOfDay: ${scene.timeOfDay}`,
    `  weather: ${scene.weather}`,
    `  season: ${scene.season}`,
    `  atmosphere: ${scene.atmosphere}`,
    'characters:',
    ...state.characters
      .slice()
      .sort((left, right) => left.characterId.localeCompare(right.characterId))
      .flatMap(renderCharacterState),
  ];
  return lines.join('\n');
}

function renderCharacterState(character: CharacterState): string[] {
  return [
    `  - characterId: ${character.characterId}`,
    `    location: ${character.location}`,
    `    alive: ${character.alive}`,
    `    health: ${character.health}`,
    `    mood: ${character.mood}`,
    `    inventory: ${list(character.inventory)}`,
    `    condition: ${character.condition}`,
    `    currentGoal: ${character.currentGoal}`,
    `    flags: ${renderFlags(character.flags)}`,
  ];
}

function renderFlags(flags: Record<string, unknown>): string {
  const keys = Object.keys(flags).sort();
  if (keys.length === 0) return '(none)';
  return `{ ${keys.map((key) => `${key}: ${stableValue(flags[key])}`).join(', ')} }`;
}

/** Deterministic rendering of opaque flag values (sorted object keys, ordered arrays). */
function stableValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(', ')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().map((key) => `${key}: ${stableValue(record[key])}`);
    return `{ ${entries.join(', ')} }`;
  }
  return String(value);
}

function list(items: readonly string[]): string {
  return items.length === 0 ? '(none)' : items.join(', ');
}

function isActiveRuleView(value: unknown): value is ActiveRuleView {
  return typeof value === 'object' && value !== null && 'rule' in value && 'scope' in value && 'priority' in value && 'immutable' in value;
}

function isStyleSegment(value: unknown): value is ConstantStyleSegment {
  return typeof value === 'object' && value !== null && 'profile' in value && 'forbidden' in value && Array.isArray(value.forbidden);
}

function isSceneCharacterView(value: unknown): value is SceneCharacterView {
  return typeof value === 'object' && value !== null && 'character' in value && 'name' in value && 'kind' in value && 'pov' in value;
}

function isWorldEntryHit(value: unknown): value is WorldEntryHit {
  return typeof value === 'object' && value !== null && 'entry' in value && 'entryId' in value && 'ancestors' in value && 'level' in value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
