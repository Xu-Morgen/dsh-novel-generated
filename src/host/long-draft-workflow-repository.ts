import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { projectDirectory } from '../core/io/path.js';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import {
  longDraftWorkflowCheckpointDocumentSchema,
  longDraftWorkflowCheckpointEntrySchema,
  type LongDraftWorkflowCheckpointDocument,
  type LongDraftWorkflowCheckpointEntry,
} from '../core/schema/long-draft.js';

const CHECKPOINT_FILE = 'long-draft-workflow.yaml';

/**
 * I120 Host-owned operational checkpoint store.
 *
 * The checkpoint is deliberately smaller than the I11 payload: the Gate is
 * the durable source for the candidate, while this document records the
 * apply state needed to resume an accepted operation. Writes use temp-file
 * plus rename so a failed checkpoint write cannot leave a partial YAML file.
 */
export interface LongDraftWorkflowCheckpointStore {
  read(projectId: string): Promise<readonly LongDraftWorkflowCheckpointEntry[]>;
  upsert(entry: LongDraftWorkflowCheckpointEntry): Promise<LongDraftWorkflowCheckpointEntry>;
}

export function createLongDraftWorkflowCheckpointStore(projectsRoot: string): LongDraftWorkflowCheckpointStore {
  const tails = new Map<string, Promise<unknown>>();

  const readDocument = async (projectId: string): Promise<LongDraftWorkflowCheckpointDocument> => {
    const path = checkpointPath(projectsRoot, projectId);
    try {
      return longDraftWorkflowCheckpointDocumentSchema.parse(await readYaml<unknown>(path));
    } catch (error) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        return { version: 1, entries: [] };
      }
      throw new Error(`Invalid long draft workflow checkpoint: ${path}`, { cause: error });
    }
  };

  const enqueue = <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = tails.get(projectId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    tails.set(projectId, run.then(() => undefined, () => undefined));
    return run;
  };

  const store: LongDraftWorkflowCheckpointStore = {
    read(projectId: string) {
      return enqueue(projectId, async () => structuredClone((await readDocument(projectId)).entries));
    },
    upsert(rawEntry: LongDraftWorkflowCheckpointEntry) {
      return enqueue(rawEntry.projectId, async () => {
        const entry = longDraftWorkflowCheckpointEntrySchema.parse(rawEntry);
        const document = await readDocument(entry.projectId);
        const entries = document.entries.filter((item) => item.proposalId !== entry.proposalId);
        entries.push(entry);
        const next = longDraftWorkflowCheckpointDocumentSchema.parse({ version: 1, entries });
        const path = checkpointPath(projectsRoot, entry.projectId);
        await writeYaml(`${path}.tmp`, next);
        await rename(`${path}.tmp`, path);
        return structuredClone(entry);
      });
    },
  };
  return Object.freeze(store);
}

function checkpointPath(projectsRoot: string, projectId: string): string {
  return join(projectDirectory(projectsRoot, projectId), CHECKPOINT_FILE);
}
