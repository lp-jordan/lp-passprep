import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createEmptyRun, PIPELINE_STAGES, PipelineStage, RunDb, RunEvent, RunRecord, StageStatus } from '@/lib/passprep/run-model';
import { CourseState, Settings } from '@/lib/passprep/core';

const DB_DIR = path.join(process.cwd(), '.data');
const DB_PATH = path.join(DB_DIR, 'runs.json');

async function readDb(): Promise<RunDb> {
  try {
    const raw = await readFile(DB_PATH, 'utf8');
    return JSON.parse(raw) as RunDb;
  } catch {
    return { runs: {} };
  }
}

async function writeDb(db: RunDb): Promise<void> {
  await mkdir(DB_DIR, { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

export async function createRun(settings: Settings | null): Promise<RunRecord> {
  const db = await readDb();
  const runId = randomUUID();
  const run = createEmptyRun(runId, settings);
  db.runs[runId] = run;
  await writeDb(db);
  return run;
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const db = await readDb();
  return db.runs[runId] ?? null;
}

function canTransition(currentStage: PipelineStage | null, targetStage: PipelineStage): boolean {
  const currentIndex = currentStage ? PIPELINE_STAGES.indexOf(currentStage) : -1;
  const targetIndex = PIPELINE_STAGES.indexOf(targetStage);
  return targetIndex <= currentIndex + 1;
}

function mergeCourseState(existing: CourseState | null, incoming: CourseState | undefined): CourseState | null {
  if (!incoming) return existing;
  return incoming;
}

export async function advanceRunStage(params: {
  runId: string;
  stage: PipelineStage;
  status?: StageStatus;
  message?: string;
  error?: RunEvent['error'];
  audit?: RunEvent['audit'];
  settings?: Settings;
  courseState?: CourseState;
  artifacts?: Partial<RunRecord['artifacts']>;
}): Promise<RunRecord> {
  const db = await readDb();
  const run = db.runs[params.runId];
  if (!run) {
    throw new Error('Run not found');
  }

  if (!canTransition(run.currentStage, params.stage)) {
    throw new Error(`Invalid stage transition ${run.currentStage ?? 'none'} -> ${params.stage}`);
  }

  const now = new Date().toISOString();
  const status = params.status ?? (params.error ? 'failed' : 'completed');

  run.currentStage = params.stage;
  run.updatedAt = now;
  run.stageStatus[params.stage] = status;
  run.stageTimestamps[params.stage] = now;
  run.settings = params.settings ?? run.settings;
  run.courseState = mergeCourseState(run.courseState, params.courseState);
  run.artifacts = { ...run.artifacts, ...(params.artifacts ?? {}) };

  if (params.error) {
    run.lastError = {
      stage: params.stage,
      message: params.error.message,
      details: params.error.details,
      retriable: params.error.retriable,
      at: now
    };
  } else {
    run.lastError = undefined;
  }

  const event: RunEvent = {
    id: randomUUID(),
    runId: run.id,
    stage: params.stage,
    status,
    createdAt: now,
    message: params.message,
    error: params.error,
    audit: params.audit ?? {}
  };
  run.events.push(event);

  db.runs[run.id] = run;
  await writeDb(db);
  return run;
}
