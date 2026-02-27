const fileInput = document.getElementById('fileInput');
const validationSummary = document.getElementById('validationSummary');
const generatePlanBtn = document.getElementById('generatePlanBtn');
const approvePlanBtn = document.getElementById('approvePlanBtn');
const generateWorkbookBtn = document.getElementById('generateWorkbookBtn');
const reviewArea = document.getElementById('reviewArea');
const workbookStatus = document.getElementById('workbookStatus');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportPlanMdBtn = document.getElementById('exportPlanMdBtn');
const exportWorkbookMdBtn = document.getElementById('exportWorkbookMdBtn');

let uploadedProject = null;
let courseState = null;

fileInput.addEventListener('change', handleUpload);
generatePlanBtn.addEventListener('click', generateCoursePlan);
approvePlanBtn.addEventListener('click', approvePlan);
generateWorkbookBtn.addEventListener('click', generateWorkbook);
exportJsonBtn.addEventListener('click', () => downloadFile('course-plan.json', JSON.stringify(courseState, null, 2)));
exportPlanMdBtn.addEventListener('click', () => downloadFile('course-plan.md', renderCoursePlanMarkdown(courseState)));
exportWorkbookMdBtn.addEventListener('click', () => downloadFile('workbook-draft.md', renderWorkbookMarkdown(courseState)));

async function handleUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    uploadedProject = normalizeProject(parsed);

    const report = validateProject(uploadedProject);
    validationSummary.innerHTML = reportToHtml(report);
    generatePlanBtn.disabled = !report.valid;
  } catch (err) {
    validationSummary.innerHTML = `<p>Invalid JSON file: ${err.message}</p>`;
    generatePlanBtn.disabled = true;
  }
}

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

function reportToHtml(report) {
  if (!report.valid) return '<p>Validation failed: no videos found in project.json.</p>';

  const warningBlock = report.warnings.length
    ? `<ul>${report.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>`
    : '<p>No warnings detected.</p>';

  return `
    <p><strong>Project:</strong> ${escapeHtml(report.projectName)}</p>
    <p><strong>Videos:</strong> ${report.videoCount}</p>
    <h4>Warnings</h4>
    ${warningBlock}
  `;
}

function generateCoursePlan() {
  if (!uploadedProject) return;

  const settings = {
    moduleCount: Number(document.getElementById('moduleCount').value || 4),
    titleStyle: document.getElementById('titleStyle').value,
    descriptionLength: document.getElementById('descriptionLength').value,
    workbookDepth: document.getElementById('workbookDepth').value,
    projectNotes: document.getElementById('projectNotes').value.trim()
  };

  const modules = Array.from({ length: settings.moduleCount }, (_, i) => ({
    id: `module-${i + 1}`,
    title: `Module ${i + 1}: ${moduleTheme(i)}`,
    description: `A focused segment covering ${moduleTheme(i).toLowerCase()} content.`,
    videos: []
  }));

  uploadedProject.videos.forEach((video, index) => {
    const moduleIndex = index % modules.length;
    modules[moduleIndex].videos.push(generateVideoPlan(video, settings));
  });

  courseState = {
    schemaVersion: '1.0.0',
    metadata: {
      projectName: uploadedProject.projectName,
      generatedAt: new Date().toISOString(),
      approved: false,
      settings
    },
    modules,
    workbook: null
  };

  renderReviewEditor();
  approvePlanBtn.disabled = false;
  generateWorkbookBtn.disabled = true;
  workbookStatus.textContent = 'Workbook not generated yet.';
  updateExportButtons();
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
    generatedDescription: descriptions[settings.descriptionLength]
  };
}

function renderReviewEditor() {
  if (!courseState) return;

  reviewArea.classList.remove('muted');
  reviewArea.innerHTML = '';

  courseState.modules.forEach((module, moduleIndex) => {
    const el = document.createElement('div');
    el.className = 'module';
    el.innerHTML = `
      <label>Module title
        <input data-type="module-title" data-module-index="${moduleIndex}" value="${escapeAttr(module.title)}" />
      </label>
      <div class="actions">
        <button data-action="move-module-up" data-module-index="${moduleIndex}">Move Up</button>
        <button data-action="move-module-down" data-module-index="${moduleIndex}">Move Down</button>
      </div>
      ${module.videos.map((video, videoIndex) => `
        <div class="video">
          <p><strong>Source:</strong> ${escapeHtml(video.sourceTitle)}</p>
          <label>Generated title
            <input data-type="video-title" data-module-index="${moduleIndex}" data-video-index="${videoIndex}" value="${escapeAttr(video.generatedTitle)}" />
          </label>
          <label>Generated description
            <textarea data-type="video-description" data-module-index="${moduleIndex}" data-video-index="${videoIndex}" rows="2">${escapeHtml(video.generatedDescription)}</textarea>
          </label>
          <label>Move to module
            <select data-type="video-module" data-module-index="${moduleIndex}" data-video-index="${videoIndex}">
              ${courseState.modules.map((m, idx) => `<option value="${idx}" ${idx === moduleIndex ? 'selected' : ''}>${escapeHtml(m.title)}</option>`).join('')}
            </select>
          </label>
        </div>
      `).join('')}
    `;

    reviewArea.appendChild(el);
  });

  reviewArea.querySelectorAll('input, textarea, select, button').forEach((control) => {
    control.addEventListener('change', onReviewChange);
    control.addEventListener('click', onReviewChange);
  });
}

function onReviewChange(event) {
  const target = event.target;
  const type = target.dataset.type;
  const action = target.dataset.action;

  if (action) {
    const idx = Number(target.dataset.moduleIndex);
    if (action === 'move-module-up' && idx > 0) {
      [courseState.modules[idx - 1], courseState.modules[idx]] = [courseState.modules[idx], courseState.modules[idx - 1]];
      renderReviewEditor();
    }
    if (action === 'move-module-down' && idx < courseState.modules.length - 1) {
      [courseState.modules[idx], courseState.modules[idx + 1]] = [courseState.modules[idx + 1], courseState.modules[idx]];
      renderReviewEditor();
    }
    courseState.metadata.approved = false;
    generateWorkbookBtn.disabled = true;
    return;
  }

  const moduleIndex = Number(target.dataset.moduleIndex);
  const videoIndex = Number(target.dataset.videoIndex);

  if (type === 'module-title') {
    courseState.modules[moduleIndex].title = target.value;
  }

  if (type === 'video-title') {
    courseState.modules[moduleIndex].videos[videoIndex].generatedTitle = target.value;
  }

  if (type === 'video-description') {
    courseState.modules[moduleIndex].videos[videoIndex].generatedDescription = target.value;
  }

  if (type === 'video-module') {
    const nextModuleIndex = Number(target.value);
    if (nextModuleIndex !== moduleIndex) {
      const [moved] = courseState.modules[moduleIndex].videos.splice(videoIndex, 1);
      courseState.modules[nextModuleIndex].videos.push(moved);
      renderReviewEditor();
    }
  }

  courseState.metadata.approved = false;
  generateWorkbookBtn.disabled = true;
}

function approvePlan() {
  if (!courseState) return;
  courseState.metadata.approved = true;
  generateWorkbookBtn.disabled = false;
  workbookStatus.textContent = 'Plan approved. Workbook generation is now enabled.';
}

function generateWorkbook() {
  if (!courseState?.metadata.approved) return;

  const depth = courseState.metadata.settings.workbookDepth;
  courseState.workbook = {
    generatedAt: new Date().toISOString(),
    modules: courseState.modules.map((module) => ({
      moduleId: module.id,
      moduleTitle: module.title,
      videos: module.videos.map((video) => makeWorkbookEntry(video, depth))
    }))
  };

  workbookStatus.textContent = `Workbook generated (${depth} depth).`;
  updateExportButtons();
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
    lines.push(`## Module ${moduleNumber + 1}: ${module.title.replace(/^Module\s\d+:\s*/i, '')}`);
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
    lines.push(`## Module ${moduleIndex + 1}: ${module.moduleTitle.replace(/^Module\s\d+:\s*/i, '')}`);
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

function updateExportButtons() {
  const hasCourse = Boolean(courseState);
  exportJsonBtn.disabled = !hasCourse;
  exportPlanMdBtn.disabled = !hasCourse;
  exportWorkbookMdBtn.disabled = !courseState?.workbook;
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}
