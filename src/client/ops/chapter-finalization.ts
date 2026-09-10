import type { ChaptersEditOps, ChapterManuscriptState } from '../layers/chapters.js';
import type { OpsRuntime, OpsPorts } from './context.js';
import type { ChaptersInternal } from './chapters-internal.js';
import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';

/** I217 chapter-scoped projection updates discard late results after navigation. */
export function createChapterFinalizationOps(runtime: OpsRuntime, ports: Pick<OpsPorts, 'workspace'>, internal: ChaptersInternal): Pick<ChaptersEditOps, 'analyzeChapter' | 'finalizeChapter' | 'nextChapter'> {
  const { act, snapshot, projectId, isActive, beginOp, endOp } = runtime;
  const { selectedChapterId: chapterId, navigationRevision: revision, manuscript } = snapshot.chapters;
  const patch = (value: Partial<ChapterManuscriptState>) => { if (isActive() && chapterId) act.chapterManuscript(chapterId, revision, value); };
  return {
    analyzeChapter() {
      if (!ports.workspace || !projectId || !chapterId || snapshot.chapters.editor.dirty || !beginOp('chapter:analyze')) return;
      patch({ status: 'analyzing', analysis: undefined, result: undefined, message: '正在分析本章所有已保存正文…' });
      const workspace = ports.workspace;
      void unwrap(workspace.chapterAnalyze({ projectId, chapterId })).then(async analysis => {
        const read = await unwrap(workspace.chapterManuscript({ projectId, chapterId }));
        if (read.sourceHash !== analysis.sourceHash) {
          await unwrap(workspace.chapterFinalize({ projectId, proposalId: analysis.proposalId, accept: false }));
          patch({ status: 'error', read, message: '分析后正文已变化，请重新分析。' });
          return;
        }
        patch({ status: 'pending', read, analysis, message: '请审阅本章同步范围，再确认定稿。' });
      }).catch((cause: Error) => patch({ status: 'error', message: toUserMessage(cause) })).finally(() => endOp('chapter:analyze'));
    },
    finalizeChapter(accept) {
      if (!ports.workspace || !projectId || !chapterId || !manuscript?.analysis || !beginOp('chapter:finalize')) return;
      patch({ status: 'applying', message: accept ? '正在同步本章故事状态…' : '正在取消…' });
      void unwrap(ports.workspace.chapterFinalize({ projectId, proposalId: manuscript.analysis.proposalId, accept })).then(result => {
        patch({ status: result.status === 'done' ? 'done' : result.status === 'partial-failure' ? 'partial-failure' : result.status === 'stale' ? 'error' : 'ready',
          analysis: result.status === 'rejected' || result.status === 'stale' ? undefined : manuscript.analysis, result, message: result.message });
      }, (cause: Error) => patch({ status: 'partial-failure', message: toUserMessage(cause) })).finally(() => endOp('chapter:finalize'));
    },
    nextChapter() {
      if (manuscript?.result?.status !== 'done') return;
      if (manuscript.result.nextChapterId) internal.selectChapter(manuscript.result.nextChapterId);
      else {
        act.chaptersMode('materials');
        act.chaptersManagement({ status: 'idle', message: '本章已定稿。请填写下一章标题与视角角色，再点击“新建章节”。',
          chapterDraft: { ...snapshot.chapters.management.chapterDraft, id: '', title: '', index: Math.max(0, ...snapshot.chapters.list.map(item => item.index)) + 1, status: 'draft' } });
      }
    },
  };
}
