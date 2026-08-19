import { appendText } from './core/io/append-text.js';

export { appendText } from './core/io/append-text.js';

/** Fixed deterministic chunks used by the offline I1a generation seam. */
export const MOCK_GENERATION_CHUNKS = [
  '# 第一章\n\n',
  '雨落在旧城的青石路上，',
  '旅人推开了灯火未熄的门。\n',
] as const;

export interface MockGenerationRequest {
  projectRoot: string;
  chapterPath: string;
  input: string;
}

/**
 * Runs the I1a offline generation slice and persists its deterministic output.
 * `input` deliberately crosses the seam but does not affect output until a real
 * backend is introduced in I1b.
 */
export async function runMockGeneration(
  request: MockGenerationRequest,
): Promise<void> {
  void request.input;
  await appendText(
    request.projectRoot,
    request.chapterPath,
    MOCK_GENERATION_CHUNKS,
  );
}
