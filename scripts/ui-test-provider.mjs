import { createServer } from 'node:http';

/** Deterministic test provider. Only replaces the HTTP model boundary; production Main owns parsing and writes. */
export async function startUiTestProvider(answer) {
  const calls = [];
  const state = { fail: false, delay: 0, nullableDeltas: false };
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const prompt = JSON.parse(raw).messages[0].content;
    const custom = answer?.(prompt) ?? (prompt.includes('灵感 agent') ? { kind:'inspiration', output:JSON.stringify({directions:[
      {id:'search',title:'追踪潮痕',premise:'沿码头线索继续调查',changes:{outlineNote:'保留谜题',progressNote:'寻找见证人'},rationale:'延续悬念'},
      {id:'witness',title:'询问守灯人',premise:'从另一名见证人切入',changes:{outlineNote:'加入对话',progressNote:'核对证词'},rationale:'转换观察角度'}
    ]}) } : undefined);
    const kind = custom?.kind ?? (prompt.includes('你是小说细纲候选生成器') ? 'outline' : prompt.includes('检测器') ? 'detector' : prompt.includes('解析器') ? 'parser' : 'prose');
    calls.push({ kind, prefix: prompt.slice(0, 100) });
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.fail) { response.writeHead(503); response.end('Intentional test outage'); return; }
    const output = custom?.output ?? (kind === 'outline' ? JSON.stringify({detailBeats: [{title:'潮痕',summary:'米拉在码头发现潮痕。',pov:'mira',wordTarget:100,points:['潮痕']}],rationale:'跟随当前节拍继续调查。'}) : kind === 'detector' ? JSON.stringify({ violations: [] })
      : kind === 'parser' ? JSON.stringify({ ops: [] })
        : '米拉在码头找到铜钥匙。雨滴落在旧海图上，她收起灯，沿着潮痕走向北港。');
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const deltas = state.nullableDeltas
      ? [{ role:'assistant',content:null,reasoning_content:'Test reasoning only.' },{ content:output,reasoning_content:null },{ content:null,reasoning_content:null }]
      : [{ content:output }];
    response.end(deltas.map(delta=>`data: ${JSON.stringify({choices:[{delta}]})}\n\n`).join('')+'data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, calls, endpoint: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise(resolve => server.close(resolve)) };
}

/** Seed/read through the shipped strict bridge; no Renderer state or callbacks are replaced. */
export async function uiInvoke(app, method, ...args) {
  const result = await app.evaluate(`window.novelDesktop.invoke(${JSON.stringify('novel-creation-tool/' + method)}, ${JSON.stringify(args)})`);
  if (!result.ok) throw new Error(`${method}: ${JSON.stringify(result.error)}`);
  const value = result.value;
  if (value?.ok === false) throw new Error(`${method}: ${JSON.stringify(value.error)}`);
  return value?.ok === true && 'value' in value ? value.value : value;
}
