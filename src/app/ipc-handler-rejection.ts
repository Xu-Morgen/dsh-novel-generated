/** Fixed diagnostics only: no caller text, paths or secrets may cross this seam (§0.1.2). */
const messages = Object.freeze({
  'narrative-binding-invalid': '故事资料任务与当前作品或来源不一致，请重新生成故事资料。',
  'narrative-adaptation-repair-failed': '读者体验大纲输出格式不符合要求或引用校验失败，已尝试修正两次；请重试大纲步骤，已完成故事资料会保留。',
  'narrative-reveal-repair-failed': '秘密揭示计划校验失败，已尝试修正两次；请重试揭示步骤，故事资料与大纲会保留。',
  'narrative-plan-outline-invalid': '计划合并失败：大纲的角色或节拍引用不一致。重试将重新生成大纲及揭示计划，保留故事资料。',
  'narrative-plan-foundation-invalid': '计划合并失败：故事资料之间存在无效引用。重试将重新生成故事资料及后续步骤。',
  'first-import-required': 'Rule/style initialization is only allowed for the first controlled import',
  'empty-project-required': 'Rule/style import initialization requires a new empty project',
  'empty-rules-required': 'Rule/style import initialization requires empty B1',
  'empty-style-required': 'Rule/style import initialization requires empty B4',
  'narrative-output-invalid': '读者体验大纲已返回，但输出格式不符合要求，未进入秘密揭示步骤，也未写入故事资料。请重试生成。',
});
type Reason = keyof typeof messages;
const reasons = new WeakMap<object, Reason>();

/** Main may mark only a catalogued rejection; the registry never trusts Error.message. */
export class IpcHandlerRejection extends Error {
  constructor(reason: Reason) {
    super('Known IPC handler rejection');
    if (Object.hasOwn(messages, reason)) reasons.set(this, reason);
  }
}

/** Translate exact domain messages; unknown or augmented exceptions remain private. */
export function ruleStyleHandlerRejection(cause: unknown): unknown {
  if (!(cause instanceof Error)) return cause;
  const reason = (Object.keys(messages) as Reason[]).find(key => messages[key] === cause.message);
  return reason === undefined ? cause : new IpcHandlerRejection(reason);
}

/** Uses private provenance and fixed literals, including if an Error has been mutated. */
export function ipcHandlerRejectionMessage(cause: unknown): string | undefined {
  const reason = cause instanceof IpcHandlerRejection ? reasons.get(cause) : undefined;
  return reason === undefined ? undefined : messages[reason];
}
