/**
 * I95 test-harness 拆分（计划 §18 I95）：共享 FakeNode 类型，被 fake runtime /
 * DOM helpers / onboarding fixtures 引用。
 */
export interface FakeNode { tag: string; props: Record<string, unknown> | null; children: unknown[]; }
