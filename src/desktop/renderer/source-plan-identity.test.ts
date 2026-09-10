import { expect, it } from 'vitest';
import { sourceIntentMatchesPlan } from './source-plan-panel.js';
import { automaticProtagonistCandidateId } from '../../client/import-interpretation-review.js';
import type { NarrativeImportPlan } from '../../core/schema/narrative-import-plan.js';

it('I219 persisted final preview accepts only placeholder resolution and rejects changed POV/knowledge', () => {
  const sourceHash='a'.repeat(64);
  const source={pov:'limited' as const,protagonistCandidateId:automaticProtagonistCandidateId(sourceHash),initialKnown:[],revealPacing:'balanced' as const};
  const plan={sourceHash,narrativeIntent:{pov:'limited',protagonistId:'mira',initialKnown:[],revealPacing:'balanced'},package:{characters:{candidates:[{id:'mira'}]},outline:{}}} as unknown as NarrativeImportPlan;
  expect(sourceIntentMatchesPlan(source,plan)).toBe(true);
  expect(sourceIntentMatchesPlan({...source,initialKnown:['secret']},plan)).toBe(false);
  expect(sourceIntentMatchesPlan({...source,pov:'omniscient'},plan)).toBe(false);
  expect(sourceIntentMatchesPlan({...source,protagonistCandidateId:'different'},plan)).toBe(false);
  const missing=structuredClone(plan);missing.package.characters.candidates=[];
  expect(sourceIntentMatchesPlan(source,missing)).toBe(false);
});
