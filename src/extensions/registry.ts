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

/**
 * I102 单一 kind descriptor 表（计划 §18 I102，review v2.0 §6）：新增 kind 只改
 * 此处——枚举、validateDefinition 的字段白名单与函数检查、seams() 投影、默认武装
 * 全部由本表派生（原未使用的 kind→category 恒等映射已删除）。Extension 判别联合经
 * `satisfies` 与表双向约束（kind 字面量漂移即编译错）。
 */
export interface ExtensionKindDescriptor<K extends Extension['kind']> {
  readonly kind: K;
  /** seams() 投影键（RegistrySeams 字段名）。 */
  readonly seam: keyof RegistrySeams;
  /** 允许的顶层字段白名单（validateDefinition 授权检查）。 */
  readonly keys: readonly string[];
  /** 关系规则默认禁用（armRelationshipRules 显式武装）。 */
  readonly armedByDefault: boolean;
  /** kind 特有形状校验（provider 的 schema / parser 的 outputSchema+parse 等）。 */
  validate(extension: Extract<Extension, { kind: K }>): void;
}

type AnyKindExtension = Extract<Extension, { kind: ExtensionKindDescriptor<Extension['kind']>['kind'] }>;

export const EXTENSION_KIND_DESCRIPTORS: readonly ExtensionKindDescriptor<Extension['kind']>[] = [
  { kind: 'provider', seam: 'providers', keys: ['id', 'kind', 'layerId', 'schema'], armedByDefault: true,
    validate(extension: AnyKindExtension) {
      const provider = extension as ProviderExtension;
      if (!provider.schema || typeof provider.schema.parse !== 'function') throw new Error('Provider schema is required');
    } },
  { kind: 'injector', seam: 'injectors', keys: ['id', 'kind', 'layerId', 'heading', 'serialize'], armedByDefault: true,
    validate(extension: AnyKindExtension) {
      const injector = extension as InjectorExtension;
      if (!injector.heading.trim() || typeof injector.serialize !== 'function') throw new Error('Valid injector is required');
    } },
  { kind: 'validator', seam: 'validators', keys: ['id', 'kind', 'check'], armedByDefault: true,
    validate(extension: AnyKindExtension) {
      const validator = extension as ValidatorExtension;
      if (typeof validator.check !== 'function') throw new Error('Validator check function is required');
    } },
  { kind: 'parser', seam: 'parsers', keys: ['id', 'kind', 'layerId', 'outputSchema', 'parse'], armedByDefault: true,
    validate(extension: AnyKindExtension) {
      const parser = extension as ParserExtension;
      if (!parser.outputSchema || typeof parser.outputSchema.parse !== 'function' || typeof parser.parse !== 'function') {
        throw new Error('Parser output schema and parse function are required');
      }
    } },
  { kind: 'relationship-rule', seam: 'relationshipRules', keys: ['id', 'kind', 'evaluate'], armedByDefault: false,
    validate(extension: AnyKindExtension) {
      const rule = extension as RelationshipRuleExtension;
      if (typeof rule.evaluate !== 'function') throw new Error('Relationship rule evaluate function is required');
    } },
  { kind: 'backend-strategy', seam: 'backendStrategies', keys: ['id', 'kind', 'adapt'], armedByDefault: true,
    validate(extension: AnyKindExtension) {
      const strategy = extension as BackendStrategyExtension;
      if (typeof strategy.adapt !== 'function') throw new Error('Backend strategy adapt function is required');
    } },
] as const satisfies readonly ExtensionKindDescriptor<Extension['kind']>[];

/** 由 descriptor 表派生的 kind 枚举（替代原手写 extensionCategorySchema）。 */
export const extensionKindSchema = z.enum(EXTENSION_KIND_DESCRIPTORS.map((descriptor) => descriptor.kind));
export type ExtensionKind = z.infer<typeof extensionKindSchema>;
// 兼容别名：既有外部引用以 category 命名读取 kind 枚举。
export const extensionCategorySchema = extensionKindSchema;
export type ExtensionCategory = ExtensionKind;

const descriptorFor = (kind: Extension['kind']): ExtensionKindDescriptor<Extension['kind']> => {
  const descriptor = EXTENSION_KIND_DESCRIPTORS.find((item) => item.kind === kind);
  if (!descriptor) throw new Error(`Unknown extension kind: ${kind}`);
  return descriptor;
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
    this.registrations.set(id, { definition: snapshot, armed: descriptorFor(extension.kind).armedByDefault });

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
    // I102：seams 投影由单一 descriptor 表派生（新增 kind 无需改此处）。
    const result = {} as Record<keyof RegistrySeams, readonly Extension[]>;
    for (const descriptor of EXTENSION_KIND_DESCRIPTORS) {
      result[descriptor.seam] = Object.freeze(active.filter((item) => item.kind === descriptor.kind));
    }
    return Object.freeze(result as RegistrySeams);
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
  const kind = extensionKindSchema.parse((extension as { kind?: unknown }).kind);
  extensionIdSchema.parse((extension as { id?: unknown }).id);
  const descriptor = descriptorFor(kind);
  const allowed = new Set(descriptor.keys);
  const extra = Object.keys(extension).filter((key) => !allowed.has(key));
  if (extra.length > 0) throw new Error(`Unauthorized extension fields: ${extra.join(', ')}`);

  if ('layerId' in extension) extensionIdSchema.parse(extension.layerId);
  descriptor.validate(extension);
}
