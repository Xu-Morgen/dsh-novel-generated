import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { workflowPanel } from './workflow.js';
import { projectSourceAwareWorkflow } from '../source-aware-workflow.js';
import type { El } from '../shared.js';

const h: El = (tag, props, ...children) => React.createElement(tag, props, ...(children as React.ReactNode[]));
describe('I189 current task presentation', () => {
  it('does not infer completed stages from the resume position', () => {
    const markup = renderToStaticMarkup(workflowPanel(h, { state: { projectId: 'book', stage: 'finalization' },
      projectName: '长中文作品名'.repeat(16), openStage: () => {},
    }) as React.ReactElement);
    expect(markup).toContain('data-novel-workflow-stage-state="current"');
    expect(markup).not.toContain('stage-state="completed"');
    expect(markup.match(/nv-btn--primary/g)).toHaveLength(1);
    expect(markup.match(/data-novel-workflow-open-stage=/g)).toHaveLength(8);
  });
  it('keeps the unresolved source action in import and disables later stage entries', () => {
    const markup = renderToStaticMarkup(workflowPanel(h, { state: { projectId: 'book', stage: 'prose' },
      projectName: '来源未确认', openStage: () => {}, sourceAware: projectSourceAwareWorkflow({}),
    }) as React.ReactElement);
    expect(markup).toContain('data-novel-workflow-next="import"');
    expect(markup).toContain('返回来源确认');
    expect(markup.match(/disabled=""/g)).toHaveLength(7);
  });
});
