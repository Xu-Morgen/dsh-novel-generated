import { z } from 'zod';

import { entityIdSchema } from './base.js';

/** Canonical I182 migration method ids shared by Main, Renderer, and IPC lock. */
export const DESKTOP_MIGRATION_METHOD_IDS = Object.freeze({
  preview: 'novel-creation-tool/novelMigration/preview',
  execute: 'novel-creation-tool/novelMigration/execute',
  rollback: 'novel-creation-tool/novelMigration/rollback',
} as const);

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const desktopMigrationProjectStatusSchema = z.enum(['ready', 'corrupt', 'conflict']);
export const desktopMigrationIssueSchema = z.enum([
  'missing-project-metadata',
  'invalid-project-metadata',
  'unsafe-source',
  'invalid-canonical-document',
  'destination-conflict',
  'source-changed',
]);

export const desktopMigrationProjectSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(200),
  status: desktopMigrationProjectStatusSchema,
  fileCount: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  sourceHash: hashSchema.optional(),
  issue: desktopMigrationIssueSchema.optional(),
}).strict();

export const desktopMigrationSettingStatusSchema = z.enum(['absent', 'ready', 'corrupt', 'conflict']);
export const desktopMigrationSettingSchema = z.object({
  status: desktopMigrationSettingStatusSchema,
  bytes: z.number().int().nonnegative(),
  sourceHash: hashSchema.optional(),
  issue: desktopMigrationIssueSchema.optional(),
}).strict();

export const desktopMigrationPreviewSchema = z.object({
  operationId: entityIdSchema,
  sourceFingerprint: hashSchema,
  source: z.object({
    projects: z.enum(['missing', 'ready', 'unsafe']),
    settings: z.enum(['missing', 'ready', 'unsafe']),
    projectCount: z.number().int().nonnegative(),
    invalidEntries: z.number().int().nonnegative(),
  }).strict(),
  projects: z.array(desktopMigrationProjectSchema),
  settings: z.object({
    a2: desktopMigrationSettingSchema,
    workbench: desktopMigrationSettingSchema,
  }).strict(),
  backup: z.object({ planned: z.literal(true) }).strict(),
  canExecute: z.boolean(),
  confirmation: z.object({ id: entityIdSchema, status: z.literal('pending') }).strict().nullable(),
}).strict();

export const desktopMigrationExecutionSchema = z.object({
  operationId: entityIdSchema,
  status: z.literal('completed'),
  sourceFingerprint: hashSchema,
  projectsCopied: z.number().int().nonnegative(),
  projectsSkipped: z.number().int().nonnegative(),
  settingsCopied: z.number().int().nonnegative(),
  settingsSkipped: z.number().int().nonnegative(),
  backupManifestHash: hashSchema,
}).strict();

export const desktopMigrationRollbackSchema = z.object({
  operationId: entityIdSchema,
  status: z.literal('rolled-back'),
  projectsRemoved: z.number().int().nonnegative(),
  settingsRemoved: z.number().int().nonnegative(),
}).strict();

export type DesktopMigrationProject = z.infer<typeof desktopMigrationProjectSchema>;
export type DesktopMigrationSetting = z.infer<typeof desktopMigrationSettingSchema>;
export type DesktopMigrationPreview = z.infer<typeof desktopMigrationPreviewSchema>;
export type DesktopMigrationExecution = z.infer<typeof desktopMigrationExecutionSchema>;
export type DesktopMigrationRollback = z.infer<typeof desktopMigrationRollbackSchema>;
