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
  const projectRecord = (input.project ?? {}) as Record<string, unknown>;
  const rawVideos = Array.isArray(input.videos)
    ? input.videos
    : Array.isArray(projectRecord.videos)
      ? projectRecord.videos
      : [];

  const videos: ProjectVideo[] = rawVideos.map((video, index) => {
    const v = (video ?? {}) as Record<string, unknown>;
    return {
      id: String(v.id ?? `video-${index + 1}`),
      title: String(v.title ?? `Video ${index + 1}`),
      rawText: extractTranscriptText(v),
      status: v.status ? String(v.status) : undefined
    };
  });

  return { projectName, videos };
}

function extractTranscriptText(video: Record<string, unknown>): string {
  const fromDirect = textFromUnknown(video.rawText ?? video.transcript ?? video.transcriptText ?? video.description);
  if (fromDirect) return fromDirect;

  const transcriptObject = (video.transcript ?? {}) as Record<string, unknown>;
  return (
    textFromUnknown(
      transcriptObject.text ??
        transcriptObject.rawText ??
        transcriptObject.content ??
        transcriptObject.fullText ??
        transcriptObject.transcript
    ) ??
    textFromUnknown(transcriptObject.segments ?? transcriptObject.captions ?? transcriptObject.lines) ??
    ''
  );
}

function textFromUnknown(input: unknown): string | null {
  if (typeof input === 'string') return input.trim();
  if (!input) return null;

  if (Array.isArray(input)) {
    const joined = input
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          return String(record.text ?? record.content ?? record.value ?? '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
    return joined || null;
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const candidate = String(record.text ?? record.content ?? record.value ?? '').trim();
    return candidate || null;
  }

  return String(input).trim() || null;
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
      generatedTitle: generateVideoTitle(video, settings),
      generatedDescription: generateVideoDescription(video, settings)
    }))
  }));

  return {
    projectName: project.projectName,
    modules,
    metadata: { approved: false, settings, generatedAt: new Date().toISOString() },
    workbook: null
  };
}

function generateVideoTitle(video: ProjectVideo, settings: Settings): string {
  const transcript = video.rawText.replace(/\s+/g, ' ').trim();
  const topic = transcript
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length > 20)
    ?.replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .slice(0, 6)
    .join(' ');

  const titleCore = topic || video.title;
  if (settings.titleStyle === 'Academic') return `Foundations of ${titleCore}`;
  if (settings.titleStyle === 'Inspirational') return `Unlocking ${titleCore}`;
  return `${titleCore}: Practical Breakdown`;
}

function generateVideoDescription(video: ProjectVideo, settings: Settings): string {
  const transcript = video.rawText.replace(/\s+/g, ' ').trim();
  const charTarget = settings.descriptionLength === 'Short' ? 140 : settings.descriptionLength === 'Medium' ? 260 : 420;

  if (!transcript) {
    return `Covers core ideas from "${video.title}" with a focus on real-world application.`;
  }

  const sentenceChunks = transcript
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  let result = '';
  for (const sentence of sentenceChunks) {
    if ((result + ' ' + sentence).trim().length > charTarget && result.length > 0) break;
    result = `${result} ${sentence}`.trim();
  }

  return result || transcript.slice(0, charTarget).trim();
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
