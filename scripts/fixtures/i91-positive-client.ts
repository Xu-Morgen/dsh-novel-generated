/**
 * I91 正对照夹具（client 侧，不在主 tsconfig include 内；见 tsconfig.json）。
 *
 * 用途：证明 `NamespaceOf` 从 contribution descriptor 派生的 namespace 方法面
 * 在「调用形参与 descriptor 派生形状一致」时编译通过 —— 即 smoke-i91 的 client
 * 负向夹具失败确实源于调用形状漂移（review v2.0 §3.1 / 计划 §18 I91）。
 *
 * 运行方式（smoke-i91）：对本文件单独跑
 *   tsc --noEmit --strict --module nodenext --moduleResolution nodenext <file>
 * 必须退出码 0。
 */
import { param, remoteContribution, remoteInvocation } from '../../src/host/remote/shared.js';
import { strictCodec, stringCodec } from '../../src/host/remote/common.js';
import type { NamespaceOf, RemoteResult } from '../../src/client/remote-namespace.js';
import { z } from 'zod';

// 本地自包含 contribution：descriptor 参数/返回类型随幻影类型透传。
const searchInvocation = remoteInvocation('novelDemoSearch', 'search', [
  param('projectId', stringCodec),
  param('query', stringCodec),
], strictCodec('novel-creation-tool#demoSearch:result', z.object({ total: z.number().int().nonnegative(), hits: z.array(z.string()) }).strict()));
const contribution = remoteContribution('novel-creation-tool-i91-fixture', [searchInvocation]);

type SearchNamespace = NamespaceOf<typeof contribution>;
declare const ns: SearchNamespace;

// 派生调用形状与 descriptor 一致 → 必须编译通过。
const result: Promise<RemoteResult<{ total: number; hits: string[] }>> = ns.search('p', 'q');
void result;
