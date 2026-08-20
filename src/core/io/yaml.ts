import { dump, load } from 'js-yaml';
import { readFile, writeFile } from 'node:fs/promises';

/** Read one UTF-8 YAML document and convert parser failures to a stable error. */
export async function readYaml<T>(filePath: string): Promise<T> {
  try {
    return load(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    throw new Error(`Invalid YAML: ${filePath}`, { cause: error });
  }
}

/** Write a deterministic UTF-8 YAML document owned by the Host store. */
export async function writeYaml(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, dump(value, { noRefs: true, lineWidth: 120 }), 'utf8');
}
