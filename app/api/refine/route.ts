import { NextRequest, NextResponse } from 'next/server';
import { CourseState } from '@/lib/passprep/core';
import { RefinementScope } from '@/lib/passprep/refinement';

type RefineRequest = {
  instruction?: string;
  courseState?: CourseState;
  scope?: RefinementScope;
};

function toInstructionSuffix(instruction: string): string {
  return instruction.trim().replace(/\s+/g, ' ').slice(0, 140);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as RefineRequest;
  if (!body.courseState || !body.instruction?.trim() || !body.scope) {
    return NextResponse.json({ error: 'courseState, instruction, and scope are required' }, { status: 400 });
  }

  const instruction = toInstructionSuffix(body.instruction);
  const scope = body.scope;
  const requestedVideoIds = scope.videoIds
    .split(',')
    .map((videoId) => videoId.trim())
    .filter(Boolean);

  let updatedVideos = 0;

  const nextModules = body.courseState.modules.map((module) => {
    const moduleSelected =
      scope.mode === 'global' ||
      scope.target === 'all' ||
      (scope.target === 'categoryId' && scope.categoryId.trim() === module.id);

    const videos = module.videos.map((video) => {
      const videoSelected =
        moduleSelected || (scope.target === 'videoIds' && requestedVideoIds.length > 0 && requestedVideoIds.includes(video.videoId));

      if (!videoSelected) return video;

      const shouldChangeTitle = scope.mode === 'global' || scope.target !== 'descriptions-only';
      const shouldChangeDescription = scope.mode === 'global' || scope.target !== 'titles-only';

      updatedVideos += 1;

      return {
        ...video,
        generatedTitle: shouldChangeTitle ? `${video.generatedTitle} · Refined` : video.generatedTitle,
        generatedDescription: shouldChangeDescription
          ? `${video.generatedDescription}\n\nRefinement note: ${instruction}`
          : video.generatedDescription
      };
    });

    return {
      ...module,
      title: moduleSelected && (scope.mode === 'global' || scope.target !== 'descriptions-only') ? `${module.title} · Refined` : module.title,
      videos
    };
  });

  return NextResponse.json({
    courseState: {
      ...body.courseState,
      modules: nextModules,
      metadata: {
        ...body.courseState.metadata,
        approved: false
      }
    },
    message: `Applied refinement to ${updatedVideos} video${updatedVideos === 1 ? '' : 's'} (${scope.mode}/${scope.target}).`
  });
}
