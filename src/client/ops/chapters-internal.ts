/**
 * I95 chapters ops 跨片晚绑定内部接口（计划 §18 I95：ops/chapters 拆分后，
 * editor/branch/candidate 三片互相引用的内部函数经本接口接线，组合根
 * createChaptersOps 负责赋值；避免循环 import）。
 */
export interface ChaptersInternal {
  loadScene(sceneId: string, chapterId: string): void;
  branchesLoad(chapterId?: string, sceneId?: string): void;
  selectChapter(chapterId: string): void;
}
