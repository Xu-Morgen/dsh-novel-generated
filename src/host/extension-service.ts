import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { collectCandidate, resolveGenerationSettings, asLlmBackend, type LlmBackend } from '../llm/port/index.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { adjudicateViolations, consistencyViolationsSchema } from '../core/validate/index.js';
import {
  ExtensionRegistry,
  type BackendStrategyExtension,
  type Extension,
  type ExtensionHandle,
  type InjectorExtension,
  type ParserExtension,
  type ProviderExtension,
  type RelationshipRuleDelta,
  type RelationshipRuleExtension,
  type RegistrySeams,
  type ValidatorExtension,
} from '../extensions/registry.js';
import { ExtensionLayerStore } from '../extensions/store.js';

const relationshipRuleSuggestionSchema = z.object({
  relationshipId: z.string().min(1),
  field: z.enum(['affinity', 'trust', 'status']),
  delta: z.union([z.number().finite(), z.string().min(1)]),
}).strict();
const backendStrategyViewSchema = z.object({
  modelRef: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stopSequences: z.array(z.string().min(1)).optional(),
}).strict();

/** Host-owned input to a custom Provider/Injector/Parser seam. */
export interface ExtensionLayerRequest {
  readonly projectId: string;
  readonly layerId: string;
  readonly value?: unknown;
}

/**
 * I32 Host facade for one Fiber-owned internal Extension registry (design §11.1).
 *
 * All six categories use the same lifecycle registry. Extensions have no file,
 * credentials, LLM, UI, or composition ownership; they receive only validated
 * projections and Host-owned seam calls (requirements R6-2/R6-3).
 */
export interface NovelExtensionService {
  register(extension: Extension): ExtensionHandle;
  armRelationshipRules(): void;
  seams(): RegistrySeams;
  saveLayer(request: ExtensionLayerRequest): Promise<unknown>;
  loadLayer(request: ExtensionLayerRequest): Promise<unknown>;
  serializeLayer(layerId: string, value: unknown): string;
  runValidators(input: unknown): unknown[];
  adjudicate(input: unknown): ReturnType<typeof adjudicateViolations>;
  runParser(layerId: string, input: unknown, settings: unknown, signal?: AbortSignal): Promise<unknown>;
  adaptBackendRequest(request: unknown): unknown;
  evaluateRelationshipRules(input: unknown): RelationshipRuleDelta[];
}

export function createExtensionService(
  llm: unknown,
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
  onDispose?: (dispose: () => void) => void,
): NovelExtensionService {
  const registry = new ExtensionRegistry();
  const backend: LlmBackend | undefined = asLlmBackend(llm);
  const activeParsers = new Set<AbortController>();
  onDispose?.(() => {
    for (const controller of activeParsers) controller.abort();
    activeParsers.clear();
    registry.dispose();
  });

  const providerFor = (layerId: string): ProviderExtension => {
    const provider = registry.seams().providers.find((item) => item.layerId === layerId);
    if (!provider) throw new Error(`No provider registered for layer: ${layerId}`);
    return provider;
  };

  return Object.freeze({
    register: (extension: Extension) => registry.register(extension),
    armRelationshipRules: () => registry.armRelationshipRules(),
    seams: () => registry.seams(),

    async saveLayer(request: ExtensionLayerRequest) {
      validateProjectId(request.projectId);
      const provider = providerFor(request.layerId);
      const store = new ExtensionLayerStore(projectDirectory(projectsRoot, request.projectId));
      await store.open();
      return store.save(provider.layerId, provider.schema.parse(request.value));
    },

    async loadLayer(request: ExtensionLayerRequest) {
      validateProjectId(request.projectId);
      const provider = providerFor(request.layerId);
      const store = new ExtensionLayerStore(projectDirectory(projectsRoot, request.projectId));
      return provider.schema.parse(await store.load(provider.layerId));
    },

    serializeLayer(layerId: string, value: unknown) {
      const injector = registry.seams().injectors.find((item: InjectorExtension) => item.layerId === layerId);
      if (!injector) throw new Error(`No injector registered for layer: ${layerId}`);
      const provider = providerFor(layerId);
      const validated = provider.schema.parse(value);
      const text = injector.serialize(validated);
      if (typeof text !== 'string') throw new Error(`Injector returned non-text output: ${layerId}`);
      return text;
    },

    runValidators(input: unknown) {
      const output = registry.seams().validators.flatMap((validator: ValidatorExtension) => [...validator.check(input)]);
      return consistencyViolationsSchema.parse(output);
    },

    adjudicate(input: unknown) {
      return adjudicateViolations(input);
    },

    async runParser(layerId: string, input: unknown, settings: unknown, signal?: AbortSignal) {
      const parser = registry.seams().parsers.find((item: ParserExtension) => item.layerId === layerId);
      if (!parser) throw new Error(`No parser registered for layer: ${layerId}`);
      providerFor(layerId);
      if (!backend) throw new Error('Host LLM route is unavailable');
      const controller = new AbortController();
      activeParsers.add(controller);
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      const runtime = Object.freeze({
        generate: (prompt: string, generationSettings: unknown) => collectCandidate(backend, {
          prompt,
          settings: resolveGenerationSettings(generationSettings),
          signal: controller.signal,
        }),
      });
      try {
        return parser.outputSchema.parse(await parser.parse(input, settings, runtime, controller.signal));
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
        activeParsers.delete(controller);
      }
    },

    adaptBackendRequest(request: unknown) {
      if (!request || typeof request !== 'object') throw new Error('Backend strategy request must be an object');
      const withoutSecret = { ...(request as Record<string, unknown>) };
      delete withoutSecret.credentialRef;
      const initial = backendStrategyViewSchema.parse(withoutSecret);
      return registry.seams().backendStrategies.reduce<unknown>(
        (current, strategy: BackendStrategyExtension) => backendStrategyViewSchema.parse(strategy.adapt(current)),
        initial,
      );
    },

    evaluateRelationshipRules(input: unknown) {
      return registry.seams().relationshipRules.flatMap((rule: RelationshipRuleExtension) => rule.evaluate(input).map((raw) => {
        const delta = relationshipRuleSuggestionSchema.parse(raw);
        return Object.freeze({
          ...delta,
          provenance: Object.freeze({ ruleId: rule.id, input: structuredClone(input) }),
        });
      }));
    },
  });
}
