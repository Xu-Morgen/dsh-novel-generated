import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`Stage 18 smoke: ${message}`); };

/**
 * Stage 18 的 I103–I139 smoke 是各自迭代的合同快照，故意锁定当时的
 * additive suffix；最终 lock 扩展后不能把它们重新当作当前 suffix 执行。
 * 本累积门验证每个迭代的 verify/artifact 证据仍在，并由 I140 重新执行
 * 当前全量测试、构建、产品流程和最终术语门。
 */
const packageJson = JSON.parse(read('package.json'));
for (let iteration = 103; iteration <= 140; iteration += 1) {
  if (typeof packageJson.scripts[`verify:i${iteration}`] !== 'string') fail(`missing verify:i${iteration}`);
  const prefix = `i${iteration}-`;
  const artifacts = readdirSync(resolve(repoRoot, 'artifacts')).filter((file) => file.startsWith(prefix) && file.endsWith('.json'));
  if (artifacts.length !== 1) fail(`expected one artifact for I${iteration}, found ${artifacts.length}`);
  const artifact = JSON.parse(read(`artifacts/${artifacts[0]}`));
  if (artifact.iteration !== `I${iteration}`) fail(`artifact ${artifacts[0]} identifies ${artifact.iteration ?? 'unknown'}`);
}

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
if (lock.descriptorIds.length !== 183 || lock.resultSchemaIds.length !== 89) fail('final Stage 18 + I150 Remote lock is not 183/89');
if (lock.descriptorIds.slice(-2).join('|') !== 'novel-creation-tool/novelOutlineDetailGeneration/append|novel-creation-tool/novelOutlineDetailGeneration/select') fail('I150 strict additions are not the Remote lock tail');
const finalArtifact = JSON.parse(read('artifacts/i140-primary-author-workflow.json'));
if (finalArtifact.flow?.length !== 12 || finalArtifact.flow.some((step) => step.status !== 'passed')) fail('I140 does not record all twelve passed product steps');
if (finalArtifact.lexicon?.violations !== 0) fail('I140 final author lexicon gate is not clean');

process.stdout.write('Stage 18 smoke: I103-I140 verify/artifact evidence, final lock, twelve-step product gate, and terminology gate passed\n');
