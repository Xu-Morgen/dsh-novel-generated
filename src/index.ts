import type { Context } from '@deepseek-ai/cordis';

import { createCanonService } from './host/canon-service.js';
import { createCharacterService } from './host/character-service.js';
import { createConfirmationService } from './host/confirmation-service.js';
import { createProjectService } from './host/project-service.js';
import { createRuleService } from './host/rule-service.js';
import { createStateService } from './host/state-service.js';
import { createStyleService } from './host/style-service.js';
import { createTextService } from './host/text-service.js';
import { createWorldviewService } from './host/worldview-service.js';
import { createOutlineService } from './host/outline-service.js';
import { createRelationshipService } from './host/relationship-service.js';
import { createKnowledgeService } from './host/knowledge-service.js';
import { createGenerationService } from './host/generation-service.js';
import { createStoryGenerationService } from './host/story-generation-service.js';
import { createSettingsService } from './host/settings-service.js';
import { createStoryLifecycleService } from './host/story-lifecycle-service.js';
import { createConsistencyDetectionService } from './host/consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from './host/knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from './host/relationship-style-detection-service.js';
import { createStateParserService } from './host/state-parser-service.js';
import { createRelationshipParserService } from './host/relationship-parser-service.js';
import { createKnowledgeParserService } from './host/knowledge-parser-service.js';
import { createWorldviewParserService } from './host/worldview-parser-service.js';
import { createExtensionService } from './host/extension-service.js';
import { NOVEL_PROBE_NAMESPACE, probeContribution, probeData, NOVEL_WORKSPACE_NAMESPACE, workspaceContribution, workspaceViewModel } from './remote.js';

/**
 * I1 Host plugin extended by I2 (design §0.1.3 I2): proves the ordinary
 * out-of-tree Cordis package contract with a Host service, and now also
 * registers the gate-only public Remote probe.
 *
 * - `novelCreation` (I1): minimal read-only status service, removed on dispose.
 * - `novelProject` (I3) / `novelState` (I4) / `novelCanon` (I5): Host facades over
 *   the project, C2 state, and C4 canon stores respectively.
 * - `novelText` (I6): Host facade over controlled C5 chapter/scene text storage.
 * - `novelRule` (I7): Host facade over the B1 hard-constraint rule store.
 * - `novelWorldview` (I8): Host facade over the B2 worldview (WorldEntry) store.
 * - `novelCharacter` (I9): Host facade over the B3 character-core (CharacterCore)
 *   store, explicitly separated from the C2 mutable state layer (R1-B3).
 * - `novelStyle` (I10): Host facade over the one global B4 StyleProfile,
 *   including independently queryable forbidden expressions (R1-B4).
 * - `novelConfirmation` (I11): Host facade over the persistent, idempotent
 *   proposal→accept/reject gate shared by all later user-confirmed writes.
 * - `novelOutline` (I14/I15): Host facade over B5 outline/detail-beat storage and
 *   C6 progress/navigation; C6 never rewrites the B5 source.
 * - `novelKnowledge` (I18): Host facade over the C3 knowledge store and POV filter;
 *   C3 never derives visibility from C1 relationship publicity.
 * - `novelGeneration` (I17): Host-only ctx.llm candidate collection.
 * - `novelSettings` (I31): Host-only persisted A2 template/preset/route settings;
 *   it resolves SecretRefs through the Host seam and delegates through the existing ctx.llm adapter.
 * - `novelExtension` (I32): Fiber-owned internal Provider/Injector/Validator/
 *   Parser/relationship-rule/backend-strategy registry; it grants no independent
 *   file, credential, LLM, UI, or composition ownership (design §11.1).
 * - `novelStoryGeneration` (I19): full navigation/context/history candidate path;
 *   it deliberately has no parser or writeback operation.
 * - `novelConsistencyDetection` (I21): Host-only B1 immutable/C4 semantic
 *   detector using the injected `ctx.llm` route; it returns I20 adjudication
 *   but has no parser or writeback operation.
 * - `novelKnowledgeLeakDetection` (I22): Host-only C3 POV leak detector.
 *   It derives the allowed view through I18, returns I20 adjudication, and
 *   has no C3 write, parser, or Client operation.
 * - `novelRelationshipStyleDetection` (I24): Host-only C1/B4 semantic soft
 *   detector. It returns I20 warnings only and has no parser or writeback.
 * - `novelStateParser` (I25): Host-only C2 recognition through `ctx.llm`; it
 *   returns strict ops only, leaving StateEngine and I11 Gate write authority intact.
 * - `novelRelationshipParser` (I27): Host-only C1 recognition through `ctx.llm`.
 *   It returns strict operations only; its parser path is the default C1
 *   automatic writer, while RelationshipRepository persists validated C1 state.
 * - `novelKnowledgeParser` (I28): Host-only C3 recognition through `ctx.llm`.
 *   It returns strict forward operations only; KnowledgeRepository retains C3
 *   graph validation and persistence while I11 owns low-confidence confirmation.
 * - `novelWorldviewParser` (I29): Host-only B2 recognition through `ctx.llm`.
 *   It returns supersede proposals only; every B2 rewrite remains confirmation-first
 *   and WorldRepository retains the rewritten-history persistence contract.
 * - `novelProbe` (I2): plain Host service backing the `novelProbe/probe` Remote.
 *   Its Typert contribution is registered only when the DSH Typert registry
 *   (`ctx.typert`, key `typert`) is present, so the plugin still boots in the
 *   minimal I1 loader smoke where that registry is absent. Registration runs
 *   through `ctx.effect`, so Fiber dispose withdraws it (H0-6).
 */
export const name = 'novel-creation-tool';

/** Minimal I1 status service, read-only and versioned for smoke assertions. */
export interface NovelCreationStatus {
  readonly version: '2.0.0';
  readonly ready: true;
}

export interface NovelCreationConfig {
  projectsRoot?: string;
  /** Host-only location for A2 settings; it is not a project/export data path. */
  settingsRoot?: string;
}

export function apply(ctx: Context, config: NovelCreationConfig = {}): void {
  const status: NovelCreationStatus = { version: '2.0.0', ready: true };
  // Services are owned by the current Fiber and removed on dispose.
  ctx.provide('novelCreation', status);
  const projectsRoot = config.projectsRoot;
  ctx.provide('novelProject', createProjectService(projectsRoot));
  ctx.provide('novelState', createStateService(projectsRoot));
  ctx.provide('novelCanon', createCanonService(projectsRoot));
  ctx.provide('novelText', createTextService(projectsRoot));
  ctx.provide('novelRule', createRuleService(projectsRoot));
  ctx.provide('novelWorldview', createWorldviewService(projectsRoot));
  ctx.provide('novelCharacter', createCharacterService(projectsRoot));
  ctx.provide('novelStyle', createStyleService(projectsRoot));
  ctx.provide('novelConfirmation', createConfirmationService(projectsRoot));
  ctx.provide('novelOutline', createOutlineService(projectsRoot));
  ctx.provide('novelRelationship', createRelationshipService(projectsRoot));
  ctx.provide('novelKnowledge', createKnowledgeService(projectsRoot));
  const llm = ctx.get('llm', false);
  const credentials = ctx.get('credentials', false);
  ctx.provide('novelGeneration', createGenerationService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelSettings', createSettingsService(llm, config.settingsRoot, credentials, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelExtension', createExtensionService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStoryGeneration', createStoryGenerationService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStoryLifecycle', createStoryLifecycleService(llm, projectsRoot, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelConsistencyDetection', createConsistencyDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelKnowledgeLeakDetection', createKnowledgeLeakDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelRelationshipStyleDetection', createRelationshipStyleDetectionService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelStateParser', createStateParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelRelationshipParser', createRelationshipParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelKnowledgeParser', createKnowledgeParserService(llm, (dispose) => ctx.effect(() => dispose)));
  ctx.provide('novelWorldviewParser', createWorldviewParserService(llm, (dispose) => ctx.effect(() => dispose)));

  // I2 public Remote probe: provide the service, then register its Typert
  // contribution when the registry is available (full DSH Host composition).
  ctx.provide(NOVEL_PROBE_NAMESPACE, { probe: probeData });
  ctx.provide(NOVEL_WORKSPACE_NAMESPACE, { viewModel: workspaceViewModel });
  const typert = ctx.get('typert', false);
  if (typert !== undefined) {
    ctx.effect(() => typert.register(probeContribution));
    ctx.effect(() => typert.register(workspaceContribution));
  }
}
