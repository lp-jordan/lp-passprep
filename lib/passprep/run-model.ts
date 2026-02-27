import { CourseState, NormalizedProject, Settings, ValidationReport } from '@/lib/passprep/core';

export const PIPELINE_STAGES = [
  'upload-received',
  'normalized',
  'validated',
  'plan-generated',
  'approved',
  'workbook-generated',
  'exported'
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type StageStatus = 'pending' | 'completed' | 'failed';

export type RunEvent = {
  id: string;
  runId: string;
  stage: PipelineStage;
  status: StageStatus;
  createdAt: string;
  message?: string;
  error?: {
    code?: string;
    message: string;
    details?: string;
    retriable?: boolean;
  };
  audit: {
    durationMs?: number;
    tokenInput?: number;
    tokenOutput?: number;
    estimatedCostUsd?: number;
  };
};

export type RunArtifacts = {
  sourceUpload?: Record<string, unknown>;
  normalizedProject?: NormalizedProject;
  validationReport?: ValidationReport;
  coursePlanMarkdown?: string;
  workbookMarkdown?: string;
  exports?: Array<{ type: 'json' | 'markdown'; filename: string; createdAt: string }>;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  currentStage: PipelineStage | null;
  stageStatus: Record<PipelineStage, StageStatus>;
  stageTimestamps: Partial<Record<PipelineStage, string>>;
  settings: Settings | null;
  courseState: CourseState | null;
  artifacts: RunArtifacts;
  lastError?: {
    stage: PipelineStage;
    message: string;
    details?: string;
    retriable?: boolean;
    at: string;
  };
  events: RunEvent[];
};

export type RunDb = {
  runs: Record<string, RunRecord>;
};

export function createEmptyRun(id: string, settings: Settings | null): RunRecord {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    currentStage: null,
    stageStatus: Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, 'pending'])) as Record<PipelineStage, StageStatus>,
    stageTimestamps: {},
    settings,
    courseState: null,
    artifacts: {},
    events: []
  };
}
