import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoursePlanPrompt,
  buildGenerationContext,
  loadHouseStyleRubric,
  loadStyleExamples
} from '@/lib/passprep/generation-context';

test('loads house style rubric from backend asset path', async () => {
  const rubric = await loadHouseStyleRubric();
  assert.match(rubric, /Pass Prep House Style Rubric/);
  assert.match(rubric, /Avoid: “In this lesson, you will/);
});

test('loads style examples from backend assets and selects up to 3', async () => {
  const examples = await loadStyleExamples();
  assert.ok(examples.length >= 1);

  const context = await buildGenerationContext();
  assert.ok(context.styleExamples.length >= 1);
  assert.ok(context.styleExamples.length <= 3);
});

test('prompt always includes rubric and style references with no-copy instruction', async () => {
  const context = await buildGenerationContext({ maxExamples: 1 });
  const prompt = buildCoursePlanPrompt({
    bundle: { projectName: 'Bundle Alpha', videos: [{ title: 'Intro', rawText: 'Hello world' }] },
    context
  });

  assert.match(prompt, /GLOBAL CONSTRAINTS \(House Style Rubric\):/);
  assert.match(prompt, /REFERENCE OUTPUTS \(voice\/format only; do not copy topics verbatim\):/);
  assert.match(prompt, /SOURCE BUNDLE:/);
  assert.match(prompt, /Return structured JSON only/);
});
