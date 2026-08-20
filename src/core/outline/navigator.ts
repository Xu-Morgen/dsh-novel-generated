import type { Outline, Beat } from '../schema/outline.js';
import type { OutlineNavigation, OutlineProgress } from '../schema/outline-progress.js';

/**
 * Deterministic C6 navigator (design §6.3). It emits a navigational hint only;
 * it never changes B5 or implicitly advances C6 progress.
 */
export class OutlineNavigator {
  navigate(outline: Outline, progress: OutlineProgress): OutlineNavigation {
    const beats = flattenBeats(outline);
    const current = beats.find(({ beat }) => beat.id === progress.currentBeat);
    if (!current || current.act.id !== progress.currentAct) throw new Error(`Unknown current beat: ${progress.currentBeat}`);
    const completed = new Set(progress.completedBeats);
    const target = findNextBeat(outline, completed) ?? current;
    const prerequisitesMet = target.beat.prerequisites.every((id) => completed.has(id));
    const prerequisiteText = target.beat.prerequisites.length === 0
      ? '无前置条件。'
      : prerequisitesMet
        ? '前置条件已满足。'
        : `前置条件未满足：${target.beat.prerequisites.filter((id) => !completed.has(id)).join('、')}。`;
    const instruction = `[当前剧情目标] ${target.beat.description}（Beat: "${target.beat.title}"），${prerequisiteText}`;
    return {
      actId: target.act.id,
      beatId: target.beat.id,
      title: target.beat.title,
      description: target.beat.description,
      prerequisites: [...target.beat.prerequisites],
      prerequisitesMet,
      instruction,
      deviationIds: progress.deviations.filter((deviation) => !deviation.reconciled).map((deviation) => deviation.id),
    };
  }
}

interface BeatLocation { act: Outline['acts'][number]; beat: Beat }
function flattenBeats(outline: Outline): BeatLocation[] {
  return outline.acts
    .slice()
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))
    .flatMap((act) => act.beats.slice().sort((a, b) => a.id.localeCompare(b.id)).map((beat) => ({ act, beat })));
}

function findNextBeat(outline: Outline, completed: Set<string>): BeatLocation | undefined {
  return flattenBeats(outline).find(({ beat }) => !completed.has(beat.id) && !beat.optional && beat.prerequisites.every((id) => completed.has(id)))
    ?? flattenBeats(outline).find(({ beat }) => !completed.has(beat.id) && beat.prerequisites.every((id) => completed.has(id)));
}
