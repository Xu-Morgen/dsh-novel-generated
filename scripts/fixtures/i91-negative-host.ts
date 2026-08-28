/**
 * I91 负向夹具（host 侧，不在主 tsconfig include 内；见 tsconfig.json）。
 *
 * 用途：证明「给一个 Remote 方法删参数后接线层 call 即报编译错」（review v2.0
 * §3.1 根因 / 计划 §18 I91 验收负向夹具）。descriptor 声明 [projectId] 两个
 * 参数中的 query 被删掉，但接线层 call 闭包仍按旧两参形状声明 —— `defineRemote`
 * 的 descriptor 耦合面（`MethodsForDescriptors<D>`）在接线层直接报编译错。
 *
 * 运行方式（smoke-i91）：对本文件单独跑
 *   tsc --noEmit --strict --module nodenext --moduleResolution nodenext <file>
 * 必须退出码非 0，且报错定位在本文件。
 */
import { defineRemote, param, remoteInvocation } from '../../src/host/remote/shared.js';
import { strictCodec, stringCodec } from '../../src/host/remote/common.js';
import { z } from 'zod';

/** 模拟 domain service。 */
interface DemoSearchService {
  search(projectId: string, query: string): Promise<{ total: number; hits: string[] }>;
}

declare const service: DemoSearchService;

// descriptor 参数被删：只剩 projectId（wire 签名变更，接线层未同步）。
const searchInvocation = remoteInvocation('novelDemoSearch', 'search', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#demoSearch:result', z.object({ total: z.number().int().nonnegative(), hits: z.array(z.string()) }).strict()));

// 接线层 call 闭包仍按旧两参形状声明 —— 必须编译错
// （call 形参多于 descriptor 派生形状：Target signature provides too few arguments）。
const adapter = defineRemote('novelDemoSearch', 'novelDemoSearch', service, [
  { method: 'search', call: (projectId: string, query: string) => service.search(projectId, query) },
], [searchInvocation]);

void adapter;
