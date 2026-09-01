import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { RuleRepository } from '../core/rules/index.js';
import type {
  ActiveRuleView,
  Rule,
  RuleInput,
  RuleKind,
  RulePatch,
  RuleReference,
  RuleScope,
} from '../core/schema/rules.js';

export interface RuleQuery {
  scope?: RuleScope;
  kind?: RuleKind;
  immutable?: boolean;
}

export interface NovelRuleService {
  open(projectId: string): Promise<void>;
  create(projectId: string, input: RuleInput): Promise<Rule>;
  read(projectId: string, ruleId: string): Promise<Rule>;
  list(projectId: string): Promise<Rule[]>;
  update(projectId: string, ruleId: string, patch: RulePatch): Promise<Rule>;
  listActive(projectId: string): Promise<ActiveRuleView[]>;
  query(projectId: string, filter?: RuleQuery): Promise<RuleReference[]>;
  initialize(projectId: string, inputs: readonly RuleInput[]): Promise<Rule[]>;
  clearInitialization(projectId: string, ruleIds: readonly string[]): Promise<void>;
}

/**
 * Host facade for the I7 B1 rule store; callers receive validated Rule values
 * and never filesystem paths. Design §10.1 / R1-B1.
 */
export function createRuleService(projectsRoot = join(homedir(), '.dsh', 'novel-projects')): NovelRuleService {
  const repositories = new Map<string, RuleRepository>();
  const get = (projectId: string): RuleRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Rule project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new RuleRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    create: (projectId, input) => get(projectId).create(input),
    read: (projectId, ruleId) => get(projectId).read(ruleId),
    list: (projectId) => get(projectId).list(),
    update: (projectId, ruleId, patch) => get(projectId).update(ruleId, patch),
    listActive: (projectId) => get(projectId).listActive(),
    query: (projectId, filter) => get(projectId).query(filter),
    initialize: (projectId, inputs) => get(projectId).initialize(inputs),
    clearInitialization: (projectId, ruleIds) => get(projectId).clearInitialization(ruleIds),
  };
}
