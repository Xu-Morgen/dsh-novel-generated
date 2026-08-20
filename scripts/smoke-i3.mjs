import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { apply } from '../lib/index.js';
import { PROJECT_DIRECTORIES } from '../lib/core/project/index.js';

const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i3-'));
try {
  const firstRoot = new Context();
  const firstFiber = await firstRoot.plugin(apply, { projectsRoot });
  const first = firstRoot.get('novelProject');
  const created = await first.createProject({ projectId: 'smoke', name: 'I3 冒烟作品' });
  for (const directory of PROJECT_DIRECTORIES) {
    if (!(await stat(join(projectsRoot, 'smoke', directory))).isDirectory()) {
      throw new Error(`missing project directory: ${directory}`);
    }
  }
  await firstFiber.dispose();

  const secondRoot = new Context();
  const secondFiber = await secondRoot.plugin(apply, { projectsRoot });
  const loaded = await secondRoot.get('novelProject').loadProject('smoke');
  if (loaded.id !== created.id || loaded.version !== 1 || loaded.name !== created.name) {
    throw new Error('project metadata did not survive a fresh Host service');
  }
  await secondFiber.dispose();
  console.log(`I3 project smoke: ${join(projectsRoot, 'smoke')}`);
} finally {
  await rm(projectsRoot, { recursive: true, force: true });
}
