import { NextRequest, NextResponse } from 'next/server';
import { CourseState } from '@/lib/passprep/core';
import {
  isValidRefineScope,
  RefineInputError,
  RefineModelError,
  RefineReturnAction,
  runRefinement
} from '@/lib/passprep/refine';

type RefineRequestBody = {
  projectState?: CourseState;
  userInstruction?: string;
  scope?: unknown;
  styleExampleId?: string;
  action?: RefineReturnAction;
};

function isValidAction(action: unknown): action is RefineReturnAction {
  return action === undefined || action === 'returnFullState' || action === 'returnPatchAndState';
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RefineRequestBody;

  if (!body.projectState) {
    return NextResponse.json({ error: 'Missing required field: projectState' }, { status: 400 });
  }

  if (typeof body.userInstruction !== 'string' || !body.userInstruction.trim()) {
    return NextResponse.json({ error: 'Missing required field: userInstruction' }, { status: 400 });
  }

  if (!isValidRefineScope(body.scope)) {
    return NextResponse.json(
      {
        error:
          "Malformed scope. Expected {type:'all'} | {type:'categoryId',categoryId:string} | {type:'videoIds',videoIds:string[]}."
      },
      { status: 400 }
    );
  }

  if (!isValidAction(body.action)) {
    return NextResponse.json(
      { error: "Malformed action. Allowed values: 'returnFullState' | 'returnPatchAndState'." },
      { status: 400 }
    );
  }

  try {
    const result = await runRefinement({
      projectState: body.projectState,
      userInstruction: body.userInstruction,
      scope: body.scope,
      styleExampleId: body.styleExampleId
    });

    if (body.action === 'returnFullState') {
      return NextResponse.json({ projectState: result.updatedProjectState });
    }

    return NextResponse.json({
      patch: result.patch,
      updatedProjectState: result.updatedProjectState
    });
  } catch (error) {
    if (error instanceof RefineInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof RefineModelError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    const message = error instanceof Error ? error.message : 'Unexpected refinement server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
