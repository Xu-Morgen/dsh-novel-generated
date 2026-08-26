import type { Chapter, Scene } from '../schema/text.js';

/**
 * I60 C5 只读投影（design §5.12 / R13-1）。
 *
 * 这是 C5 层对外暴露「最小 owned JSON」的单一契约：Client 只允许读取本章定义的
 * 投影字段，绝不接触 TextRepository 内部、文件路径或未参与投影的 live 对象。
 *
 * 契约与不变式：
 * - `ChapterListItem` 只含章节元数据与 sceneCount，不含任何正文 content；
 *   它服务「章节树」导航，避免一次把整部作品正文拉进 Client。
 * - `ChapterReadResult` 只含章节元数据 + 场景摘要（id/index/summary），不含
 *   content —— 正文逐场景经 `SceneReadResult` 读取（最小读取合同）。
 * - `SceneReadResult` 是唯一携带 `content` 的投影，且必须带所在 chapter 上下文
 *   引用（id/index/title/pov），保证跨项目/跨章场景引用可追溯到宿主真相。
 * - `projectChapterList` 按章节 `index` 升序（文件名字典序不代表叙事顺序），
 *   index 相同按 id 字典序，保证「多章顺序」稳定且可重开复现。
 * - 投影函数是纯函数：输入必须是已通过 `chapterSchema` 校验的 Chapter/Scene。
 */
export interface ChapterListItem {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly pov: string;
  readonly status: Chapter['status'];
  readonly sceneCount: number;
}

export interface SceneSummaryItem {
  readonly id: string;
  readonly index: number;
  readonly summary: string;
}

export interface ChapterReadResult {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly pov: string;
  readonly status: Chapter['status'];
  readonly scenes: readonly SceneSummaryItem[];
}

export interface SceneReadResult {
  readonly chapter: { readonly id: string; readonly index: number; readonly title: string; readonly pov: string };
  readonly scene: {
    readonly id: string;
    readonly index: number;
    readonly summary: string;
    readonly content: string;
    readonly beats: readonly string[];
    readonly canonEvents: readonly string[];
    readonly notes: string;
  };
}

/** 章节 → 章节树列表项（元数据 + 场景数，无正文）。 */
export function toChapterListItem(chapter: Chapter): ChapterListItem {
  return Object.freeze({
    id: chapter.id,
    index: chapter.index,
    title: chapter.title,
    pov: chapter.pov,
    status: chapter.status,
    sceneCount: chapter.scenes.length,
  });
}

/** 场景 → 场景摘要（无正文；正文只经 sceneRead 投影）。 */
export function toSceneSummary(scene: Scene): SceneSummaryItem {
  return Object.freeze({ id: scene.id, index: scene.index, summary: scene.summary });
}

/** 章节列表 → 章节树（按 index 升序；多章顺序契约）。 */
export function projectChapterList(chapters: readonly Chapter[]): ChapterListItem[] {
  return chapters
    .map(toChapterListItem)
    .sort((a, b) => a.index - b.index || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** 章节 → 章节读取（元数据 + 场景摘要，无正文）。 */
export function toChapterReadResult(chapter: Chapter): ChapterReadResult {
  return Object.freeze({
    id: chapter.id,
    index: chapter.index,
    title: chapter.title,
    pov: chapter.pov,
    status: chapter.status,
    scenes: Object.freeze(chapter.scenes.map(toSceneSummary)),
  });
}

/** 场景 → 场景读取（唯一携带正文的投影；带 chapter 上下文引用）。 */
export function toSceneReadResult(chapter: Chapter, scene: Scene): SceneReadResult {
  return Object.freeze({
    chapter: Object.freeze({ id: chapter.id, index: chapter.index, title: chapter.title, pov: chapter.pov }),
    scene: Object.freeze({
      id: scene.id,
      index: scene.index,
      summary: scene.summary,
      content: scene.content,
      beats: Object.freeze([...scene.beats]),
      canonEvents: Object.freeze([...scene.canonEvents]),
      notes: scene.notes,
    }),
  });
}
