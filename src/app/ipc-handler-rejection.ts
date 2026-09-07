/** Fixed diagnostics only: no caller text, paths or secrets may cross this seam (§0.1.2). */
const messages = Object.freeze({
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
