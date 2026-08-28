/**
 * I75 负向夹具（不在主 tsconfig include 内；见 tsconfig.json）。
 *
 * 用途：证明「domain 方法签名变更在接线层即报编译错」（I75 验收负向夹具；
 * 见架构审查 §3.3 / §9#1）。重构前接线层用 `as Parameters<...>` 断言掩盖签名
 * 漂移；重构后适配闭包直接以 wire 类型调用 domain 方法，签名变更 → 编译失败。
 *
 * 运行方式（smoke-i75）：对本文件单独跑
 *   tsc --noEmit --strict --module nodenext --moduleResolution nodenext <file>
 * 必须退出码非 0，且报错定位在本文件。
 */
import { defineRemote, type RemoteMethodSpec } from '../../src/host/remote/shared.js';

/** 模拟 domain 方法签名变更：`save` 现在只接受 { mode: 'fast' }。 */
interface ChangedSaveService {
  save(input: { mode: 'fast' }): Promise<{ ok: true }>;
}

declare const changed: ChangedSaveService;

// 接线层仍按旧 wire 形状声明 input —— 签名变更后这里必须报编译错
// （{ mode: 'slow' } 不可赋值给 { mode: 'fast' }）。
// I91 对齐：`RemoteMethodSpec` 默认形参改 `readonly unknown[]`（消灭 `any[]`），
// 夹具显式给出调用形参元组保持断言意图（review v2.0 §3.1）。
const spec: RemoteMethodSpec<[input: { mode: 'slow' }]> = {
  method: 'save',
  call: (input: { mode: 'slow' }) => changed.save(input),
};

void spec;
void defineRemote;
