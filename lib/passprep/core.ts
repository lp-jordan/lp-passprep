import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProject,
  validateProject,
  buildCourseState,
  buildWorkbook,
  renderCoursePlanMarkdown,
  renderWorkbookMarkdown
} from '@/lib/passprep/core';

test('normalize + validate flags common warnings', () => {
  const project = normalizeProject({
    name: 'Demo',
    videos: [
      { id: 'a', title: 'One', rawText: '', status: 'completed' },
      { id: 'a', title: 'Two', rawText: 'hello', status: 'failed' }
    ]
  });

  const report = validateProject(project);
  assert.equal(report.valid, true);
  assert.equal(report.videoCount, 2);
  assert.equal(report.warnings.length, 3);
});

test('course state and markdown outputs are generated from structured data', () => {
  const project = normalizeProject({
    projectName: 'Sample Leadership Project',
    videos: [
      { id: 'v1', title: 'Lead Better', rawText: 'Leadership starts with listening to your team.' },
      { id: 'v2', title: 'Run Retros', rawText: 'A practical framework for weekly retrospectives.' }
    ]
  });
  const state = buildCourseState(project, {
    moduleCount: 2,
    titleStyle: 'Clear & Practical',
    descriptionLength: 'Medium',
    workbookDepth: 'Standard',
    projectNotes: ''
  });

  assert.equal(state.modules.length, 2);
  assert.equal(state.metadata.approved, false);

  const planMd = renderCoursePlanMarkdown(state);
  assert.match(planMd, /# Sample Leadership Project/);
  assert.match(planMd, /## Module 1/);

  state.metadata.approved = true;
  state.workbook = buildWorkbook(state);
  const workbookMd = renderWorkbookMarkdown(state);
  assert.match(workbookMd, /Workbook Draft/);
  assert.match(workbookMd, /#### Reflection Questions/);
});
