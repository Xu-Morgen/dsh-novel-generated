import { mkdir, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { validateProjectId } from '../io/path.js';
import {
  ruleSchema,
  type ActiveRuleView,
  type Rule,
  type RuleInput,
  type RuleKind,
  type RulePatch,
  type RuleReference,
  type RuleScope,
} from '../schema/rules.js';

const FILE_SUFFIX = '.yaml';

/**
 * B1 rule store (design §5.3 / §10.1): one validated YAML document per rule
 * under the project's `rules` directory.
 *
 * Contract / invariants:
 * - The YAML file is source of truth; every read re-validates against
 *   {@link ruleSchema}, so a corrupt or tampered document fails loudly.
 * - `scope`/`kind` are closed enums and a missing `statement` fails validation.
 * - `immutable` and `priority` replicate on every round-trip.
 * - Queries are deterministic: active rules are ordered by descending
 *   `priority`, then by `id` for a stable consumer injection order.
 * - Immutable rules cannot be overwritten once stored (only inactivated via
 *   `active: false` at create time); I7 leaves semantic injection to I13.
 */
export class RuleRepository {
  private readonly rulesDirectory: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.rulesDirectory = join(projectDirectory, 'rules');
  }

  async open(): Promise<void> {
    await mkdir(this.rulesDirectory, { recursive: true });
  }

  async create(input: RuleInput): Promise<Rule> {
    return this.enqueue(async () => {
      const rule = ruleSchema.parse({ ...input, version: input.version ?? 1 });
      const filePath = this.rulePath(rule.id);
      if (await this.exists(filePath)) throw new Error(`Rule already exists: ${rule.id}`);
      await this.writeRuleDocument(rule);
      return structuredClone(rule);
    });
  }

  /** I151 empty-store batch initialization with compensation on any rename failure. */
  async initialize(inputs: readonly RuleInput[]): Promise<Rule[]> {
    return this.enqueue(async () => {
      if ((await this.readRuleFiles()).length > 0) throw new Error('Rule import initialization requires empty B1');
      const rules = inputs.map((input) => ruleSchema.parse({ ...input, version: input.version ?? 1 }));
      if (new Set(rules.map((rule) => rule.id)).size !== rules.length) throw new Error('Rule import initialization contains duplicate ids');
      const staged = rules.map((rule) => ({ rule, target: this.rulePath(rule.id), temporary: `${this.rulePath(rule.id)}.init.tmp` }));
      const committed: string[] = [];
      try {
        for (const item of staged) await writeYaml(item.temporary, item.rule);
        for (const item of staged) { await rename(item.temporary, item.target); committed.push(item.target); }
        return structuredClone(rules);
      } catch (error) {
        await Promise.all([...staged.map((item) => item.temporary), ...committed].map((path) => unlink(path).catch(() => undefined)));
        throw error;
      }
    });
  }

  /** I151 compensation only removes ids created by the same initialization operation. */
  async clearInitialization(ruleIds: readonly string[]): Promise<void> {
    await this.enqueue(async () => {
      await Promise.all(ruleIds.map((id) => unlink(this.rulePath(id)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      })));
    });
  }

  async read(ruleId: string): Promise<Rule> {
    const raw = await this.readDocument(ruleId);
    try {
      return ruleSchema.parse(raw);
    } catch (error) {
      throw new Error(`Invalid rule document: ${ruleId}`, { cause: error });
    }
  }

  async list(): Promise<Rule[]> {
    return this.enqueue(async () => {
      const files = (await this.readRuleFiles()).sort();
      const rules: Rule[] = [];
      for (const file of files) {
        const raw = await readYaml<unknown>(join(this.rulesDirectory, file));
        try {
          rules.push(ruleSchema.parse(raw));
        } catch (error) {
          throw new Error(`Invalid rule document: ${file.replace(FILE_SUFFIX, '')}`, { cause: error });
        }
      }
      return rules;
    });
  }

  async update(ruleId: string, patch: RulePatch): Promise<Rule> {
    return this.enqueue(async () => {
      const current = await this.read(ruleId);
      if (current.immutable) throw new Error(`Immutable rule cannot be updated: ${ruleId}`);
      const version = current.version + 1;
      const rule = ruleSchema.parse({ ...patch, id: current.id, version });
      await this.writeRuleDocument(rule);
      return structuredClone(rule);
    });
  }

  /** Deterministic consumer fixture: active rules, priority desc, id tie-break. */
  async listActive(): Promise<ActiveRuleView[]> {
    const rules = await this.list();
    return rules
      .filter((rule) => rule.active)
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
      .map((rule) => ({ rule, scope: rule.scope, priority: rule.priority, immutable: rule.immutable }));
  }

  /** Deterministic query by scope/kind/immutable; any omitted means "match all". */
  async query(filter: { scope?: RuleScope; kind?: RuleKind; immutable?: boolean } = {}): Promise<RuleReference[]> {
    const rules = await this.list();
    return rules
      .filter((rule) =>
        (filter.scope === undefined || rule.scope === filter.scope) &&
        (filter.kind === undefined || rule.kind === filter.kind) &&
        (filter.immutable === undefined || rule.immutable === filter.immutable),
      )
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
      .map((rule) => ({ id: rule.id, statement: rule.statement, priority: rule.priority, immutable: rule.immutable }));
  }

  private rulePath(ruleId: string): string {
    return join(this.rulesDirectory, `${validateProjectId(ruleId)}${FILE_SUFFIX}`);
  }

  private async readRuleFiles(): Promise<string[]> {
    const entries = await readdir(this.rulesDirectory);
    return entries.filter((file) => file.endsWith(FILE_SUFFIX));
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath, 'utf8');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async readDocument(ruleId: string): Promise<unknown> {
    const raw = await readYaml<unknown>(this.rulePath(ruleId));
    if (raw === null || raw === undefined) throw new Error(`Invalid rule document: ${ruleId}`);
    return raw;
  }

  private async writeRuleDocument(rule: Rule): Promise<void> {
    const filePath = this.rulePath(rule.id);
    const temporaryPath = `${filePath}.tmp`;
    await writeYaml(temporaryPath, rule);
    await rename(temporaryPath, filePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
