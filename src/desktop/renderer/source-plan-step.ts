/** I202 keeps only a Host task identity; candidates are always read from the Host. */
export class SourcePlanStep<Identity> {
  private attempt?: { key: string; identity: Identity };

  clear(): void { this.attempt = undefined; }

  /** Reuse successful/in-flight tasks; only explicit acquisition retries a failed task. */
  async acquire(key: string, begin: () => Promise<Identity>, status: (identity: Identity) => Promise<string>, assertCurrent: () => void): Promise<Identity> {
    assertCurrent();
    const previous = this.attempt;
    if (previous?.key === key) {
      const state = await status(previous.identity);
      assertCurrent();
      if (state === 'succeeded' || state === 'queued' || state === 'running') return previous.identity;
      if (state !== 'failed' && state !== 'cancelled') throw new Error('生成步骤状态无法识别，请重新审阅来源。');
    }
    const identity = await begin();
    assertCurrent();
    this.attempt = { key, identity };
    return identity;
  }
}

/** Freeze all effective inputs without retaining source text or a second candidate store. */
export async function sourcePlanInputKey(input: object): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
