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

function requireText(document, value, label) {
  if (!document.includes(value)) throw new Error(`I187 authority is incomplete: ${label}`);
}

function rejectText(document, value, label) {
  if (document.includes(value)) throw new Error(`I187 stale baseline remains: ${label}`);
}

for (const [key, document] of Object.entries(documents)) {
  requireText(document, 'v4.1', `${files[key]} does not declare v4.1`);
  requireText(document, 'I187', `${files[key]} does not identify I187`);
}

for (const phrase of [
  'D35',
  '多个受管 Renderer',
  '明文持久化多套 profile',
  'secret 不得进入 IPC 结果、日志、作品目录、导出包或崩溃诊断',
  'I186 安装包只能标记为 v4.0 legacy baseline',
]) requireText(documents.design, phrase, `design is missing: ${phrase}`);

for (const phrase of [
  '## R35. 多 Renderer 与 Renderer 明文凭据架构基线（I187）',
  'Stage 37 多 Renderer 与 Renderer 明文凭据治理（R35）',
  'Renderer 配置存储可明文持久化多套命名 provider profiles',
  'secret 只能作为 strict IPC 请求输入进入 Main 临时内存',
]) requireText(documents.requirements, phrase, `requirements are missing: ${phrase}`);

for (const phrase of [
  '## 38. Stage 37：多 Renderer 与 Renderer 明文凭据架构治理（R35，I187）',
  '### I187：宪法级多 Renderer 与 Renderer 明文多 profile 基线修订',
  '不修改 Main/Preload/Renderer 运行时代码',
  '不得标记为 v4.1 conformant',
]) requireText(documents.plan, phrase, `plan is missing: ${phrase}`);

for (const phrase of [
  '应用可有多个受管 Renderer',
  '可拥有并明文持久化多套 provider profiles',
  'CredentialStore` 只作可选兼容/导入适配器',
  'I187 不授权运行时实现',
]) requireText(documents.agents, phrase, `AGENTS is missing: ${phrase}`);

const designBaseline = documents.design.slice(
  documents.design.indexOf('## 0.1 宪法级桌面宿主基线'),
  documents.design.indexOf('## 1. 文档概述'),
);
const requirementsH0 = documents.requirements.slice(
  documents.requirements.indexOf('## H0. 宪法级 Electron 宿主要求'),
  documents.requirements.indexOf('## R0. 产品身份与总体目标'),
);

rejectText(designBaseline, 'Renderer 是唯一 Client', 'design §0.1 still requires one Renderer');
rejectText(designBaseline, '长期凭据只可由 Main', 'design §0.1 still requires CredentialStore-only ownership');
rejectText(requirementsH0, '长期凭据只由 Main', 'requirements H0 still requires CredentialStore-only ownership');
rejectText(documents.agents, 'UI 使用唯一 HTML/React `createRoot()`', 'AGENTS still requires one global Renderer root');
rejectText(documents.agents, '凭据只经 Main `CredentialStore`', 'AGENTS still requires CredentialStore-only ownership');

const cards = documents.plan.match(/^### I187：/gm) ?? [];
if (cards.length !== 1) throw new Error(`Expected exactly one I187 execution card, found ${cards.length}`);

console.log('I187 authority smoke: v4.1 multi-Renderer and Renderer plaintext-profile baseline verified');
