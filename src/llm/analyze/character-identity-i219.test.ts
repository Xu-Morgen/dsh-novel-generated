import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assertDistinctProtagonist, DuplicateProtagonistError } from '../../core/characters/identity.js';
import { classifyNarrativeAdaptation, buildNarrativeAdaptationPrompt } from './narrative-adaptation.js';
import { narrativeAdaptationInputSchema, narrativeAdaptationOutputSchema } from '../../core/schema/narrative-adaptation.js';
import { LLM_BACKEND_MARKER } from '../port/index.js';

it('I219 frozen identity corpus rejects ambiguity without conflating different names', () => {
  const corpus = JSON.parse(readFileSync('samples/character-identity-i219.json','utf8'));
  for (const split of ['dev','held-out']) {
    const cases = corpus.cases.filter((item: {split:string})=>item.split===split);
    let passed=0;
    for(const sample of cases){
      let duplicate=false;
      try { assertDistinctProtagonist({id:'new',name:sample.candidate},[{id:'old',name:sample.existing}]); } catch(cause) { expect(cause).toBeInstanceOf(DuplicateProtagonistError);duplicate=true; }
      if(duplicate===sample.duplicate)passed++;
    }
    expect(passed/cases.length).toBeGreaterThanOrEqual(corpus.threshold);
  }
  expect(()=>assertDistinctProtagonist({id:'new',name:'调查员'},[{id:'old',name:'林舟',aliases:['调查员']}])).toThrow(DuplicateProtagonistError);
  expect(()=>assertDistinctProtagonist({id:'same',name:'调查员'},[{id:'same',name:'调查员'}])).not.toThrow();
});

it('I219 one-call duplicate failure then explicit reuse preserves the existing identity', async () => {
  const sample=JSON.parse(readFileSync('samples/i200/cases.json','utf8'));
  const input=narrativeAdaptationInputSchema.parse(sample.input);
  const output=narrativeAdaptationOutputSchema.parse(sample.output);
  const id=input.narrativeIntent.protagonistCandidateId!;
  output.protagonistCandidate!.name='调查员';
  let calls=0;
  const backend={ [LLM_BACKEND_MARKER]:true as const,async *stream(){calls++;yield JSON.stringify(output);} };
  const settings={modelRef:'test/model',credentialRef:'test/key'};
  await expect(classifyNarrativeAdaptation(backend,input,settings,undefined,{characters:[{id:'old',name:'调查员'}]})).rejects.toThrow(DuplicateProtagonistError);
  expect(calls).toBe(1);
  input.narrativeIntent.protagonistId=id;delete input.narrativeIntent.protagonistCandidateId;delete output.protagonistCandidate;
  const result=await classifyNarrativeAdaptation(backend,input,settings,undefined,{characters:[{id,name:'调查员'}]});
  expect(result.protagonistCandidate).toBeUndefined();expect(calls).toBe(2);
  expect(buildNarrativeAdaptationPrompt(input)).not.toContain('素材中尚无可绑定主角');
});
