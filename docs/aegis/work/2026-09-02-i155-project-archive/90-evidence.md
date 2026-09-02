# I155 验收证据

## 交付结果

- Host 将完整活动作品树原子迁入 `.archive/<projectId>`，主列表只枚举活动目录。
- 原活动位置墓碑阻断归档前缓存仓储的迟到读写；统一项目路径 seam 拒绝所有新归档 ID 访问。
- 恢复校验并移除墓碑，将作品树原样迁回；元数据往返字节不变。
- 新增 `projectArchiveList/projectArchive/projectRestore` 三个 strict additive Remote；Client 归档区只提供恢复，不提供打开或编辑。

## 验收证据

- `pnpm run verify:stage-24`：通过。
- 全量测试：212 test files / 1160 tests 全绿；Stage 24 只执行一轮全量套件，随后运行累计产品流 smoke，避免重复全量 I/O 引入超时噪声。
- 生产构建：`tsc -p tsconfig.build.json` 与 `scripts/build-client.mjs` 通过，生成 `lib/client.js`。
- I155 聚焦回归：6 test files / 136 tests 全绿；覆盖仓储、Host 生命周期、Client、Remote descriptor、真实 binder 与 contract lock。
- 合同锁：历史前缀哈希保持不变；I155 三项追加为尾部，当前 186 descriptors / 92 result schemas；非法参数与非法结果均在 adapter 边界拒绝。
- Smoke：`artifacts/i155-project-archive.json` 已生成；I140、I149、I151、I153、I154 产品回归 smoke 全部通过。

## 非目标确认

未新增永久删除、自动/批量归档、归档内编辑/搜索/导出、云同步、ProjectMeta 字段、LLM 变化或 F1/F2 能力。用户工作区中的 DOCX 删除/新增未触碰、未纳入提交。
