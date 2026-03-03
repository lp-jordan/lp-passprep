import { CourseModule, CourseState, CourseVideo } from '@/lib/passprep/core';
import { loadHouseStyleRubric, loadStyleExamples, StyleExample } from '@/lib/passprep/generation-context';

export type RefineScope =
  | { type: 'all' }
  | { type: 'categoryId'; categoryId: string }
  | { type: 'videoIds'; videoIds: string[] };

export type RefineReturnAction = 'returnFullState' | 'returnPatchAndState';

export type RefineOperation =
  | { type: 'updateModuleTitle'; moduleId: string; title: string }
  | { type: 'updateVideoTitle'; moduleId: string; videoId: string; title: string }
  | { type: 'updateVideoDescription'; moduleId: string; videoId: string; description: string };

export type RefinePatchPayload = {
  action: 'patch';
  operations: RefineOperation[];
};

export type RefineModelOutput =
  | RefinePatchPayload
  | {
      action: 'replaceProjectState';
      projectState: CourseState;
    };

export type RefineInput = {
  projectState: CourseState;
  userInstruction: string;
  scope: RefineScope;
  styleExampleId?: string;
};

export type RefineResult = {
  patch: RefinePatchPayload;
  updatedProjectState: CourseState;
};

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const OPENAI_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1/responses';

export class RefineInputError extends Error {}
export class RefineModelError extends Error {}

export function isValidRefineScope(input: unknown): input is RefineScope {
  if (!input || typeof input !== 'object') return false;
  const value = input as Record<string, unknown>;
  if (value.type === 'all') return true;
  if (value.type === 'categoryId') return typeof value.categoryId === 'string' && value.categoryId.trim().length > 0;
  if (value.type === 'videoIds') {
    return (
      Array.isArray(value.videoIds) &&
      value.videoIds.length > 0 &&
      value.videoIds.every((id) => typeof id === 'string' && id.trim().length > 0)
    );
  }
  return false;
}

export function buildRefinementPrompt(input: {
  projectState: CourseState;
  userInstruction: string;
  scope: RefineScope;
  rubric: string;
  styleExamples: StyleExample[];
}): string {
  const scopedProject = sliceProjectStateByScope(input.projectState, input.scope);

  return [
    'You are refining a generated course plan.',
    'Return strict JSON that matches the required schema. Do not include markdown or prose.',
    '',
    'House style rubric:',
    input.rubric.trim(),
    '',
    'Style examples (for tone/format only):',
    JSON.stringify(input.styleExamples, null, 2),
    '',
    'Refinement scope:',
    JSON.stringify(input.scope, null, 2),
    '',
    'Scoped project state (only update this scoped content):',
    JSON.stringify(scopedProject, null, 2),
    '',
    'User instruction:',
    input.userInstruction.trim()
  ].join('\n');
}

export async function runRefinement(input: RefineInput): Promise<RefineResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new RefineModelError('OPENAI_API_KEY is not configured');
  }

  const rubric = await loadHouseStyleRubric();
  const examples = await loadStyleExamples();
  const selectedExamples = pickStyleExamples(examples, input.styleExampleId);

  const prompt = buildRefinementPrompt({
    projectState: input.projectState,
    userInstruction: input.userInstruction,
    scope: input.scope,
    rubric,
    styleExamples: selectedExamples
  });

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are a JSON-only refinement engine. Never return prose.'
            }
          ]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'refine_patch_output',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: { type: 'string', enum: ['patch'] },
              operations: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['updateModuleTitle', 'updateVideoTitle', 'updateVideoDescription']
                    },
                    moduleId: { type: 'string' },
                    videoId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['type', 'moduleId']
                }
              }
            },
            required: ['action', 'operations']
          }
        }
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new RefineModelError(`Model request failed (${response.status}): ${details.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
  };

  if (!payload.output_text) {
    throw new RefineModelError('Model response did not include output_text');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.output_text);
  } catch {
    throw new RefineModelError('Model returned invalid JSON');
  }

  const validatedPatch = validatePatch(parsed);
  const updatedProjectState = applyPatch(input.projectState, validatedPatch, input.scope);

  return {
    patch: validatedPatch,
    updatedProjectState
  };
}

function pickStyleExamples(examples: StyleExample[], styleExampleId?: string): StyleExample[] {
  if (!styleExampleId) return examples.slice(0, 2);
  const exact = examples.find((example) => example.id === styleExampleId);
  if (exact) return [exact];
  return examples.slice(0, 2);
}

function sliceProjectStateByScope(projectState: CourseState, scope: RefineScope): CourseState {
  if (scope.type === 'all') return projectState;

  if (scope.type === 'categoryId') {
    return {
      ...projectState,
      modules: projectState.modules.filter((module) => module.id === scope.categoryId)
    };
  }

  const requested = new Set(scope.videoIds.map((id) => id.trim()));
  return {
    ...projectState,
    modules: projectState.modules
      .map((module) => ({
        ...module,
        videos: module.videos.filter((video) => requested.has(video.videoId))
      }))
      .filter((module) => module.videos.length > 0)
  };
}

function validatePatch(input: unknown): RefinePatchPayload {
  if (!input || typeof input !== 'object') {
    throw new RefineInputError('Malformed model output: expected object payload');
  }

  const data = input as Record<string, unknown>;
  if (data.action !== 'patch') {
    throw new RefineInputError('Malformed action in model output');
  }
  if (!Array.isArray(data.operations) || data.operations.length === 0) {
    throw new RefineInputError('Malformed operations in model output');
  }

  const operations = data.operations.map((operation, index) => validateOperation(operation, index));
  return { action: 'patch', operations };
}

function validateOperation(operation: unknown, index: number): RefineOperation {
  if (!operation || typeof operation !== 'object') {
    throw new RefineInputError(`Malformed operation at index ${index}`);
  }

  const op = operation as Record<string, unknown>;
  const moduleId = typeof op.moduleId === 'string' ? op.moduleId.trim() : '';
  if (!moduleId) {
    throw new RefineInputError(`Missing moduleId in operation at index ${index}`);
  }

  switch (op.type) {
    case 'updateModuleTitle': {
      const title = typeof op.title === 'string' ? op.title.trim() : '';
      if (!title) throw new RefineInputError(`Missing title for updateModuleTitle at index ${index}`);
      return { type: 'updateModuleTitle', moduleId, title };
    }
    case 'updateVideoTitle': {
      const videoId = typeof op.videoId === 'string' ? op.videoId.trim() : '';
      const title = typeof op.title === 'string' ? op.title.trim() : '';
      if (!videoId || !title) throw new RefineInputError(`Missing videoId/title for updateVideoTitle at index ${index}`);
      return { type: 'updateVideoTitle', moduleId, videoId, title };
    }
    case 'updateVideoDescription': {
      const videoId = typeof op.videoId === 'string' ? op.videoId.trim() : '';
      const description = typeof op.description === 'string' ? op.description.trim() : '';
      if (!videoId || !description) {
        throw new RefineInputError(`Missing videoId/description for updateVideoDescription at index ${index}`);
      }
      return { type: 'updateVideoDescription', moduleId, videoId, description };
    }
    default:
      throw new RefineInputError(`Malformed action type in operation at index ${index}`);
  }
}

function applyPatch(projectState: CourseState, patch: RefinePatchPayload, scope: RefineScope): CourseState {
  const allowedModules =
    scope.type === 'all' ? null : scope.type === 'categoryId' ? new Set([scope.categoryId]) : deriveAllowedModules(projectState, scope.videoIds);
  const allowedVideos = scope.type === 'videoIds' ? new Set(scope.videoIds) : null;

  const modules = projectState.modules.map((module) => applyOperationsToModule(module, patch.operations, allowedModules, allowedVideos));

  return {
    ...projectState,
    modules,
    metadata: {
      ...projectState.metadata,
      approved: false
    }
  };
}

function deriveAllowedModules(projectState: CourseState, requestedVideoIds: string[]): Set<string> {
  const ids = new Set(requestedVideoIds);
  const allowed = new Set<string>();
  projectState.modules.forEach((module) => {
    if (module.videos.some((video) => ids.has(video.videoId))) {
      allowed.add(module.id);
    }
  });
  return allowed;
}

function applyOperationsToModule(
  module: CourseModule,
  operations: RefineOperation[],
  allowedModules: Set<string> | null,
  allowedVideos: Set<string> | null
): CourseModule {
  if (allowedModules && !allowedModules.has(module.id)) {
    return module;
  }

  let nextModule = module;

  operations.forEach((operation) => {
    if (operation.moduleId !== module.id) return;

    if (operation.type === 'updateModuleTitle') {
      nextModule = { ...nextModule, title: operation.title };
      return;
    }

    nextModule = {
      ...nextModule,
      videos: nextModule.videos.map((video) => applyOperationToVideo(video, operation, allowedVideos))
    };
  });

  return nextModule;
}

function applyOperationToVideo(video: CourseVideo, operation: Exclude<RefineOperation, { type: 'updateModuleTitle' }>, allowedVideos: Set<string> | null): CourseVideo {
  if (allowedVideos && !allowedVideos.has(video.videoId)) return video;
  if (operation.videoId !== video.videoId) return video;

  if (operation.type === 'updateVideoTitle') {
    return { ...video, generatedTitle: operation.title };
  }

  return { ...video, generatedDescription: operation.description };
}
