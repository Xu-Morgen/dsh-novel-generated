import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { KnowledgeRepository } from '../../core/knowledge/index.js';
import { StyleRepository } from '../../core/style/index.js';
import { LLM_BACKEND_MARKER, type GenerationRequest } from '../../llm/port/index.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createDesktopProjectHandlers } from './project-handlers.js';

it('I192 starts the queue through desktop composition', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-writing-ui-'));
  const disposers: Array<() => void> = [];
  try {
    const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, {
      llm: { [LLM_BACKEND_MARKER]: true, async *stream(request: GenerationRequest) {
        yield { text: request.prompt.includes('检测器') ? '{"violations":[]}' : request.prompt.includes('解析器') ? '{"ops":[]}' : '米拉在北港找到了钥匙。' };
        yield { done: true };
      } },
      resolveGenerationSettings: async () => ({ modelRef: 'test/model', credentialRef: 'test/managed' }),
      onDispose: (dispose) => disposers.push(dispose),
    });
    const call = (method: string, ...args: unknown[]) => handlers.get(`novel-creation-tool/${method}`)!(...args) as Promise<any>;
    await call('novelWorkspace/projectCreate', { projectId: 'ui', name: '北港' });
    await call('novelWorkspace/projectOpen', 'ui');
    const knowledge = new KnowledgeRepository(join(root, 'library', 'ui'));
    await knowledge.open();
    await knowledge.saveAll([], [{ characterId: 'mira', knows: [] }]);
    const style = new StyleRepository(join(root, 'library', 'ui'));
    await style.open();
    await style.save({ id: 'style', name: '克制', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] });
    await call('novelWorkspace/outlineSave','ui',{id:'outline',structure:'free',logline:'北港',themes:[],acts:[{id:'act',index:0,title:'雨夜',goal:'寻找',beats:[{id:'beat',title:'码头',description:'寻找',charactersInvolved:['mira'],conflictType:'external',prerequisites:[],optional:false,detailBeats:[{id:'detail',title:'钥匙',summary:'寻找',pov:'mira',wordTarget:100,points:[],status:'planned'}]}]}],foreshadowing:[],endings:[]});
    await writeFile(join(root,'library','ui','outline-progress.yaml'),JSON.stringify({outlineId:'outline',currentAct:'act',currentBeat:'beat',completedBeats:[],deviations:[],tensionLevel:0}));
    const {fingerprint}=await call('novelText/fingerprint','ui');
    await call('novelText/chapterCreate','ui',{id:'chapter',index:1,title:'雨夜',pov:'mira',status:'draft',expectedFingerprint:fingerprint});
    expect(await call('novelQueue/startAt','ui',{chapterId:'chapter',cardIds:['detail']})).toMatchObject({projectId:'ui',runState:'running'});
    let status = await call('novelQueue/status','ui');
    while (status.runState === 'running') {
      await new Promise(resolve => setTimeout(resolve, 20));
      status = await call('novelQueue/status','ui');
    }
    expect(status.tasks[0].status).toBe('candidate-ready');
    expect(await call('novelWriting/preview',status.tasks[0].candidateId)).toMatchObject({text:'米拉在北港找到了钥匙。'});
    // Recovered queue candidates have no generation baseline: preserve the existing structural rejection.
    await expect(call('novelWriting/previewLayers',status.tasks[0].candidateId)).rejects.toThrow('requires');
    expect(await call('novelWriting/adoptDraft',status.tasks[0].candidateId)).toMatchObject({status:'adopted',chapterId:'chapter'});
    await expect(call('novelWriting/preview','missing')).rejects.toThrow();

  } finally { disposers.forEach(dispose => dispose()); await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); }
});
