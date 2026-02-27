import { NextRequest, NextResponse } from 'next/server';
import { advanceRunStage } from '@/lib/passprep/run-store';
import { PipelineStage } from '@/lib/passprep/run-model';
import { CourseState, Settings } from '@/lib/passprep/core';

type Body = {
  stage: PipelineStage;
  status?: 'pending' | 'completed' | 'failed';
  message?: string;
  error?: {
    code?: string;
    message: string;
    details?: string;
    retriable?: boolean;
  };
  audit?: {
    durationMs?: number;
    tokenInput?: number;
    tokenOutput?: number;
    estimatedCostUsd?: number;
  };
  settings?: Settings;
  courseState?: CourseState;
  artifacts?: Record<string, unknown>;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const body = (await request.json()) as Body;

  if (!body.stage) {
    return NextResponse.json({ error: 'stage is required' }, { status: 400 });
  }

  try {
    const run = await advanceRunStage({
      runId,
      stage: body.stage,
      status: body.status,
      message: body.message,
      error: body.error,
      audit: body.audit,
      settings: body.settings,
      courseState: body.courseState,
      artifacts: body.artifacts
    });

    return NextResponse.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
