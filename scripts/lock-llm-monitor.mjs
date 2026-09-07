import { z } from 'zod';
import { llmMonitorSchema } from '../src/desktop/llm-monitor-contract.ts';
process.stdout.write(JSON.stringify(z.toJSONSchema(llmMonitorSchema), null, 2));
