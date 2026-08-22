import { homedir } from 'node:os';
import { join } from 'node:path';
import { fingerprintEdit, type EditFingerprint, type EditRange } from '../core/edit/index.js';
import type { Scene } from '../core/schema/text.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import { createGenerationService } from './generation-service.js';
import type { GenerationCandidate, GenerationSettings } from '../llm/port/index.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import { ConfirmationGate } from '../core/confirm/index.js';

export interface LocalizedEditResult { readonly scene: Scene; readonly evidence: EditFingerprint; }
export interface RewriteResult { readonly candidate: GenerationCandidate; readonly applied: boolean; readonly original: string; readonly scene?: Scene; }
export interface ReparseRequest {
  readonly id: string; readonly projectId: string; readonly chapterId: string; readonly sceneId: string; readonly range: EditRange; readonly replacement: string;
  readonly parsers: { readonly c2: () => Promise<unknown>; readonly c1: () => Promise<unknown>; readonly c3: () => Promise<unknown>; readonly c4: () => Promise<unknown>; readonly b2: () => Promise<unknown> };
  readonly writers: { readonly c2: (output: unknown) => Promise<void>; readonly c1: (output: unknown) => Promise<void>; readonly c3: (output: unknown) => Promise<void>; readonly c4: (output: unknown) => Promise<void>; readonly b2: (output: unknown) => Promise<void> };
}
export interface NovelLocalizedEditService {
  open(projectId: string): Promise<void>;
  edit(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string): Promise<LocalizedEditResult>;
  rewrite(projectId: string, chapterId: string, sceneId: string, range: EditRange, prompt: string, settings: GenerationSettings, decision: 'accept' | 'reject', signal?: AbortSignal): Promise<RewriteResult>;
  proposeReparse(request: ReparseRequest): Promise<ConfirmationRecord>;
  applyAcceptedReparse(request: ReparseRequest): Promise<{ readonly status: 'written'; readonly scene: Scene; readonly outputs: Readonly<Record<'c2' | 'c1' | 'c3' | 'c4' | 'b2', unknown>> }>;
}

/** I42 Host owner: C5 remains the only text writer; reparsing is explicit Gate-first fan-out (§9, R9-2). */
export function createLocalizedEditService(llm: unknown, projectsRoot = join(homedir(), '.dsh', 'novel-projects'), onDispose?: (dispose: () => void) => void): NovelLocalizedEditService {
  const repositories = new Map<string, TextRepository>();
  const generation = createGenerationService(llm, onDispose);
  const gates = new Map<string, ConfirmationGate>();
  const get = (projectId: string) => { validateProjectId(projectId); const repository = repositories.get(projectId); if (!repository) throw new Error(`Edit project is not open: ${projectId}`); return repository; };
  const gate = async (projectId: string) => { let value = gates.get(projectId); if (!value) { value = await ConfirmationGate.open(projectDirectory(projectsRoot, projectId)); gates.set(projectId, value); } return value; };
  const service: NovelLocalizedEditService = {
    async open(projectId) { validateProjectId(projectId); const repository = new TextRepository(projectDirectory(projectsRoot, projectId)); await repository.open(); repositories.set(projectId, repository); await gate(projectId); },
    async edit(projectId, chapterId, sceneId, range, replacement) {
      const repository = get(projectId); const chapter = await repository.readChapter(chapterId); const original = chapter.scenes.find((scene) => scene.id === sceneId)?.content;
      if (original === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      const evidence = fingerprintEdit(original, range, replacement); const scene = await repository.replaceRange(chapterId, sceneId, range, replacement); return Object.freeze({ scene, evidence });
    },
    async rewrite(projectId, chapterId, sceneId, range, prompt, settings, decision, signal) {
      const repository = get(projectId); const chapter = await repository.readChapter(chapterId); const original = chapter.scenes.find((scene) => scene.id === sceneId)?.content;
      if (original === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      const candidate = await generation.generate(prompt, settings, signal);
      if (decision !== 'accept') return Object.freeze({ candidate, applied: false, original });
      const scene = await repository.replaceRange(chapterId, sceneId, range, candidate.text); return Object.freeze({ candidate, applied: true, original, scene });
    },
    async proposeReparse(request) {
      const repository = get(request.projectId); const chapter = await repository.readChapter(request.chapterId); const original = chapter.scenes.find((scene) => scene.id === request.sceneId)?.content;
      if (original === undefined) throw new Error(`Unknown scene: ${request.sceneId}`);
      const evidence = fingerprintEdit(original, request.range, request.replacement);
      return (await gate(request.projectId)).propose({ id: request.id, kind: 'localized-reparse', payload: { chapterId: request.chapterId, sceneId: request.sceneId, range: request.range, replacement: request.replacement, before: evidence.before, after: evidence.after } });
    },
    async applyAcceptedReparse(request) {
      const repository = get(request.projectId); const confirmation = (await gate(request.projectId)).get(request.id); if (confirmation.status !== 'accepted') throw new Error(`Reparse requires accepted ConfirmationGate: ${request.id}`);
      const [c2, c1, c3, c4, b2] = await Promise.all([request.parsers.c2(), request.parsers.c1(), request.parsers.c3(), request.parsers.c4(), request.parsers.b2()]);
      const outputs = Object.freeze({ c2, c1, c3, c4, b2 });
      await request.writers.c2(c2); await request.writers.c1(c1); await request.writers.c3(c3); await request.writers.c4(c4); await request.writers.b2(b2);
      const scene = await repository.replaceRange(request.chapterId, request.sceneId, request.range, request.replacement); return Object.freeze({ status: 'written' as const, scene, outputs });
    },
  };
  return Object.freeze(service);
}
