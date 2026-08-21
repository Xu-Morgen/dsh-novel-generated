# I31 A2 Host 配置 - Intent

## TaskIntentDraft

- Requested outcome: 完成 I31 A2 Host 配置：模板、预设、模型/采样路由与受控 ctx.llm 委托。
- Goal: 完成 I31 并以 verify:i31、smoke 和单一干净提交提供证据。
- Success evidence:
- 模板 section 顺序和预设持久化、路由/采样切换、fake adapter、ctx.llm 委托、SecretRef Host 边界和非法输入负测均通过 verify:i31。
- Stop condition: done=I31 验收和提交完成；blocked=缺少权威契约；needs-verification=实现完成但验证未绿；scope-exceeded=需要 UI、Extension 或既有 owner 语义改动。
- Non-goals:
- UI 主题、Client LLM、外层 plugin 类型、内部 Extension registry、直连 endpoint/credential。
- Scope: 仅 I31 Host-side A2 configuration；src/core/settings-index、src/llm/port、src/host 的必要 wiring、I31 tests/smoke/package scripts/work record。
- Change kinds:
- feature
- Risk hints:
- 不得引入直接 endpoint/密钥、Client LLM、主题或内部 Extension；既有 LLM consumers 需保持调用形状。

## BaselineReadSetHint

- AGENTS.md; development plan I31; design §§0.1.2,5.2; requirements R0-4,R1-A2,R3-4,R6-1,R6-4; I17 LLM port; I19/I30 consumers

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md; development plan I31; design §§0.1.2,5.2; requirements R0-4,R1-A2,R3-4,R6-1,R6-4; I17 LLM port; I19/I30 consumers
- Acknowledged before plan:
- none
- Cited in plan:
- none
- Missing refs:
- AGENTS.md; development plan I31; design §§0.1.2,5.2; requirements R0-4,R1-A2,R3-4,R6-1,R6-4; I17 LLM port; I19/I30 consumers
- Advisory decision: needs-baseline-readback

## ImpactStatementDraft

- Compatibility boundary: 保留 GenerationSettings 调用形状并仅在 Host 解析 SecretRef；不替换 ctx.llm adapter。
- Affected layers:
- A2 Host configuration and Host LLM adapter seam
- Owners:
- 新 settings-index 仅拥有配置持久化和受控解析；llm port 保持唯一 ctx.llm adapter。
- Invariants:
- Raw endpoint/key 不进入配置、客户端或 DSH stream options；上层始终传受控 resolved settings；模板 section 顺序确定。
- Non-goals:
- UI 主题、Client LLM、外层 plugin 类型、内部 Extension registry、直连 endpoint/credential。

These records are Method Pack drafts / hints, not authoritative runtime decisions.

## BaselineUsageDraft

- Required baseline refs:
- AGENTS.md; plan I31; design §§0.1.2,5.2; requirements R0-4,R1-A2,R3-4,R6-1,R6-4; I17/I19/I30 seams
- Delivered context refs:
- none
- Acknowledged before plan:
- AGENTS.md; plan I31; design §§0.1.2,5.2; requirements R0-4,R1-A2,R3-4,R6-1,R6-4; existing I17 port and I19/I30 consumers
- Cited in plan:
- design §0.1.2 Host credential/LLM ownership; §5.2 A2 template/preset/model configuration; plan I31 scope fence
- Missing refs:
- none
- Advisory decision: continue
