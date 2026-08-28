import { spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Run a synchronous fixture command while capturing output through a regular
 * file descriptor rather than Node pipe stdio. The Harness sandbox forbids
 * child-process named pipes, but Stage 15 negative fixtures still need their
 * compiler output for exact assertions.
 */
export function spawnCaptured(command, args, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'novel-smoke-spawn-'));
  const outputPath = join(dir, 'output.log');
  let fd;
  try {
    fd = openSync(outputPath, 'w');
    const isWindows = process.platform === 'win32';
    const executable = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : command;
    const commandArgs = isWindows
      ? ['/d', '/s', '/c', [command, ...args].map((value) => /[\s"&|<>^]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(' ')]
      : args;
    const result = spawnSync(executable, commandArgs, { ...options, encoding: undefined, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    fd = undefined;
    const output = readFileSync(outputPath, 'utf8');
    return { ...result, stdout: output, stderr: '', output };
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(dir, { recursive: true, force: true });
  }
}
