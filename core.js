function normalizeProject(raw) {
  const videos = raw.videos || raw.items || [];
  return {
    projectName: raw.projectName || raw.name || 'Untitled Project',
    sourceMetadata: {
      sourceFileType: 'project.json',
      importedAt: new Date().toISOString()
    },
    videos: videos.map((v, i) => ({
      id: String(v.id || v.videoId || `video-${i + 1}`),
      title: v.title || v.name || `Video ${i + 1}`,
      rawText: (v.rawText || v.transcript || '').trim(),
      duration: v.duration || v.durationSeconds || null,
      status: v.status || v.jobStatus || 'completed'
    }))
  };
}

function validateProject(project) {
  const warnings = [];
  const ids = new Set();
  let duplicateCount = 0;
  let emptyTranscripts = 0;
  let failedJobs = 0;

  for (const video of project.videos) {
    if (!video.rawText) emptyTranscripts++;
    if (String(video.status).toLowerCase().includes('fail')) failedJobs++;
    if (ids.has(video.id)) duplicateCount++;
    ids.add(video.id);
  }

  if (emptyTranscripts > 0) warnings.push(`${emptyTranscripts} video(s) have empty transcripts.`);
  if (failedJobs > 0) warnings.push(`${failedJobs} video(s) have failed job statuses.`);
  if (duplicateCount > 0) warnings.push(`${duplicateCount} duplicate video ID(s) detected.`);

  return {
    valid: Array.isArray(project.videos) && project.videos.length > 0,
    projectName: project.projectName,
    videoCount: project.videos.length,
    warnings
  };
}

function buildCourseState(project, settings) {
  const moduleCount = Math.max(1, Number(settings.moduleCount || 4));
  const modules = Array.from({ length: moduleCount }, (_, i) => ({
    id: `module-${i + 1}`,
    title: `Module ${i + 1}: ${moduleTheme(i)}`,
    description: `A focused segment covering ${moduleTheme(i).toLowerCase()} content.`,
    videos: []
  }));

  project.videos.forEach((video, index) => {
    const moduleIndex = index % modules.length;
    modules[moduleIndex].videos.push(generateVideoPlan(video, settings));
  });

  return {
    schemaVersion: '1.0.0',
    metadata: {
      projectName: project.projectName,
      generatedAt: new Date().toISOString(),
      approved: false,
      settings
    },
    modules,
    workbook: null
  };
}

function buildWorkbook(state) {
  const depth = state.metadata.settings.workbookDepth;
  return {
    generatedAt: new Date().toISOString(),
    modules: state.modules.map((module) => ({
      moduleId: module.id,
      moduleTitle: module.title,
      videos: module.videos.map((video) => makeWorkbookEntry(video, depth))
    }))
  };
}

function moduleTheme(index) {
  const themes = ['Foundations', 'Core Skills', 'Applied Practice', 'Integration', 'Mastery'];
  return themes[index % themes.length];
}

function generateVideoPlan(video, settings) {
  const base = firstWords(video.rawText, 8) || video.title;
  const titlePrefix = settings.titleStyle === 'Academic' ? 'Analysis of' : settings.titleStyle === 'Inspirational' ? 'Unlocking' : 'Understanding';
  const title = `${titlePrefix} ${base}`;

  const descriptions = {
    Short: `Introduces ${base.toLowerCase()} and practical takeaways.`,
    Medium: `Introduces ${base.toLowerCase()}, explains key context, and highlights practical application for learners.`,
    Long: `Introduces ${base.toLowerCase()}, provides contextual explanation, and outlines practical implementation steps that can be applied immediately.`
  };

  return {
    videoId: video.id,
    sourceTitle: video.title,
    duration: video.duration,
    generatedTitle: title,
    generatedDescription: descriptions[settings.descriptionLength] || descriptions.Medium
  };
}

function makeWorkbookEntry(video, depth) {
  const transcriptSeed = `${video.generatedTitle}. ${video.generatedDescription}`;
  const sentence = firstSentence(transcriptSeed);
  const keyIdeasCount = depth === 'Light' ? 2 : depth === 'Heavy' ? 5 : 3;
  const reflectionCount = depth === 'Light' ? 2 : depth === 'Heavy' ? 5 : 3;

  return {
    videoId: video.videoId,
    videoTitle: video.generatedTitle,
    summary: sentence,
    keyIdeas: Array.from({ length: keyIdeasCount }, (_, i) => `${i + 1}. ${expandIdea(sentence, i)}`),
    reflectionQuestions: Array.from({ length: reflectionCount }, (_, i) => `How can you apply ${firstWords(video.generatedTitle, 4).toLowerCase()} in scenario ${i + 1}?`),
    exercises: `Complete a short exercise mapping ${firstWords(video.generatedTitle, 5).toLowerCase()} to your current project context.`,
    actionSteps: [
      'Identify one concept to implement this week.',
      'Document your implementation outcome.',
      'Share feedback with your team.'
    ]
  };
}

function renderCoursePlanMarkdown(state) {
  const lines = [`# ${state.metadata.projectName || 'Project Name'}`, ''];

  state.modules.forEach((module, moduleNumber) => {
    lines.push(`## Module ${moduleNumber + 1}: ${module.title.replace(/^Module\\s\\d+:\\s*/i, '')}`);
    lines.push('');
    module.videos.forEach((video) => {
      lines.push(`### Video: ${video.generatedTitle}`);
      lines.push(`Description: ${video.generatedDescription}`);
      lines.push(`Duration: ${video.duration || 'N/A'}`);
      lines.push('');
    });
    lines.push('---', '');
  });

  return lines.join('\n');
}

function renderWorkbookMarkdown(state) {
  if (!state.workbook) return '# Workbook draft not generated';

  const lines = [`# ${state.metadata.projectName || 'Project Name'} — Workbook Draft`, ''];

  state.workbook.modules.forEach((module, moduleIndex) => {
    lines.push(`## Module ${moduleIndex + 1}: ${module.moduleTitle.replace(/^Module\\s\\d+:\\s*/i, '')}`);
    lines.push('');

    module.videos.forEach((video) => {
      lines.push(`### Video: ${video.videoTitle}`);
      lines.push('');
      lines.push('#### Summary');
      lines.push(video.summary);
      lines.push('');
      lines.push('#### Key Ideas');
      video.keyIdeas.forEach((idea) => lines.push(`- ${idea}`));
      lines.push('');
      lines.push('#### Reflection Questions');
      video.reflectionQuestions.forEach((q, idx) => lines.push(`${idx + 1}. ${q}`));
      lines.push('');
      lines.push('#### Exercises');
      lines.push(video.exercises);
      lines.push('');
      lines.push('#### Action Steps');
      video.actionSteps.forEach((step, idx) => lines.push(`${idx + 1}. ${step}`));
      lines.push('');
    });
  });

  return lines.join('\n');
}

function firstWords(text, count) {
  return (text || '').split(/\s+/).filter(Boolean).slice(0, count).join(' ');
}

function firstSentence(text) {
  const sentence = (text || '').split(/[.!?]/).map((s) => s.trim()).find(Boolean);
  return sentence ? `${sentence}.` : 'Summary not available.';
}

function expandIdea(seed, index) {
  return `${seed} (focus area ${index + 1})`;
}

const exported = {
  normalizeProject,
  validateProject,
  buildCourseState,
  buildWorkbook,
  renderCoursePlanMarkdown,
  renderWorkbookMarkdown
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}

if (typeof window !== 'undefined') {
  window.PassPrepCore = exported;
}
