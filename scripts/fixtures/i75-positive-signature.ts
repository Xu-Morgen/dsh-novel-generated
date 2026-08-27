/**
 * I75 正对照夹具（不在主 tsconfig include 内；见 tsconfig.json）。
 *
 * 用途：证明 `defineRemote` 适配闭包在「wire 类型与 domain 方法签名一致」时
 * 编译通过 —— 即 smoke-i75 的负向夹具失败确实源于签名不匹配，而不是夹具本身
 * 的语法/导入问题。
 *
 * 运行方式（smoke-i75）：对本文件单独跑
 *   tsc --noEmit --strict --module nodenext --moduleResolution nodenext <file>
 * 必须退出码 0。
 */
import { defineRemote, type RemoteMethodSpec } from '../../src/host/remote/shared.js';

/** 模拟 domain service：save 接受 { mode: 'fast' }。 */
interface SaveService {
  save(input: { mode: 'fast' }): Promise<{ ok: true }>;
}

declare const service: SaveService;

// 适配闭包形参与 domain 方法签名一致 → 必须编译通过。
const spec: RemoteMethodSpec = {
  method: 'save',
  call: (input: { mode: 'fast' }) => service.save(input),
};

void spec;
void defineRemote;
