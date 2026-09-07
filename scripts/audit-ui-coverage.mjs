import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';

// Observations are captured from actual Electron DOM; declarations are only the index.
const ledger = JSON.parse(await readFile('docs/ui/ui-button-implementation.json', 'utf8'));
assert.equal(ledger.records.length, 241);
assert.equal(new Set(ledger.records.map(row => row.id)).size, 241);
const runs = await Promise.all([...Array.from({length:7},(_,i)=>`i${188+i}`),'i194-packaged'].map(async name => ({
  name, ...JSON.parse(await readFile(`artifacts/desktop/ui/${name}/controls.json`, 'utf8')),
})));
const records = [];
for (const row of ledger.records) {
  assert.ok(['implemented','merged','retired'].includes(row.status), row.id);
  assert.ok(row.implementationEvidence.length && row.deterministicEvidence.length, row.id);
  for (const file of row.deterministicEvidence) await access(file);
  const attributes = row.anchor.match(/data-novel-[a-z0-9-]+/g) ?? [];
  const observed = [], clicked = [], labels = new Set();
  for (const run of runs) {
    for (const observation of run.observations) {
      for (const control of observation.controls) {
        if (attributes.some(attribute => attribute in control.anchors)) {
          observed.push(`${run.name}/${observation.name}`);
          labels.add(control.text);
        }
      }
    }
    for (const interaction of run.interactions) {
      if (attributes.some(attribute=>interaction.selector.includes(`[${attribute}`))) clicked.push(`${run.name}: ${interaction.selector}`);
    }
  }
  records.push({id:row.id,status:row.status,observed:[...new Set(observed)],clicked:[...new Set(clicked)],labels:[...labels],deterministicEvidence:row.deterministicEvidence});
}
const result = {
  declarationCount:241, implementation:ledger.summary,
  // A shared attribute identifies a control family; it does not count all loop instances.
  measurement:'原生点击/实际可见 DOM 按锚点族映射；不表示所有循环实例或条件分支均被点击。',
  observedDeclarationFamilies:records.filter(row=>row.observed.length).length,
  clickedDeclarationFamilies:records.filter(row=>row.clicked.length).length,
  actualMouseActions:runs.reduce((n,run)=>n+run.interactions.length,0),
  screenshots:runs.reduce((n,run)=>n+run.observations.length,0), records,
};
await writeFile('artifacts/desktop/ui/button-coverage.json',JSON.stringify(result,null,2));
console.log(`UI ledger: 241 classified; ${result.observedDeclarationFamilies} families observed, ${result.clickedDeclarationFamilies} clicked; ${result.actualMouseActions} actual mouse actions.`);
