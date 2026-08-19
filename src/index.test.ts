import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it } from 'vitest';

import { apply } from './index.js';

describe('novel-creation-tool Host plugin (I1)', () => {
  it('provides the novelCreation service while the Fiber is live', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);

    expect(root.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });

    await fiber.dispose();
  });

  it('removes the novelCreation service after Fiber dispose', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);

    await fiber.dispose();

    expect(root.get('novelCreation', false)).toBeUndefined();
  });

  it('restarts cleanly on a fresh Fiber', async () => {
    const root = new Context();

    const first = await root.plugin(apply);
    await first.dispose();

    const second = await root.plugin(apply);
    expect(root.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });
    await second.dispose();
  });
});
