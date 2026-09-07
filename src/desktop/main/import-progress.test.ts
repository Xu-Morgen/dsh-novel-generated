import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createOutlineService } from '../../host/outline-service.js';
import { ONBOARDING_PROMPT_EXAMPLE } from '../../core/onboarding/example.js';
import { ensureImportedProgress } from './import-progress.js';

it('I194 initializes an imported cursor once and refuses to replace damaged progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-import-progress-'));
  try {
    const owner = createOutlineService(root);
    await owner.open('test');
    await owner.save('test', ONBOARDING_PROMPT_EXAMPLE.layers.outline.candidates[0]);
    await ensureImportedProgress(owner, 'test');
    const first = await owner.readProgress('test');
    await owner.saveProgress('test', { ...first, tensionLevel: 42 });
    await ensureImportedProgress(owner, 'test');
    expect((await owner.readProgress('test')).tensionLevel).toBe(42);
    const file = join(root, 'test', 'outline-progress.yaml');
    await writeFile(file, 'broken: [');
    await expect(ensureImportedProgress(owner, 'test')).rejects.toThrow('Invalid outline progress');
    expect(await readFile(file, 'utf8')).toBe('broken: [');
  } finally { await rm(root, { recursive: true, force: true }); }
});
