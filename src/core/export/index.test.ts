import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmationGate } from '../confirm/index.js';
import { exportPlainText, exportProject, importProject, parseArchive, proposePortableImport, semanticallyEqual, serializeArchive } from './index.js';

const roots: string[] = [];
async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), 'novel-i39-')); roots.push(value); return value; }
afterEach(async () => Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))));

async function fixture(): Promise<string> {
  const value = await root();
  await writeFile(join(value, 'project.yaml'), 'id: demo\nversion: 1\nname: Demo\n');
  await mkdir(join(value, 'rules'), { recursive: true });
  await writeFile(join(value, 'rules', 'rule.yaml'), 'id: rule\nversion: 1\nstatement: no\n');
  await mkdir(join(value, 'text'), { recursive: true });
  await writeFile(join(value, 'text', 'chapter.json'), JSON.stringify({ id: 'chapter', version: 1, title: '第一章', scenes: [{ id: 'scene', index: 0, content: '开头\n结尾' }] }));
  return value;
}

describe('I39 portable export/import', () => {
  it('exports versioned full and template archives with stable semantic round-trip', async () => {
    const source = await fixture();
    await mkdir(join(source, '.links'), { recursive: true });
    await writeFile(join(source, '.links', 'index.json'), '{"internal":"must not travel"}');
    await mkdir(join(source, '.search'), { recursive: true });
    await writeFile(join(source, '.search', 'index.json'), '{"derived":"must not travel"}');
    const full = await exportProject(source);
    const template = await exportProject(source, 'shareable-template');
    expect(Object.keys(full.files)).toContain('text/chapter.json');
    expect(Object.keys(full.files).some((path) => path.includes('.links') || path.includes('.search'))).toBe(false);
    expect(Object.keys(template.files)).not.toContain('text/chapter.json');
    const parsed = parseArchive(serializeArchive(full));
    expect(semanticallyEqual(full, parsed)).toBe(true);
    const plainText = await exportPlainText(source);
    expect(JSON.stringify(plainText)).not.toContain('must not travel');
    expect(JSON.stringify(plainText)).not.toContain('derived must not travel');
  });

  it('exports complete C5 text and readable settings', async () => {
    const output = await exportPlainText(await fixture());
    expect(output['chapter.txt']).toBe('开头\n结尾');
    expect(output['chapter.md']).toContain('# chapter');
    expect(output['settings/rules/rule.yaml.md']).toContain('```yaml');
  });

  it('fails closed for corrupt, unsupported, and traversal packages', async () => {
    expect(() => parseArchive('{"format":"wrong","version":1}')).toThrow(/Unsupported/);
    const archive = await exportProject(await fixture());
    expect(() => parseArchive(serializeArchive({ ...archive, files: { '../escape': 'bad' } }))).toThrow(/Invalid portable file/);
    expect(() => serializeArchive({ ...archive, files: { '.links/index.json': 'internal link metadata' } })).toThrow(/derived path/);
    expect(() => serializeArchive({ ...archive, files: { 'text/.search/index.json': 'internal search metadata' } })).toThrow(/derived path/);
  });

  it('import removes target rebuildable stores so restored content requires a fresh rebuild', async () => {
    const source = await fixture();
    const target = await root();
    await mkdir(join(target, '.links'), { recursive: true });
    await writeFile(join(target, '.links', 'index.json'), 'stale');
    await mkdir(join(target, '.search'), { recursive: true });
    await writeFile(join(target, '.search', 'index.json'), 'stale');
    await importProject(await exportProject(source), target);
    await expect(readFile(join(target, '.links', 'index.json'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(target, '.search', 'index.json'), 'utf8')).rejects.toThrow();
    expect((await exportPlainText(target))['chapter.txt']).toBe('开头\n结尾');
  });

  it('fails closed for a missing project root', async () => {
    await expect(exportProject(join(await root(), 'missing'))).rejects.toThrow();
  });
  it('does not overwrite conflicts until the I11 Gate accepts', async () => {
    const source = await fixture(); const target = await root();
    await writeFile(join(target, 'rules', 'rule.yaml'), 'old', { encoding: 'utf8' }).catch(async () => { await mkdir(join(target, 'rules'), { recursive: true }); await writeFile(join(target, 'rules', 'rule.yaml'), 'old'); });
    const archive = await exportProject(source);
    const gate = await ConfirmationGate.open(target);
    const proposal = await proposePortableImport(gate, 'portable-conflict', archive, ['rules/rule.yaml']);
    expect(proposal.status).toBe('pending');
    const pending = await importProject(archive, target, { gate, proposalId: proposal.id });
    expect(pending.status).toBe('pending');
    expect(await readFile(join(target, 'rules', 'rule.yaml'), 'utf8')).toBe('old');
    await gate.accept(proposal.id);
    expect((await importProject(archive, target, { gate, proposalId: proposal.id })).status).toBe('imported');
  });
});
