import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** Test-only CDP driver: launches the actual production Electron entry with isolated data. */
export async function launchUiElectron(iteration, executable) {
  const evidence = resolve(root, 'artifacts/desktop/ui', iteration);
  await mkdir(evidence, { recursive: true });
  const interactions = [];
  const observations = [];
  const profile = await mkdtemp(join(evidence, 'profile-'));
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  // Test process only: migration must never inspect the real user's legacy library.
  const fixtureHome = join(profile, 'test-home');
  await mkdir(fixtureHome, { recursive: true });
  const env = { ...process.env, USERPROFILE: fixtureHome };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NOVEL_DESKTOP_SMOKE;
  const child = spawn(executable ?? resolve(root, 'node_modules/electron/dist/electron.exe'), [
    '--headless', '--disable-gpu', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, ...(executable ? [] : [root]),
  ], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (data) => { log += data; });
  child.stderr.on('data', (data) => { log += data; });
  let socket;
  let id = 0;
  const pending = new Map();
  const delay = (ms) => new Promise((done) => setTimeout(done, ms));
  const until = async (fn, label, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await fn()) return;
      await delay(80);
    }
    throw new Error(`${iteration}: timeout: ${label}`);
  };
  try {
    let page;
    await until(async () => {
      if (child.exitCode !== null) throw new Error(`Electron exited ${child.exitCode}: ${log}`);
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((target) => target.type === 'page'); }
      catch { return false; }
      return page !== undefined;
    }, 'production window');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', (event) => {
      const result = JSON.parse(event.data);
      const request = pending.get(result.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(result.id);
      if (result.error) request.reject(new Error(JSON.stringify(result.error)));
      else request.done(result.result);
    });
    const send = (method, params = {}) => new Promise((done, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout ${method}`)); }, 15000);
      pending.set(requestId, { done, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = (expression, label) => until(() => evaluate(expression), label);
    await waitFor('!!document.querySelector("[data-novel-project-chooser]")', 'real project directory');
    return {
      evidence, profile, fixtureHome, send, evaluate, waitFor,
      async click(selector) {
        let bounds;
        await until(async () => {
          bounds = await evaluate(`(async () => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block:'center'}); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); const r=e.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; if (e.disabled || !e.contains(document.elementFromPoint(x,y))) return null; return {x,y}; })()`);
          return bounds !== null;
        }, `enabled and unobscured control: ${selector}`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...bounds });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...bounds });
        interactions.push({selector});
      },
      async fill(selector, text) {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
        await send('Input.insertText', { text });
      },
      async screenshot(name) {
        observations.push({name, controls:await evaluate(`Array.from(document.querySelectorAll('button, summary')).filter(e=>e.getClientRects().length>0).map(e=>({text:e.innerText,disabled:!!e.disabled,anchors:Object.fromEntries(e.getAttributeNames().filter(n=>n.startsWith('data-novel-')).map(n=>[n,e.getAttribute(n)]))}))`)});
        const result = await send('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(evidence, `${name}.png`), Buffer.from(result.data, 'base64'));
      },
      async close() {
        await writeFile(join(evidence, 'controls.json'), JSON.stringify({executable:executable ?? 'development Electron bundle',interactions,observations},null,2));
        try { await evaluate('window.close()'); } catch { /* Closing the target can precede the reply. */ }
        socket.close();
        for (const request of pending.values()) clearTimeout(request.timer);
        pending.clear();
        await until(() => child.exitCode !== null, 'lifecycle exit', 5000).catch(() => child.kill());
        await writeFile(join(evidence, 'electron.log'), log);
      },
    };
  } catch (error) {
    socket?.close();
    child.kill();
    await writeFile(join(evidence, 'electron.log'), log);
    throw error;
  }
}
