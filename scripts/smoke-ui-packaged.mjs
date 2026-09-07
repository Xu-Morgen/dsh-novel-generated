import { resolve } from 'node:path';
process.env.NOVEL_UI_EXECUTABLE = resolve('artifacts/desktop/win-unpacked/Novel Creation Tool.exe');
process.env.NOVEL_UI_EVIDENCE = 'i194-packaged';
await import('./smoke-i194.mjs');
