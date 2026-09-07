import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchUiElectron } from './ui-electron-session.mjs';

const app = await launchUiElectron('i190');
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); };
const select = async (selector, value) => {
  await app.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
};
try {
  await app.fill('[data-novel-project-name-input]', '来源审阅验收');
  await app.click('[data-novel-project-create]');
  await app.waitFor('!!document.querySelector("[data-novel-workflow-next-action]")', 'created workspace');
  await app.click('[data-novel-workflow-next-action]');
  await app.waitFor('!!document.querySelector("[data-novel-source-import-submit]")', 'source entry');
  check('empty source cannot proceed', await app.evaluate('document.querySelector("[data-novel-source-import-submit]").disabled'));
  await app.screenshot('empty-source');
  const source = '北岸有一座旧灯塔。守塔人等待一封迟到的信。\n\n故事从雨夜开始，主角寻找失踪的家人。';
  await app.fill('[data-novel-source-import-text]', source);
  await app.click('[data-novel-source-import-submit]');
  await app.waitFor('!!document.querySelector("[data-novel-import-interpretation-status=failed]")', 'real unconfigured-provider failure');
  check('provider failure retains original source and blocks unresolved confirmation', await app.evaluate(`document.querySelector('[data-novel-import-interpretation-segment-text]').value===${JSON.stringify(source)} && document.querySelector('[data-novel-import-interpretation-confirm]').disabled`));
  await app.screenshot('source-failure-unresolved');
  await app.click('[data-novel-import-interpretation-retry]');
  await app.waitFor('!!document.querySelector("[data-novel-import-interpretation-status=failed]") && !document.querySelector("[data-novel-import-interpretation-retry]").disabled', 'retry failure');
  check('same source survives a retry failure', await app.evaluate(`document.querySelector('[data-novel-import-interpretation-segment-text]').value===${JSON.stringify(source)}`));
  await app.evaluate(`(() => { const e=document.querySelector('[data-novel-import-interpretation-segment-text]'); e.focus(); e.setSelectionRange(12,12); e.click(); })()`);
  await app.click('[data-novel-import-interpretation-split]');
  await app.waitFor('document.querySelectorAll("[data-novel-import-interpretation-paragraph]").length===2 && !!document.querySelector("[data-novel-import-interpretation-status=failed]")', 'split preserves source ranges');
  await app.click('[data-novel-import-interpretation-merge-next]');
  await app.waitFor('document.querySelectorAll("[data-novel-import-interpretation-paragraph]").length===1 && !!document.querySelector("[data-novel-import-interpretation-status=failed]")', 'merge source ranges');
  check('real split and merge retain exact source text', await app.evaluate(`document.querySelector('[data-novel-import-interpretation-segment-text]').value===${JSON.stringify(source)}`));
  await select('[data-novel-import-interpretation-source-role]', 'idea');
  await select('[data-novel-import-interpretation-treatment]', 'expand-outline');
  check('overall intent does not resolve pending paragraphs', await app.evaluate('document.querySelector("[data-novel-import-interpretation-confirm]").disabled'));
  // I162 explicitly treats changing a paragraph type as an edited-and-retained decision.
  await select('[data-novel-import-interpretation-paragraph-role]', 'plot-plan');
  await app.click('[data-novel-import-interpretation-accept]');
  await app.waitFor('!document.querySelector("[data-novel-import-interpretation-confirm]").disabled', 'manual source decisions');
  check('retain decision is explicit and enables confirmation', await app.evaluate(`document.querySelector('[data-novel-import-interpretation-accept]').getAttribute('aria-pressed')==='true' && document.querySelector('[data-novel-import-unresolved-count]').textContent.includes('0')`));
  await app.click('[data-novel-import-interpretation-reject]');
  check('exclude can replace retain without becoming a destructive action', await app.evaluate(`document.querySelector('[data-novel-import-interpretation-reject]').getAttribute('aria-pressed')==='true' && document.querySelector('[data-novel-import-interpretation-accept]').getAttribute('aria-pressed')==='false'`));
  await app.click('[data-novel-import-interpretation-accept]');
  for (const width of [1440, 720, 440]) {
    await app.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await app.evaluate(`document.querySelector('[data-novel-import-interpretation-segment-text]').scrollIntoView({block:'start'})`);
    const layout = await app.evaluate(`Array.from(document.querySelectorAll('.nv-workbench__main, .nv-onboarding-stack, .nv-import-review, .nv-import-review__paragraph')).map(e=>({className:e.className,width:e.clientWidth,scrollWidth:e.scrollWidth}))`);
    await writeFile(join(app.evidence, `layout-${width}.json`), JSON.stringify(layout, null, 2));
    check(`source view has no content overflow at ${width}`, layout.every(item => item.scrollWidth <= item.width + 1));
    await app.screenshot(`source-review-${width}`);
  }
  await app.evaluate(`document.querySelector('[data-novel-import-help="paragraph-source-type"]').focus()`);
  await app.waitFor(`getComputedStyle(document.querySelector('[data-novel-import-tooltip="paragraph-source-type"]')).visibility==='visible'`, 'focused help');
  const help = await app.evaluate(`(() => { const e=document.querySelector('[data-novel-import-tooltip="paragraph-source-type"]'); const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}; })()`);
  await writeFile(join(app.evidence, 'help-layout.json'), JSON.stringify(help, null, 2));
  check('keyboard-accessible narrow help stays in the viewport', help.left >= 0 && help.right <= help.width && help.bottom <= help.height);
  await app.send('Emulation.clearDeviceMetricsOverride');
  await app.click('[data-novel-import-interpretation-cancel]');
  await app.waitFor('!!document.querySelector("[data-novel-import-interpretation-status=cancelled]")', 'cancel review');
  check('cancel keeps original input available', await app.evaluate(`document.querySelector('[data-novel-source-import-text]').value===${JSON.stringify(source)}`));
  await writeFile(join(app.evidence, 'validation.json'), JSON.stringify({ iteration: 'I190', scope: 'Actual production Electron, real Main normalization/session/failure/retry/manual decisions. Unconfigured provider is an intentional negative fixture; successful LLM/initialization paths remain covered by existing mock/held-out regressions.', checks }, null, 2));
  process.stdout.write(`I190: ${checks.length} real Electron UI checks passed; ${app.evidence}\n`);
} finally { await app.close(); }
