import { mkdir, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OpenAICompatClient } from '../src/llm/backend/openai-compat.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const projectRoot = process.env.NOVEL_PROJECT_ROOT
  ? resolve(process.env.NOVEL_PROJECT_ROOT)
  : resolve(repositoryRoot, 'projects/demo');
const logPath = resolve(projectRoot, 'logs/i1b-stream.log');

const endpoint = requireEnvironment('OPENAI_BASE_URL');
const model = requireEnvironment('OPENAI_MODEL');
const apiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
const prompt =
  process.env.I1B_PROMPT?.trim() || '写一个雨夜抵达旧城的中文小说开篇，约 200 字。';

await mkdir(resolve(projectRoot, 'logs'), { recursive: true });
const log = await open(logPath, 'w');
let chunkCount = 0;
let characterCount = 0;
let substantiveCharacterCount = 0;

try {
  await writeLog('start', { model });

  const client = new OpenAICompatClient();
  for await (const chunk of client.send({
    endpoint,
    apiKey,
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    maxRetries: 2,
  })) {
    chunkCount += 1;
    characterCount += chunk.length;
    substantiveCharacterCount += chunk.replace(/\s/gu, '').length;
    await writeLog('chunk', { sequence: chunkCount, text: chunk });
    process.stdout.write(chunk);
  }

  if (substantiveCharacterCount === 0) {
    throw new Error('Real backend stream completed without substantive text');
  }

  await writeLog('complete', {
    chunkCount,
    characterCount,
    substantiveCharacterCount,
  });
  process.stdout.write(`\n\nI1b smoke logged ${chunkCount} chunks to ${logPath}\n`);
} catch (error) {
  await writeLog('error', {
    kind: error instanceof Error ? error.name : 'UnknownError',
  });
  throw error;
} finally {
  await log.close();
}

async function writeLog(event, detail) {
  await log.appendFile(
    `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...detail })}\n`,
    'utf8',
  );
}

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required for the real I1b smoke; copy .env.example values into the process environment`,
    );
  }
  return value;
}
