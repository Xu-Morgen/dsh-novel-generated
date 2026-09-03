import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = {
  design: 'docs/novel-creation-tool-design.md',
  requirements: 'docs/novel-creation-tool-requirements.md',
  plan: 'docs/novel-creation-tool-development-plan.md',
  agents: 'AGENTS.md',
};

const documents = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(resolve(root, path), 'utf8')]),
));

function requireText(document, text, label) {
  if (!document.includes(text)) throw new Error(`I165 desktop authority is incomplete: ${label}`);
}

for (const [key, document] of Object.entries(documents)) {
  requireText(document, 'v4.0', `${files[key]} does not declare v4.0`);
}

requireText(documents.design, 'Electron 是 `desktop` 分支唯一运行宿主和主交付形态', 'design §0.1 does not select Electron');
requireText(documents.design, 'Main Process 是唯一 Host', 'design does not assign the Main owner');
requireText(documents.design, 'I183 后生产依赖、构建、入口和发布物必须零 DSH/Cordis', 'design has no DSH retirement gate');
requireText(documents.requirements, '## H0. 宪法级 Electron 宿主要求', 'requirements H0 is not the Electron baseline');
requireText(documents.requirements, '## R34. Electron 桌面应用架构迁移', 'requirements have no R34 migration coverage');
requireText(documents.plan, '下一步为 I166', 'plan does not identify the next iteration');
requireText(documents.agents, 'I166–I186 为当前迁移执行卡', 'AGENTS does not authorize the migration cards');

for (let iteration = 165; iteration <= 186; iteration += 1) {
  const heading = new RegExp(`^### I${iteration}：`, 'gm');
  const matches = documents.plan.match(heading) ?? [];
  if (matches.length !== 1) throw new Error(`Expected exactly one I${iteration} execution card, found ${matches.length}`);
}

for (const stage of [32, 33, 34, 35, 36]) {
  requireText(documents.plan, `Stage ${stage}`, `plan is missing Stage ${stage}`);
  requireText(documents.requirements, `Stage ${stage}`, `requirements are missing Stage ${stage}`);
}

const currentBaseline = documents.design.slice(
  documents.design.indexOf('## 0.1 宪法级桌面宿主基线'),
  documents.design.indexOf('## 1. 文档概述'),
);
for (const forbidden of ['DeepSeek Harness 是本项目唯一运行宿主', 'Client **禁止**自带独立 HTML', '离开 DeepSeek Harness 后仍存在被支持的主要运行路径']) {
  if (currentBaseline.includes(forbidden)) throw new Error(`Legacy DSH rule leaked into current desktop baseline: ${forbidden}`);
}

console.log('I165 desktop authority smoke: v4.0 Electron baseline and I165–I186 plan verified');
