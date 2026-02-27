const {
  normalizeProject,
  validateProject,
  buildCourseState,
  buildWorkbook,
  renderCoursePlanMarkdown,
  renderWorkbookMarkdown
} = window.PassPrepCore;

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
    uploadedProject = normalizeProject(JSON.parse(text));
    const report = validateProject(uploadedProject);
    validationSummary.innerHTML = reportToHtml(report);
    generatePlanBtn.disabled = !report.valid;
  } catch (err) {
    validationSummary.innerHTML = `<p>Invalid JSON file: ${err.message}</p>`;
    generatePlanBtn.disabled = true;
  }
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

function readSettings() {
  return {
    moduleCount: Number(document.getElementById('moduleCount').value || 4),
    titleStyle: document.getElementById('titleStyle').value,
    descriptionLength: document.getElementById('descriptionLength').value,
    workbookDepth: document.getElementById('workbookDepth').value,
    projectNotes: document.getElementById('projectNotes').value.trim()
  };
}

function generateCoursePlan() {
  if (!uploadedProject) return;
  courseState = buildCourseState(uploadedProject, readSettings());
  renderReviewEditor();
  approvePlanBtn.disabled = false;
  generateWorkbookBtn.disabled = true;
  workbookStatus.textContent = 'Workbook not generated yet.';
  updateExportButtons();
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
    markUnapproved();
    return;
  }

  const moduleIndex = Number(target.dataset.moduleIndex);
  const videoIndex = Number(target.dataset.videoIndex);

  if (type === 'module-title') {
    courseState.modules[moduleIndex].title = target.value;
  } else if (type === 'video-title') {
    courseState.modules[moduleIndex].videos[videoIndex].generatedTitle = target.value;
  } else if (type === 'video-description') {
    courseState.modules[moduleIndex].videos[videoIndex].generatedDescription = target.value;
  } else if (type === 'video-module') {
    const nextModuleIndex = Number(target.value);
    if (nextModuleIndex !== moduleIndex) {
      const [moved] = courseState.modules[moduleIndex].videos.splice(videoIndex, 1);
      courseState.modules[nextModuleIndex].videos.push(moved);
      renderReviewEditor();
    }
  }

  markUnapproved();
}

function markUnapproved() {
  courseState.metadata.approved = false;
  courseState.workbook = null;
  generateWorkbookBtn.disabled = true;
  workbookStatus.textContent = 'Changes detected. Re-approve plan before generating workbook.';
  updateExportButtons();
}

function approvePlan() {
  if (!courseState) return;
  courseState.metadata.approved = true;
  generateWorkbookBtn.disabled = false;
  workbookStatus.textContent = 'Plan approved. Workbook generation is now enabled.';
}

function generateWorkbook() {
  if (!courseState?.metadata.approved) return;
  courseState.workbook = buildWorkbook(courseState);
  workbookStatus.textContent = `Workbook generated (${courseState.metadata.settings.workbookDepth} depth).`;
  updateExportButtons();
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
