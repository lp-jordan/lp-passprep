export type ProjectVideo = {
  id: string;
  title: string;
  rawText: string;
  status?: string;
};

export type NormalizedProject = {
  projectName: string;
  videos: ProjectVideo[];
};

export type ValidationReport = {
  valid: boolean;
  projectName: string;
  videoCount: number;
  warnings: string[];
};

export type Settings = {
  moduleCount: number;
  titleStyle: 'Clear & Practical' | 'Academic' | 'Inspirational';
  descriptionLength: 'Short' | 'Medium' | 'Long';
  workbookDepth: 'Light' | 'Standard' | 'Heavy';
  projectNotes: string;
};

export type CourseVideo = {
  videoId: string;
  sourceTitle: string;
  generatedTitle: string;
  generatedDescription: string;
};

export type CourseModule = {
  id: string;
  title: string;
  videos: CourseVideo[];
};

export type WorkbookSection = {
  moduleId: string;
  moduleTitle: string;
  summary: string;
  reflectionQuestions: string[];
  actionExercise: string;
};

export type Workbook = {
  generatedAt: string;
  sections: WorkbookSection[];
};

export type CourseState = {
  projectName: string;
  modules: CourseModule[];
  metadata: {
    approved: boolean;
    settings: Settings;
    generatedAt: string;
  };
  workbook: Workbook | null;
};

export function normalizeProject(input: Record<string, unknown>): NormalizedProject {
  const projectName = String(input.projectName ?? input.name ?? 'Untitled Project');
  const rawVideos = Array.isArray(input.videos) ? input.videos : [];

  const videos: ProjectVideo[] = rawVideos.map((video, index) => {
    const v = (video ?? {}) as Record<string, unknown>;
    return {
      id: String(v.id ?? `video-${index + 1}`),
      title: String(v.title ?? `Video ${index + 1}`),
      rawText: String(v.rawText ?? v.transcript ?? ''),
      status: v.status ? String(v.status) : undefined
    };
  });

  return { projectName, videos };
}

export function validateProject(project: NormalizedProject): ValidationReport {
  const warnings: string[] = [];
  const ids = new Set<string>();

  for (const video of project.videos) {
    if (ids.has(video.id)) warnings.push(`Duplicate video id: ${video.id}`);
    ids.add(video.id);

    if (!video.rawText.trim()) warnings.push(`Video ${video.id} is missing transcript text`);
    if (video.status === 'failed') warnings.push(`Video ${video.id} has failed source status`);
  }

  return {
    valid: project.videos.length > 0,
    projectName: project.projectName,
    videoCount: project.videos.length,
    warnings
  };
}

function chunkVideos<T>(items: T[], chunkCount: number): T[][] {
  const count = Math.max(1, Math.min(chunkCount, items.length || 1));
  const chunks: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => chunks[index % count].push(item));
  return chunks;
}

export function buildCourseState(project: NormalizedProject, settings: Settings): CourseState {
  const chunks = chunkVideos(project.videos, settings.moduleCount);
  const modules: CourseModule[] = chunks.map((videos, idx) => ({
    id: `module-${idx + 1}`,
    title: `Module ${idx + 1}`,
    videos: videos.map((video) => ({
      videoId: video.id,
      sourceTitle: video.title,
      generatedTitle: `${video.title} (${settings.titleStyle})`,
      generatedDescription: video.rawText.slice(0, settings.descriptionLength === 'Short' ? 90 : settings.descriptionLength === 'Medium' ? 180 : 280)
    }))
  }));

  return {
    projectName: project.projectName,
    modules,
    metadata: { approved: false, settings, generatedAt: new Date().toISOString() },
    workbook: null
  };
}

export function buildWorkbook(courseState: CourseState): Workbook {
  const questionCount =
    courseState.metadata.settings.workbookDepth === 'Light'
      ? 2
      : courseState.metadata.settings.workbookDepth === 'Standard'
        ? 3
        : 5;

  return {
    generatedAt: new Date().toISOString(),
    sections: courseState.modules.map((module) => ({
      moduleId: module.id,
      moduleTitle: module.title,
      summary: `Practice-oriented summary for ${module.title}.`,
      reflectionQuestions: Array.from({ length: questionCount }, (_, idx) => `Question ${idx + 1} for ${module.title}?`),
      actionExercise: `Complete one applied exercise based on ${module.title}.`
    }))
  };
}

export function renderCoursePlanMarkdown(courseState: CourseState): string {
  const lines = [`# ${courseState.projectName}`, '', `Generated: ${courseState.metadata.generatedAt}`, ''];
  courseState.modules.forEach((module, idx) => {
    lines.push(`## Module ${idx + 1}: ${module.title}`);
    module.videos.forEach((video) => {
      lines.push(`- **${video.generatedTitle}**`);
      lines.push(`  - Source: ${video.sourceTitle}`);
      lines.push(`  - ${video.generatedDescription}`);
    });
    lines.push('');
  });
  return lines.join('\n');
}

export function renderWorkbookMarkdown(courseState: CourseState): string {
  if (!courseState.workbook) return '# Workbook Draft\n\n_Not generated._';

  const lines = ['# Workbook Draft', '', `Generated: ${courseState.workbook.generatedAt}`, ''];
  for (const section of courseState.workbook.sections) {
    lines.push(`## ${section.moduleTitle}`);
    lines.push(section.summary, '');
    lines.push('#### Reflection Questions');
    section.reflectionQuestions.forEach((question) => lines.push(`- ${question}`));
    lines.push('', `#### Action Exercise\n${section.actionExercise}`, '');
  }
  return lines.join('\n');
}
