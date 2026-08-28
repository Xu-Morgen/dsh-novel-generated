/**
 * I91 正对照夹具（host 侧，不在主 tsconfig include 内；见 tsconfig.json）。
 *
 * 用途：证明 `defineRemote` 的 descriptor 类型耦合面在「descriptor 派生调用形状
 * 与 call 闭包一致」时编译通过 —— 即 smoke-i91 的负向夹具失败确实源于形状漂移，
 * 而不是夹具本身的语法/导入问题（review v2.0 §3.1 / 计划 §18 I91）。
 *
 * 运行方式（smoke-i91）：对本文件单独跑
 *   tsc --noEmit --strict --module nodenext --moduleResolution nodenext <file>
 * 必须退出码 0。
 */
import { defineRemote, param, remoteInvocation } from '../../src/host/remote/shared.js';
import { strictCodec, stringCodec } from '../../src/host/remote/common.js';
import { z } from 'zod';

/** 模拟 domain service。 */
interface DemoSearchService {
  search(projectId: string, query: string): Promise<{ total: number; hits: string[] }>;
}

declare const service: DemoSearchService;

// descriptor 参数/返回类型（幻影类型随泛型透传保留）。
const searchInvocation = remoteInvocation('novelDemoSearch', 'search', [
  param('projectId', stringCodec),
  param('query', stringCodec),
], strictCodec('novel-creation-tool#demoSearch:result', z.object({ total: z.number().int().nonnegative(), hits: z.array(z.string()) }).strict()));

// call 闭包形参与 descriptor 派生形状一致 → 必须编译通过。
const adapter = defineRemote('novelDemoSearch', 'novelDemoSearch', service, [
  { method: 'search', call: (projectId: string, query: string) => service.search(projectId, query) },
], [searchInvocation]);

void adapter;
