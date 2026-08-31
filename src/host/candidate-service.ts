import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  hashText,
  parseWritingCandidate,
  validateCandidateTarget,
  type PolishMode,
  type CandidateTarget,
  type WritingCandidate,
  type WritingIntent,
} from '../core/candidate/index.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import { assembleStoryContext, type StoryGenerationSources } from '../core/pipeline/index.js';
import { ContextAssembler } from '../core/assemble/index.js';
import { registerContextSerializers } from '../core/assemble/serializers.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import { createGenerationService } from './generation-service.js';
import type { GenerationSettings } from '../llm/port/index.js';
import { buildChapterWritingPrompt } from '../write/chapter.js';
import { assertCompleteProse } from '../write/chapter.js';
import { buildContinuationPrompt } from '../write/continuation.js';

/** I62 四种意图的候选请求：同一 Host 命令，只产生候选、绝不落地任何层（R13-3）。 */
interface CandidateRequestBase {
  readonly id: string;
  readonly target: CandidateTarget;
  readonly settings: GenerationSettings;
  readonly signal?: AbortSignal;
}

/** 生成（I19）：纯上下文生成，只绑定 projectId，无场景卡/续写约束。 */
export interface GenerateCandidateRequest extends CandidateRequestBase {
  readonly intent: 'generate';
  readonly sources: StoryGenerationSources;
}

/** 续写（I44）：承接当前正文/细纲，目标为新场景（sceneId 由调用方给定）。 */
export interface ContinueCandidateRequest extends CandidateRequestBase {
  readonly intent: 'continue';
  readonly sources: StoryGenerationSources;
  readonly card: DetailBeat;
  readonly navigation: OutlineNavigation;
}

/** 按场景卡写作（I43）：只消费场景卡 + 大纲导航，目标为新场景。 */
export interface SceneCardCandidateRequest extends CandidateRequestBase {
  readonly intent: 'scene-card';
  readonly card: DetailBeat;
  readonly navigation: OutlineNavigation;
}

/** 局部重写（I42）：必须绑定已有场景 + 源正文哈希；重写指令由调用方提供（同 I42 语义）。 */
export interface RewriteCandidateRequest extends CandidateRequestBase {
  readonly intent: 'rewrite';
  readonly prompt: string;
  /** I122 parameter selector; I123 supplies the mode-specific prompt preset. */
  readonly polishMode?: PolishMode;
}

export type WritingCandidateRequest =
  | GenerateCandidateRequest
  | ContinueCandidateRequest
  | SceneCardCandidateRequest
  | RewriteCandidateRequest;

export interface WritingCandidateResult {
  readonly candidate: WritingCandidate;
}

export interface NovelWritingCandidateService {
  open(projectId: string): Promise<void>;
  /**
   * 产生一个绑定 project/chapter/scene/sourceHash 的写作候选。
   *
   * 语义与不变式：
   * - 四种 intent 共用同一入口；`validateCandidateTarget` 先冻结绑定约束。
   * - rewrite 落地前必须核对 `sourceHash` 与当前场景正文一致（脏文本保护），
   *   错绑定（非法 id / 未知场景 / 哈希不匹配）零写拒绝。
   * - prompt 构建只复用既有能力：generate/continue 走 I19 `assembleStoryContext`，
   *   continue 追加 I44 `buildContinuationPrompt`，scene-card 走 I43
   *   `buildChapterWritingPrompt`，rewrite 沿用 I42 的调用方 prompt 语义；不复制
   *   任何既有 prompt 文本。
   * - 取消（AbortSignal）抛 `GenerationError('cancelled')`，模型失败抛
   *   `GenerationError('backend'|'unavailable')`，非法输出（空文本）抛错——三者
   *   一律零写：本服务只读 C5 验证绑定，从不调用任何层 writer。
   * - 候选生成后正文变化的过期语义由 `core/candidate.assertCandidateFresh` 裁决
   *   （I63 消费），本服务不持有、不持久化候选（I65 队列 owner）。
   */
  propose(request: WritingCandidateRequest): Promise<WritingCandidateResult>;
}

export interface WritingCandidateServiceDeps {
  readonly llm: unknown;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
}

/**
 * I62 Host 候选服务 owner（design §14.9 / R13-3）。
 *
 * 复用而不复制：`createGenerationService`（I17）负责 ctx.llm 流式收集与
 * 取消/错误传播；`ContextAssembler` + `registerContextSerializers`（I19）负责
 * generate/continue 的上下文组装；I43/I44 的 prompt builder 原样复用；
 * rewrite 与 I42 `NovelLocalizedEditService.rewrite` 同一「调用方提供 prompt」语义。
 * 本模块不新增第二套解析、校验或写入路径（R2-7）。
 */
export function createWritingCandidateService(deps: WritingCandidateServiceDeps): NovelWritingCandidateService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const generation = createGenerationService(deps.llm, deps.onDispose);
  const assembler = registerContextSerializers(new ContextAssembler());
  const opened = new Set<string>();
  const repositories = new Map<string, TextRepository>();

  const ensureOpen = async (projectId: string): Promise<TextRepository> => {
    validateProjectId(projectId);
    let repository = repositories.get(projectId);
    if (repository === undefined) {
      repository = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
      opened.add(projectId);
    }
    return repository;
  };

  /** 绑定校验：rewrite 必须命中已存在场景且 sourceHash 与当前正文一致（零写）。 */
  const assertRewriteTarget = async (
    repository: TextRepository,
    target: CandidateTarget,
  ): Promise<void> => {
    const chapterId = target.chapterId as string;
    const sceneId = target.sceneId as string;
    const chapter = await repository.readChapter(chapterId);
    const scene = chapter.scenes.find((item) => item.id === sceneId);
    if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
    if (hashText(scene.content) !== target.sourceHash) {
      throw new Error(`源正文已变化（脏文本保护）：请刷新 ${chapterId}/${sceneId} 后重新生成候选`);
    }
  };

  /** intent adapter：按意图构建生成 prompt，全部复用既有能力。 */
  const buildPrompt = (request: WritingCandidateRequest): string => {
    switch (request.intent) {
      case 'generate':
        return assembleStoryContext(assembler, request.sources).prompt;
      case 'continue': {
        const context = assembleStoryContext(assembler, request.sources);
        return buildContinuationPrompt(context, request.card, request.navigation);
      }
      case 'scene-card':
        return buildChapterWritingPrompt(request.card, request.navigation);
      case 'rewrite': {
        if (!request.prompt.trim()) throw new Error('Rewrite candidate requires a non-empty prompt');
        return request.polishMode === undefined
          ? request.prompt
          : `[polishMode:${request.polishMode}]\n${request.prompt}`;
      }
    }
  };

  return Object.freeze({
    async open(projectId: string) {
      await ensureOpen(projectId);
    },
    async propose(request: WritingCandidateRequest) {
      // 1. 冻结绑定约束（contract 层）：非法 intent/target 零写失败。
      validateCandidateTarget(request.intent, request.target);
      // 2. 打开项目（只读仓库；打开本身只建目录，不写任何层）。
      const repository = await ensureOpen(request.target.projectId);
      // 3. rewrite 的源正文绑定核对（未知场景 / 哈希不匹配零写）。
      if (request.intent === 'rewrite') await assertRewriteTarget(repository, request.target);
      // 4. prompt 构建（复用 I19/I43/I44；rewrite 复用 I42 调用方 prompt 语义）。
      const prompt = buildPrompt(request);
      // 5. 生成（复用 I17：取消/backend 错误传播，零写）。
      const generated = await generation.generate(prompt, request.settings, request.signal);
      // 6. 非法输出（空正文）零写拒绝（复用 I43 的完整性断言）。
      assertCompleteProse(generated.text);
      // 7. 冻结候选并返回；不持久化（I65 队列 owner）。
      const candidate = parseWritingCandidate({
        id: request.id,
        intent: request.intent,
        target: { ...request.target },
        prompt,
        text: generated.text,
        chunkCount: generated.chunks,
        createdAt: new Date().toISOString(),
      });
      return Object.freeze({ candidate });
    },
  });
}

export type { WritingIntent };
