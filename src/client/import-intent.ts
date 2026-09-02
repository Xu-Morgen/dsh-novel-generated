/**
 * I141 Client projection: the form may display these values, but canonical
 * parsing/resolution remains Host-owned. No Client default is allowed because
 * author confirmation is part of the source binding contract.
 */
import type {
  ImportSourceBinding,
  ImportSourceRole,
  ImportTreatment,
  NarrativeIntent,
  NarrativePov,
  RevealPacing,
} from '../core/schema/import-interpretation.js';

export type { ImportSourceBinding, ImportSourceRole, ImportTreatment, NarrativeIntent, NarrativePov, RevealPacing };

export const IMPORT_SOURCE_ROLES: readonly { id: ImportSourceRole; label: string }[] = [
  { id: 'idea', label: '创作想法' },
  { id: 'synopsis', label: '故事梗概/计划' },
  { id: 'background-material', label: '背景/幕后资料' },
  { id: 'existing-prose', label: '已有正文' },
  { id: 'hybrid', label: '混合文档' },
];

export const IMPORT_TREATMENTS: readonly { id: ImportTreatment; label: string }[] = [
  { id: 'expand-outline', label: '扩展为大纲' },
  { id: 'adapt-pov', label: '按视角重构读者体验' },
];

export const NARRATIVE_POVS: readonly { id: NarrativePov; label: string }[] = [
  { id: 'limited', label: '限知视角' },
  { id: 'omniscient', label: '全知视角' },
];

export const REVEAL_PACINGS: readonly { id: RevealPacing; label: string }[] = [
  { id: 'slow', label: '渐进揭示' },
  { id: 'balanced', label: '均衡揭示' },
  { id: 'fast', label: '快速揭示' },
];
