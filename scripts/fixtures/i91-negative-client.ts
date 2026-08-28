/**
 * I91 负向夹具（client 侧，不在主 tsconfig include 内；见 tsconfig.json）。
 *
 * 用途：证明「给一个 Remote 方法增参数后 Client 派生 namespace 调用处即报编译错」
 * （review v2.0 §3.1 根因 / 计划 §18 I91 验收负向夹具）。descriptor 声明
 * [projectId, query] 两参，消费处仍按旧一参形状调用 —— 派生 namespace 方法面
 * 在 Client 消费处直接报编译错。
 *
 * 运行方式（smoke-i91）：对本文件单独跑
 *   tsc --noEmit --strict --module nodenext --moduleResolution nodenext <file>
 * 必须退出码非 0，且报错定位在本文件。
 */
import { param, remoteContribution, remoteInvocation } from '../../src/host/remote/shared.js';
import { strictCodec, stringCodec } from '../../src/host/remote/common.js';
import type { NamespaceOf } from '../../src/client/remote-namespace.js';
import { z } from 'zod';

// 本地自包含 contribution：descriptor 参数 [projectId, query]（wire 签名新增 query）。
const searchInvocation = remoteInvocation('novelDemoSearch', 'search', [
  param('projectId', stringCodec),
  param('query', stringCodec),
], strictCodec('novel-creation-tool#demoSearch:result', z.object({ total: z.number().int().nonnegative(), hits: z.array(z.string()) }).strict()));
const contribution = remoteContribution('novel-creation-tool-i91-fixture', [searchInvocation]);

type SearchNamespace = NamespaceOf<typeof contribution>;
declare const ns: SearchNamespace;

// 消费处仍按旧一参形状调用 —— 必须编译错（Expected 2 arguments, but got 1）。
void ns.search('p');
