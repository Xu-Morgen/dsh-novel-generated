import { ContextAssembler, contextSectionOrder, contextTruncationMarker } from '../lib/core/assemble/index.js';
import { registerContextSerializers } from '../lib/core/assemble/serializers.js';

const rule = {
  id: 'harbor-law', version: 1, scope: 'global', kind: 'taboo',
  statement: '{{pov}} must honor the law named by {{user}}.', priority: 10,
  immutable: true, examples: ['No sailor breaks a sworn harbor law.'], active: true,
};
const style = {
  profile: {
    id: 'harbor-style', version: 1, name: 'Harbor noir', person: 'third-limited', tense: 'past', povScope: 'single',
    tone: 'restrained', proseStyle: 'precise sensory detail', chapterFormat: 'location dateline',
    dialogueConventions: 'Use Chinese quotation marks.', forbidden: ['suddenly'],
  },
  forbidden: ['suddenly'],
};
const mira = {
  id: 'mira', version: 1, name: 'Mira', aliases: [], kind: 'pov',
  personality: 'guarded', background: 'searches for {{user}}', motivation: 'lift the harbor curse',
  goals: [], flaws: [], abilities: [], speechStyle: 'clipped', staticTraits: [],
  arc: { startingPoint: 'dockhand', desiredEnd: 'harbormaster', keyBeats: [] },
  relationships: [], knowledgeIds: [],
};
const harborHit = {
  entry: {
    id: 'harbor', version: 1, kind: 'geography', title: 'Harbor of Silent Teeth',
    content: 'a fog-bound anchorage that never echoes', keywords: ['harbor', 'fog'],
    triggerMode: 'constant', weight: 1, parent: null, mutable: false, status: 'active', supersededBy: null,
  },
  entryId: 'harbor', ancestors: [], level: 0,
};
const state = {
  id: 'state-1', version: 1, seq: 0, storyTime: 'dusk',
  scene: { location: 'Harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' },
  characters: [{
    characterId: 'mira', location: 'deck', alive: true, health: 'ok', mood: 'wary',
    inventory: ['lantern'], condition: 'dry', currentGoal: 'find the ship',
    flags: { wanted: true, alias: 'Ghost' },
  }],
};

const miraView = { character: mira, name: mira.name, kind: mira.kind, pov: mira.kind === 'pov' };
const assemble = (sources) => registerContextSerializers(new ContextAssembler()).assemble({
  macros: { user: 'Lin', pov: 'Mira' },
  sources: {
    rules: [{ rule, scope: rule.scope, priority: rule.priority, immutable: rule.immutable }],
    style,
    characters: [],
    worldview: [],
    state,
    ...sources,
  },
});

const withAll = { characters: [miraView], worldview: [harborHit] };
const first = assemble(withAll);
const second = assemble(withAll);
if (first.prompt !== second.prompt) throw new Error('I13 context assembly was not byte-stable');

const idx = (heading) => first.prompt.indexOf(`## ${heading}`);
for (const heading of ['Rules', 'Style', 'Characters', 'Worldview', 'State']) {
  if (idx(heading) < 0) throw new Error(`Missing section: ${heading}`);
}
if (!(idx('Rules') < idx('Style') && idx('Style') < idx('Characters') && idx('Characters') < idx('Worldview') && idx('Worldview') < idx('State'))) {
  throw new Error('Fixed five-section order was not preserved');
}

if (!first.prompt.includes('searches for Lin') || !first.prompt.includes('Mira must honor the law named by Lin.')) {
  throw new Error('Macros were not expanded into B1/B3 sections');
}
if (!first.prompt.includes('flags: { alias: Ghost, wanted: true }')) throw new Error('State flags were not key-sorted');
if (!first.prompt.includes('seq: 0') || !first.prompt.includes('location: Harbor')) throw new Error('Structured state fields missing');

const big = { ...mira, background: 'x'.repeat(12_000) };
const bigView = { character: big, name: big.name, kind: big.kind, pov: big.kind === 'pov' };
const truncated = assemble({ characters: [bigView] });
if (!truncated.prompt.includes(contextTruncationMarker)) throw new Error('Over-budget section was not marked');
if (truncated.prompt !== assemble({ characters: [bigView] }).prompt) throw new Error('Truncation was not deterministic');
if (!truncated.sections.find((section) => section.id === 'characters').truncated) {
  throw new Error('Characters section truncation flag is missing');
}

let rejected = false;
try {
  assemble({ characters: [{ character: mira, name: 'Wrong', kind: mira.kind, pov: false }] });
} catch {
  rejected = true;
}
if (!rejected) throw new Error('Invalid character view was accepted');

if (!Object.isFrozen(contextSectionOrder)) throw new Error('Fixed section order is mutable');

console.log('I13 smoke: five-section assembly, trigger/character injection, structured state, deterministic truncation, and fail-closed validation passed');
