import { promises as fs } from 'node:fs';
import path from 'node:path';

export type StyleExample = {
  id: string;
  label: string;
  meta?: Record<string, unknown>;
  categories: Array<{
    name: string;
    items: Array<{
      title: string;
      description: string;
    }>;
  }>;
};

export type GenerationContext = {
  houseStyleRubric: string;
  styleExamples: StyleExample[];
};

const DATA_ROOT = path.resolve(process.cwd(), 'data');
const EXAMPLES_ROOT = path.join(DATA_ROOT, 'examples');
const RUBRIC_PATH = path.join(DATA_ROOT, 'rubrics', 'house-style.md');

export async function loadHouseStyleRubric(): Promise<string> {
  return fs.readFile(RUBRIC_PATH, 'utf8');
}

export async function loadStyleExamples(): Promise<StyleExample[]> {
  const entries = await fs.readdir(EXAMPLES_ROOT);
  const files = entries.filter((entry) => entry.endsWith('.style-example.json')).sort();

  const examples = await Promise.all(
    files.map(async (file) => JSON.parse(await fs.readFile(path.join(EXAMPLES_ROOT, file), 'utf8')) as StyleExample)
  );

  return examples;
}

export async function buildGenerationContext(options?: {
  styleExampleIds?: string[];
  maxExamples?: number;
}): Promise<GenerationContext> {
  const rubric = await loadHouseStyleRubric();
  const examples = await loadStyleExamples();
  const maxExamples = Math.max(1, Math.min(options?.maxExamples ?? 3, 3));

  const selected = options?.styleExampleIds?.length
    ? examples.filter((example) => options.styleExampleIds?.includes(example.id)).slice(0, maxExamples)
    : examples.slice(0, maxExamples);

  return {
    houseStyleRubric: rubric,
    styleExamples: selected
  };
}

export function buildCoursePlanPrompt(input: {
  bundle: Record<string, unknown>;
  context: GenerationContext;
}): string {
  const { bundle, context } = input;
  return [
    'You are generating a course plan from a project bundle.',
    '',
    'GLOBAL CONSTRAINTS (House Style Rubric):',
    context.houseStyleRubric.trim(),
    '',
    'REFERENCE OUTPUTS (voice/format only; do not copy topics verbatim):',
    JSON.stringify(context.styleExamples, null, 2),
    '',
    'SOURCE BUNDLE:',
    JSON.stringify(bundle, null, 2),
    '',
    'Return structured JSON only.'
  ].join('\n');
}
