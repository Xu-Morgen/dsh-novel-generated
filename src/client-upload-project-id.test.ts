import { describe, expect, it } from 'vitest';
import { entityIdSchema } from './core/schema/base.js';
import { projectIdForUpload } from './client/upload.js';

describe('DOCX import project id allocation', () => {
  it('keeps Chinese and same-name imports distinct by Host upload session', () => {
    const first = projectIdForUpload('续作', '11111111-1111-4111-8111-111111111111');
    const second = projectIdForUpload('续作', '22222222-2222-4222-8222-222222222222');

    expect(first).toBe('untitled-11111111-1111-4111-8111-111111111111');
    expect(second).not.toBe(first);
    expect(entityIdSchema.safeParse(first).success).toBe(true);
    expect(entityIdSchema.safeParse(second).success).toBe(true);
  });

  it('truncates a long visible slug while preserving the unique upload suffix', () => {
    const uploadId = '33333333-3333-4333-8333-333333333333';
    const projectId = projectIdForUpload('a'.repeat(200), uploadId);

    expect(projectId).toHaveLength(64);
    expect(projectId.endsWith(`-${uploadId}`)).toBe(true);
    expect(entityIdSchema.safeParse(projectId).success).toBe(true);
  });
});
