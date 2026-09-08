import { expect, it, vi } from 'vitest';
import { SourcePlanStep, sourcePlanInputKey } from './source-plan-step.js';

it('reuses Host identities and retries only failed or cancelled steps', async () => {
  const step = new SourcePlanStep<string>();
  const begin = vi.fn().mockResolvedValueOnce('job-1').mockResolvedValueOnce('job-2').mockResolvedValueOnce('job-3');
  const state = vi.fn().mockResolvedValue('succeeded');
  const current = () => {};
  expect(await step.acquire('input', begin, state, current)).toBe('job-1');
  expect(await step.acquire('input', begin, state, current)).toBe('job-1');
  state.mockResolvedValue('running');
  expect(await step.acquire('input', begin, state, current)).toBe('job-1');
  state.mockResolvedValue('failed');
  expect(await step.acquire('input', begin, state, current)).toBe('job-2');
  state.mockResolvedValue('cancelled');
  expect(await step.acquire('input', begin, state, current)).toBe('job-3');
  expect(begin).toHaveBeenCalledTimes(3);
});

it('invalidates changed input/upstream identities and never hides Host failures', async () => {
  const step = new SourcePlanStep<string>(); const begin = vi.fn(async () => 'job');
  const state = vi.fn(async () => 'succeeded');
  await step.acquire('source-1', begin, state, () => {});
  await step.acquire('source-2', begin, state, () => {});
  expect(begin).toHaveBeenCalledTimes(2);
  await expect(step.acquire('source-2', begin, async () => { throw new Error('unknown task'); }, () => {})).rejects.toThrow('unknown task');
  expect(begin).toHaveBeenCalledTimes(2);
  step.clear(); await step.acquire('source-2', begin, state, () => {}); expect(begin).toHaveBeenCalledTimes(3);
});

it('does not retain late responses after cancellation and hashes all effective inputs', async () => {
  const step = new SourcePlanStep<string>(); let cancelled = false;
  const current = () => { if (cancelled) throw new Error('cancelled'); };
  await expect(step.acquire('input', async () => { cancelled = true; return 'late'; }, async () => 'succeeded', current)).rejects.toThrow('cancelled');
  cancelled = false; const begin = vi.fn(async () => 'new');
  expect(await step.acquire('input', begin, async () => 'succeeded', current)).toBe('new');
  expect(begin).toHaveBeenCalledOnce();
  expect(await sourcePlanInputKey({ source: 'a', pov: 'limited' })).not.toBe(await sourcePlanInputKey({ source: 'a', pov: 'omniscient' }));
});
