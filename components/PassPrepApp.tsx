'use client';

import { ChangeEvent, DragEvent, useMemo, useState } from 'react';
import {
  buildCourseState,
  buildWorkbook,
  CourseModule,
  CourseState,
  CourseVideo,
  normalizeProject,
  renderCoursePlanMarkdown,
  renderWorkbookMarkdown,
  Settings,
  validateProject,
  ValidationReport
} from '@/lib/passprep/core';
import { PipelineStage, RunRecord } from '@/lib/passprep/run-model';
import { TilePreview } from '@/components/TilePreview';

const defaultSettings: Settings = {
  moduleCount: 4,
  titleStyle: 'Clear & Practical',
  descriptionLength: 'Medium',
  workbookDepth: 'Standard',
  projectNotes: ''
};

const steps = ['Import', 'Configure', 'Review', 'Workbook', 'Export'] as const;

export function PassPrepApp() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [uploadedProject, setUploadedProject] = useState<ReturnType<typeof normalizeProject> | null>(null);
  const [courseState, setCourseState] = useState<CourseState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [reviewView, setReviewView] = useState<'list' | 'tile'>('list');

  const canGeneratePlan = Boolean(validationReport?.valid && uploadedProject && run);

  const currentStep = useMemo(() => {
    if (!uploadedProject) return 0;
    if (!courseState) return 1;
    if (!courseState.workbook) return 2;
    if (!courseState.metadata.approved) return 3;
    return 4;
  }, [courseState, uploadedProject]);

  const workbookStatus = useMemo(() => {
    if (!uploadedProject) return 'Upload a project to enable workbook generation.';
    if (courseState?.workbook) {
      return `Workbook generated (${courseState.metadata.settings.workbookDepth} depth).`;
    }
    return 'Workbook not generated yet.';
  }, [courseState, uploadedProject]);

  async function createRunRequest(currentSettings: Settings): Promise<RunRecord> {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: currentSettings })
    });
    if (!response.ok) throw new Error('Unable to create run');
    return (await response.json()) as RunRecord;
  }

  async function advanceStage(runId: string, stage: PipelineStage, payload: Record<string, unknown>) {
    const response = await fetch(`/api/runs/${runId}/stages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, ...payload })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Unable to advance stage ${stage}`);
    }

    const nextRun = (await response.json()) as RunRecord;
    setRun(nextRun);
    return nextRun;
  }

  async function processFile(file: File) {
    const nextRun = await createRunRequest(settings);
    setRun(nextRun);
    setUploadedFilename(file.name);

    try {
      const text = await file.text();
      const raw = JSON.parse(text) as Record<string, unknown>;

      await advanceStage(nextRun.id, 'upload-received', {
        message: 'Upload received in UI',
        artifacts: { sourceUpload: raw },
        audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
      });

      const parsed = normalizeProject(raw);
      await advanceStage(nextRun.id, 'normalized', {
        artifacts: { normalizedProject: parsed },
        audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
      });

      const report = validateProject(parsed);
      await advanceStage(nextRun.id, 'validated', {
        artifacts: { validationReport: report },
        audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
      });

      setUploadError(null);
      setUploadedProject(parsed);
      setValidationReport(report);
      setCourseState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setUploadError(`Invalid JSON file: ${message}`);
      setUploadedProject(null);
      setValidationReport(null);
      setCourseState(null);
      await advanceStage(nextRun.id, 'upload-received', {
        status: 'failed',
        message: 'Upload parse failed',
        error: { message, details: 'Could not parse JSON upload', retriable: true },
        audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
      });
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function generatePlan() {
    if (!uploadedProject || !run) return;
    const nextCourseState = buildCourseState(uploadedProject, settings);
    setCourseState(nextCourseState);
    await advanceStage(run.id, 'plan-generated', {
      settings,
      courseState: nextCourseState,
      artifacts: { coursePlanMarkdown: renderCoursePlanMarkdown(nextCourseState) },
      audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
    });
  }

  function markUnapproved(next: CourseState): CourseState {
    return {
      ...next,
      metadata: { ...next.metadata, approved: false },
      workbook: next.workbook
    };
  }

  function moveModule(index: number, direction: -1 | 1) {
    if (!courseState) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= courseState.modules.length) return;

    const modules = [...courseState.modules];
    [modules[index], modules[targetIndex]] = [modules[targetIndex], modules[index]];
    setCourseState(markUnapproved({ ...courseState, modules }));
  }

  function updateModuleTitle(moduleIndex: number, title: string) {
    if (!courseState) return;
    const modules = courseState.modules.map((module: CourseModule, index: number) =>
      index === moduleIndex ? { ...module, title } : module
    );
    setCourseState(markUnapproved({ ...courseState, modules }));
  }

  function updateVideoField(
    moduleIndex: number,
    videoIndex: number,
    field: 'generatedTitle' | 'generatedDescription',
    value: string
  ) {
    if (!courseState) return;
    const modules = courseState.modules.map((module: CourseModule, mIdx: number) => {
      if (mIdx !== moduleIndex) return module;
      return {
        ...module,
        videos: module.videos.map((video: CourseVideo, vIdx: number) =>
          vIdx === videoIndex ? { ...video, [field]: value } : video
        )
      };
    });
    setCourseState(markUnapproved({ ...courseState, modules }));
  }

  function moveVideoToModule(moduleIndex: number, videoIndex: number, nextModuleIndex: number) {
    if (!courseState || moduleIndex === nextModuleIndex) return;
    const modules = courseState.modules.map((module: CourseModule) => ({ ...module, videos: [...module.videos] }));
    const [moved] = modules[moduleIndex].videos.splice(videoIndex, 1);
    modules[nextModuleIndex].videos.push(moved);
    setCourseState(markUnapproved({ ...courseState, modules }));
  }

  async function approvePlan() {
    if (!courseState || !run) return;
    const approved = { ...courseState, metadata: { ...courseState.metadata, approved: true } };
    setCourseState(approved);
    await advanceStage(run.id, 'approved', {
      courseState: approved,
      artifacts: { coursePlanMarkdown: renderCoursePlanMarkdown(approved) },
      audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
    });
  }

  async function generateWorkbookDraft() {
    if (!uploadedProject || !run) return;
    const workbookSource = courseState ?? buildCourseState(uploadedProject, settings);
    const withWorkbook = { ...workbookSource, workbook: buildWorkbook(workbookSource) };
    setCourseState(withWorkbook);
    await advanceStage(run.id, 'workbook-generated', {
      courseState: withWorkbook,
      artifacts: { workbookMarkdown: renderWorkbookMarkdown(withWorkbook) },
      audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
    });
  }

  async function trackExport(filename: string, type: 'json' | 'markdown') {
    if (!run) return;
    const exports = [...(run.artifacts.exports ?? []), { filename, type, createdAt: new Date().toISOString() }];
    await advanceStage(run.id, 'exported', {
      artifacts: { exports },
      audit: { durationMs: 0, tokenInput: 0, tokenOutput: 0, estimatedCostUsd: 0 }
    });
  }

  function exportFile(filename: string, content: string, type: 'json' | 'markdown') {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    void trackExport(filename, type);
  }

  return (
    <main className="container">
      <h1>Pass Prep</h1>
      <p className="subhead">Build and validate your course plan with a guided workflow.</p>
      {run ? <p className="helper">Run ID: {run.id}</p> : null}

      <nav className="stepper" aria-label="Workflow progress">
        {steps.map((step, index) => {
          const status = index < currentStep ? 'done' : index === currentStep ? 'active' : 'future';
          return (
            <div className={`step ${status}`} key={step}>
              <span className="dot">{status === 'done' ? '✓' : index + 1}</span>
              <span>{step}</span>
            </div>
          );
        })}
      </nav>

      <section className="card">
        <h2>Import Project</h2>
        <p className="helper">Upload a project JSON file to begin.</p>
        <label
          className={`dropzone ${dragActive ? 'active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <input type="file" accept="application/json,.json" onChange={handleUpload} />
          <span>Drop project.json here or click to upload</span>
        </label>
        <div className="summary">
          {uploadError ? (
            <p className="error">{uploadError}</p>
          ) : validationReport ? (
            <>
              <p>
                <strong>File:</strong> {uploadedFilename}
              </p>
              <p>
                <strong>Project:</strong> {validationReport.projectName}
              </p>
              <p>
                <strong>Videos:</strong> {validationReport.videoCount}
              </p>
              <p>
                <strong>Status:</strong> {validationReport.valid ? 'Valid' : 'Needs attention'}
              </p>
            </>
          ) : (
            <p className="helper">No file uploaded yet.</p>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Pre-Flight Settings</h2>
        <p className="helper">Define how the course structure should be generated.</p>
        <div className="grid four-up">
          <label>
            Module Count
            <input
              type="number"
              min={1}
              max={20}
              value={settings.moduleCount}
              onChange={(event) => setSettings((prev) => ({ ...prev, moduleCount: Number(event.target.value || 4) }))}
            />
          </label>
          <label>
            Title Style
            <select
              value={settings.titleStyle}
              onChange={(event) => setSettings((prev) => ({ ...prev, titleStyle: event.target.value as Settings['titleStyle'] }))}
            >
              <option>Clear &amp; Practical</option>
              <option>Academic</option>
              <option>Inspirational</option>
            </select>
          </label>
          <label>
            Description Length
            <select
              value={settings.descriptionLength}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, descriptionLength: event.target.value as Settings['descriptionLength'] }))
              }
            >
              <option>Short</option>
              <option>Medium</option>
              <option>Long</option>
            </select>
          </label>
          <label>
            Workbook Depth
            <select
              value={settings.workbookDepth}
              onChange={(event) => setSettings((prev) => ({ ...prev, workbookDepth: event.target.value as Settings['workbookDepth'] }))}
            >
              <option>Light</option>
              <option>Standard</option>
              <option>Heavy</option>
            </select>
          </label>
        </div>
        <label>
          Project Notes
          <textarea
            rows={4}
            placeholder="Add optional context for course generation."
            value={settings.projectNotes}
            onChange={(event) => setSettings((prev) => ({ ...prev, projectNotes: event.target.value.trim() }))}
          />
        </label>
        <div className="actions end">
          <button className="btn primary" disabled={!canGeneratePlan} onClick={generatePlan}>
            Generate Course Plan
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Course Plan Review</h2>
        {courseState ? (
          <div className="review-area">
            <div className="view-toggle" role="group" aria-label="Review view toggle">
              <button className={`btn ${reviewView === 'list' ? 'primary' : ''}`} onClick={() => setReviewView('list')}>
                List View
              </button>
              <button className={`btn ${reviewView === 'tile' ? 'primary' : ''}`} onClick={() => setReviewView('tile')}>
                Tile Preview
              </button>
            </div>

            {reviewView === 'list' ? (
              <>
                {courseState.modules.map((module: CourseModule, moduleIndex: number) => (
                  <details key={module.id} className="module" open>
                    <summary>
                      Module {moduleIndex + 1}: {module.title}
                    </summary>
                    <label>
                      Module name
                      <input value={module.title} onChange={(event) => updateModuleTitle(moduleIndex, event.target.value)} />
                    </label>
                    <div className="actions">
                      <button className="btn" onClick={() => moveModule(moduleIndex, -1)}>
                        ↑ Move Up
                      </button>
                      <button className="btn" onClick={() => moveModule(moduleIndex, 1)}>
                        ↓ Move Down
                      </button>
                    </div>
                    {module.videos.map((video: CourseVideo, videoIndex: number) => (
                      <div className="video" key={`${video.videoId}-${videoIndex}`}>
                        <p className="helper">Source: {video.sourceTitle}</p>
                        <label>
                          Title
                          <input
                            value={video.generatedTitle}
                            onChange={(event) => updateVideoField(moduleIndex, videoIndex, 'generatedTitle', event.target.value)}
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            rows={2}
                            value={video.generatedDescription}
                            onChange={(event) => updateVideoField(moduleIndex, videoIndex, 'generatedDescription', event.target.value)}
                          />
                        </label>
                        <label>
                          Move to module
                          <select
                            value={moduleIndex}
                            onChange={(event) => moveVideoToModule(moduleIndex, videoIndex, Number(event.target.value))}
                          >
                            {courseState.modules.map((courseModule: CourseModule, idx: number) => (
                              <option value={idx} key={courseModule.id}>
                                {courseModule.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </details>
                ))}
              </>
            ) : (
              <TilePreview courseState={courseState} />
            )}

            <div className="actions end">
              <button className="btn primary" onClick={approvePlan}>
                Approve Plan
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>No course plan generated yet.</p>
            <button className="btn primary" disabled={!canGeneratePlan} onClick={generatePlan}>
              Generate Plan
            </button>
          </div>
        )}
      </section>

      <section className="card secondary">
        <h2>Workbook Draft</h2>
        <p className="helper">Generate a structured markdown workbook draft from the approved plan.</p>
        <div className="actions">
          <button className="btn primary" disabled={!uploadedProject} onClick={generateWorkbookDraft}>
            Generate Workbook Draft
          </button>
        </div>
        <div className="helper">{workbookStatus}</div>
      </section>

      <section className="card">
        <h2>Export</h2>
        <div className="actions">
          <button
            className="btn primary"
            disabled={!courseState?.metadata.approved}
            onClick={() => courseState && exportFile('course-plan.json', JSON.stringify(courseState, null, 2), 'json')}
          >
            Export Course Plan (.json)
          </button>
          <button
            className="btn"
            disabled={!courseState?.metadata.approved}
            onClick={() => courseState && exportFile('course-plan.md', renderCoursePlanMarkdown(courseState), 'markdown')}
          >
            Export Course Plan (.md)
          </button>
          <button
            className="btn"
            disabled={!courseState?.workbook}
            onClick={() => courseState && exportFile('workbook-draft.md', renderWorkbookMarkdown(courseState), 'markdown')}
          >
            Export Workbook Draft (.md)
          </button>
        </div>
      </section>
    </main>
  );
}
