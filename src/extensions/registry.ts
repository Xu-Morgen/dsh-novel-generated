import { z } from 'zod';
import { entityIdSchema } from '../core/schema/base.js';

/**
 * Internal novel-domain Extension registry (design §11.1 / plan I32).
 *
 * Extension is a product-internal protocol, not an outer Cordis Plugin type.
 * Definitions receive only their declared input values. They do not receive
 * repositories, paths, credentials, ctx.llm, Client Slots, or composition
 * handles, so Host ownership remains intact (design §0.1.2; requirements R6-3).
 */
export const extensionCategorySchema = z.enum([
  'provider',
  'injector',
  'validator',
  'parser',
  'relationship-rule',
  'backend-strategy',
]);
export type ExtensionCategory = z.infer<typeof extensionCategorySchema>;
export const extensionIdSchema = entityIdSchema;

export interface ExtensionBase { readonly id: string; }

/** Provider defines the schema of one Host-persisted custom layer. */
export interface ProviderExtension extends ExtensionBase {
  readonly kind: 'provider';
  readonly layerId: string;
  readonly schema: z.ZodType<unknown>;
}

/** Injector deterministically serializes one provider-owned layer. */
export interface InjectorExtension extends ExtensionBase {
  readonly kind: 'injector';
  readonly layerId: string;
  readonly heading: string;
  serialize(value: unknown): string;
}

/** Validator adds findings; the I20 adjudicator still owns decisions. */
export interface ValidatorExtension extends ExtensionBase {
  readonly kind: 'validator';
  check(input: unknown): readonly unknown[];
}

/** Narrow Host-routed LLM capability available only during parser dispatch. */
export interface ParserRuntime {
  generate(prompt: string, settings: unknown, signal?: AbortSignal): Promise<{ readonly text: string; readonly chunks: number }>;
}

/** Parser recognizes operations for one layer and never writes it. */
export interface ParserExtension extends ExtensionBase {
  readonly kind: 'parser';
  readonly layerId: string;
  /** Strict schema applied to the parser result before it can cross the seam. */
  readonly outputSchema: z.ZodType<unknown>;
  parse(input: unknown, settings: unknown, runtime: ParserRuntime, signal?: AbortSignal): Promise<unknown>;
}

export interface RelationshipRuleSuggestion {
  readonly relationshipId: string;
  readonly field: 'affinity' | 'trust' | 'status';
  readonly delta: number | string;
}

/** Default-disabled rule which proposes relationship supplements and never persists. */
export interface RelationshipRuleExtension extends ExtensionBase {
  readonly kind: 'relationship-rule';
  evaluate(input: unknown): readonly RelationshipRuleSuggestion[];
}

/** Registry-owned provenance attached to every relationship supplement. */
export interface RelationshipRuleDelta extends RelationshipRuleSuggestion {
  readonly provenance: { readonly ruleId: string; readonly input: unknown };
}

/** Strategy over controlled route/sampling data, never credentials or ctx.llm. */
export interface BackendStrategyExtension extends ExtensionBase {
  readonly kind: 'backend-strategy';
  adapt(request: unknown): unknown;
}

export type Extension = ProviderExtension | InjectorExtension | ValidatorExtension
  | ParserExtension | RelationshipRuleExtension | BackendStrategyExtension;

export interface RegistrySeams {
  readonly providers: readonly ProviderExtension[];
  readonly injectors: readonly InjectorExtension[];
  readonly validators: readonly ValidatorExtension[];
  readonly parsers: readonly ParserExtension[];
  readonly relationshipRules: readonly RelationshipRuleExtension[];
  readonly backendStrategies: readonly BackendStrategyExtension[];
}

export interface ExtensionHandle { readonly id: string; release(): void; }
interface Registration { readonly definition: Extension; armed: boolean; }

const categoryByKind: Record<Extension['kind'], ExtensionCategory> = {
  provider: 'provider', injector: 'injector', validator: 'validator', parser: 'parser',
  'relationship-rule': 'relationship-rule', 'backend-strategy': 'backend-strategy',
};

const keysByKind: Record<Extension['kind'], readonly string[]> = {
  provider: ['id', 'kind', 'layerId', 'schema'],
  injector: ['id', 'kind', 'layerId', 'heading', 'serialize'],
  validator: ['id', 'kind', 'check'],
  parser: ['id', 'kind', 'layerId', 'outputSchema', 'parse'],
  'relationship-rule': ['id', 'kind', 'evaluate'],
  'backend-strategy': ['id', 'kind', 'adapt'],
};

/**
 * One lifecycle registry for all six extension points.
 *
 * IDs are globally unique, each layer seam has one owner, extra capability
 * fields fail registration, relationship rules are default-disabled, and
 * disposal revokes every handle (plan I32 / requirements R6-2, R6-3).
 */
export class ExtensionRegistry {
  private readonly registrations = new Map<string, Registration>();
  private disposed = false;
  private readonly releases = new Set<() => void>();

  register(extension: Extension): ExtensionHandle {
    this.assertAlive();
    validateDefinition(extension);
    const id = extensionIdSchema.parse(extension.id);
    if (this.registrations.has(id)) throw new Error(`Duplicate extension id: ${id}`);
    if ('layerId' in extension) this.assertLayerSeamAvailable(extension.kind, extension.layerId);
    // I99（review v2.0 §8#5 / 计划 §18 I99）：注册时顶层浅拷贝并冻结，保存不可变
    // 快照——注册后对原对象突变（id/kind/layerId 等不变量字段）不再能绕过注册时
    // 的校验；schema/函数等引用原样保留（只冻结投影顶层，不深拷 zod/函数）。
    const snapshot = Object.freeze({ ...extension });
    this.registrations.set(id, { definition: snapshot, armed: extension.kind !== 'relationship-rule' });

    let released = false;
    const release = () => {
      if (released || this.disposed) return;
      released = true;
      this.registrations.delete(id);
      this.releases.delete(release);
    };
    this.releases.add(release);
    return Object.freeze({ id, release });
  }

  armRelationshipRules(): void {
    this.assertAlive();
    for (const item of this.registrations.values()) {
      if (item.definition.kind === 'relationship-rule') item.armed = true;
    }
  }

  seams(): RegistrySeams {
    this.assertAlive();
    const active = [...this.registrations.values()].filter((item) => item.armed).map((item) => item.definition);
    const pick = <T extends Extension>(kind: T['kind']): readonly T[] => Object.freeze(
      active.filter((item): item is T => item.kind === kind),
    );
    return Object.freeze({
      providers: pick<ProviderExtension>('provider'),
      injectors: pick<InjectorExtension>('injector'),
      validators: pick<ValidatorExtension>('validator'),
      parsers: pick<ParserExtension>('parser'),
      relationshipRules: pick<RelationshipRuleExtension>('relationship-rule'),
      backendStrategies: pick<BackendStrategyExtension>('backend-strategy'),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    for (const release of [...this.releases]) release();
    this.releases.clear();
    this.registrations.clear();
    this.disposed = true;
  }

  private assertLayerSeamAvailable(kind: 'provider' | 'injector' | 'parser', layerId: string): void {
    const target = extensionIdSchema.parse(layerId);
    for (const registration of this.registrations.values()) {
      const existing = registration.definition;
      if (existing.kind === kind && 'layerId' in existing && existing.layerId === target) {
        throw new Error(`Duplicate ${kind} owner for layer: ${target}`);
      }
    }
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Extension registry has been disposed');
  }
}

function validateDefinition(extension: Extension): void {
  if (!extension || typeof extension !== 'object') throw new Error('Extension definition must be an object');
  const kind = extensionCategorySchema.parse((extension as { kind?: unknown }).kind);
  extensionIdSchema.parse((extension as { id?: unknown }).id);
  const allowed = new Set(keysByKind[kind]);
  const extra = Object.keys(extension).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw new Error(`Unauthorized extension fields: ${extra.join(', ')}`);

  if ('layerId' in extension) extensionIdSchema.parse(extension.layerId);
  switch (extension.kind) {
    case 'provider':
      if (!extension.schema || typeof extension.schema.parse !== 'function') throw new Error('Provider schema is required');
      break;
    case 'injector':
      if (!extension.heading.trim() || typeof extension.serialize !== 'function') throw new Error('Valid injector is required');
      break;
    case 'validator':
      if (typeof extension.check !== 'function') throw new Error('Validator check function is required');
      break;
    case 'parser':
      if (!extension.outputSchema || typeof extension.outputSchema.parse !== 'function' || typeof extension.parse !== 'function') {
        throw new Error('Parser output schema and parse function are required');
      }
      break;
    case 'relationship-rule':
      if (typeof extension.evaluate !== 'function') throw new Error('Relationship rule evaluate function is required');
      break;
    case 'backend-strategy':
      if (typeof extension.adapt !== 'function') throw new Error('Backend strategy adapt function is required');
      break;
  }
}
