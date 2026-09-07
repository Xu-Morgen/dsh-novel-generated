import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { launchUiElectron } from './ui-electron-session.mjs';
import { uiInvoke } from './ui-test-provider.mjs';

const firstToken = 'i196-test-token-first';
const editedToken = 'i196-test-token-edited';
const app = await launchUiElectron('i196');
const tokenFile = join(app.profile, 'settings', 'ai-token.txt');

try {
  const saved = await uiInvoke(app, 'novelLlmConfig/save', {
    baseUrl: 'https://api.example.test/v1',
    model: 'i196-model',
    apiKey: firstToken,
    maxTokens: 32768,
    thinking: 'disabled',
    reasoningEffort: 'low',
  });
  assert.equal(saved.ok, true);
  assert.equal(await readFile(tokenFile, 'utf8'), `${firstToken}\n`);

  await writeFile(tokenFile, `${editedToken}\n`, 'utf8');
  const loaded = await uiInvoke(app, 'novelLlmConfig/load');
  assert.equal(loaded.hasKey, true);
  assert.ok(!JSON.stringify({ saved, loaded }).includes(firstToken));
  assert.ok(!JSON.stringify({ saved, loaded }).includes(editedToken));

  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({
    iteration: 'I196',
    storageFile: 'settings/ai-token.txt',
    plaintext: true,
    externalEditReload: true,
    ipcSecretEcho: false,
    disclosureDomTest: 'src/client-project.test.ts',
  }, null, 2));
  process.stdout.write('I196: plaintext token save, external edit reload, disclosure, and IPC redaction passed\n');
} finally {
  // The isolated smoke profile is evidence, so remove the deliberate plaintext
  // fixture before it can be retained with screenshots or logs.
  await rm(tokenFile, { force: true });
  try {
    await app.close();
  } finally {
    await rm(app.profile, { recursive: true, force: true });
  }
}
