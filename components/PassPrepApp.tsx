'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import {
  buildCourseState,
  buildWorkbook,
  CourseState,
  normalizeProject,
  renderCoursePlanMarkdown,
  renderWorkbookMarkdown,
  Settings,
  validateProject,
  ValidationReport
} from '@/lib/passprep/core';
import { PipelineStage, RunRecord } from '@/lib/passprep/run-model';

const defaultSettings: Settings = {
  moduleCount: 4,
  titleStyle: 'Clear & Practical',
  descriptionLength: 'Medium',
  workbookDepth: 'Standard',
  projectNotes: ''
};

export function PassPrepApp() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [uploadedProject, setUploadedProject] = useState<ReturnType<typeof normalizeProject> | null>(null);
  const [courseState, setCourseState] = useState<CourseState | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);

  const canGeneratePlan = Boolean(validationReport?.valid && uploadedProject && run);

  const workbookStatus = useMemo(() => {
    if (!courseState) return '';
    if (courseState.workbook) {
      return `Workbook generated (${courseState.metadata.settings.workbookDepth} depth).`;
    }
    if (courseState.metadata.approved) {
      return 'Plan approved. Workbook generation is now enabled.';
    }
    return 'Workbook not generated yet.';
  }, [courseState]);

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

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const nextRun = await createRunRequest(settings);
    setRun(nextRun);

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
      workbook: null
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
    const modules = courseState.modules.map((module, index) =>
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
    const modules = courseState.modules.map((module, mIdx) => {
      if (mIdx !== moduleIndex) return module;
      return {
        ...module,
        videos: module.videos.map((video, vIdx) => (vIdx === videoIndex ? { ...video, [field]: value } : video))
      };
    });
    setCourseState(markUnapproved({ ...courseState, modules }));
  }

  function moveVideoToModule(moduleIndex: number, videoIndex: number, nextModuleIndex: number) {
    if (!courseState || moduleIndex === nextModuleIndex) return;
    const modules = courseState.modules.map((module) => ({ ...module, videos: [...module.videos] }));
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
    if (!courseState?.metadata.approved || !run) return;
    const withWorkbook = { ...courseState, workbook: buildWorkbook(courseState) };
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
      <h1>Pass Prep — MVP</h1>
      <p className="muted">
        Upload <code>project.json</code>, generate a structured plan, review edits, approve, and export.
      </p>
      {run ? <p className="muted">Run ID: {run.id}</p> : null}

      <section className="card">
        <h2>1) Import &amp; Validate</h2>
        <input type="file" accept="application/json,.json" onChange={handleUpload} />
        <div className="summary">
          {uploadError ? (
            <p>{uploadError}</p>
          ) : validationReport ? (
            <>
              <p>
                <strong>Project:</strong> {validationReport.projectName}
              </p>
              <p>
                <strong>Videos:</strong> {validationReport.videoCount}
              </p>
              <h4>Warnings</h4>
              {validationReport.warnings.length > 0 ? (
                <ul>
                  {validationReport.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p>No warnings detected.</p>
              )}
            </>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2>2) Pre-Flight Settings</h2>
        <div className="grid">
          <label>
            Module count
            <input
              type="number"
              min={1}
              max={20}
              value={settings.moduleCount}
              onChange={(event) => setSettings((prev) => ({ ...prev, moduleCount: Number(event.target.value || 4) }))}
            />
          </label>
          <label>
            Title style
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
            Description length
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
            Workbook depth
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
          Project notes
          <textarea
            rows={3}
            placeholder="Optional one-time instruction for generation"
            value={settings.projectNotes}
            onChange={(event) => setSettings((prev) => ({ ...prev, projectNotes: event.target.value.trim() }))}
          />
        </label>
        <button disabled={!canGeneratePlan} onClick={generatePlan}>
          Generate Course Plan
        </button>
      </section>

      <section className="card">
        <h2>3–4) Course Plan Review &amp; Edit</h2>
        {courseState ? (
          <div className="review-area">
            {courseState.modules.map((module, moduleIndex) => (
              <div key={module.id} className="module">
                <label>
                  Module title
                  <input value={module.title} onChange={(event) => updateModuleTitle(moduleIndex, event.target.value)} />
                </label>
                <div className="actions">
                  <button onClick={() => moveModule(moduleIndex, -1)}>Move Up</button>
                  <button onClick={() => moveModule(moduleIndex, 1)}>Move Down</button>
                </div>
                {module.videos.map((video, videoIndex) => (
                  <div className="video" key={`${video.videoId}-${videoIndex}`}>
                    <p>
                      <strong>Source:</strong> {video.sourceTitle}
                    </p>
                    <label>
                      Generated title
                      <input
                        value={video.generatedTitle}
                        onChange={(event) => updateVideoField(moduleIndex, videoIndex, 'generatedTitle', event.target.value)}
                      />
                    </label>
                    <label>
                      Generated description
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
                        {courseState.modules.map((courseModule, idx) => (
                          <option value={idx} key={courseModule.id}>
                            {courseModule.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="review-area muted">Generate a plan to begin review.</div>
        )}
        <div className="actions">
          <button disabled={!courseState} onClick={approvePlan}>
            Approve Plan
          </button>
        </div>
      </section>

      <section className="card">
        <h2>5) Workbook Draft</h2>
        <button disabled={!courseState?.metadata.approved} onClick={generateWorkbookDraft}>
          Generate Workbook Draft
        </button>
        <div className="muted">{workbookStatus}</div>
      </section>

      <section className="card">
        <h2>6) Export</h2>
        <div className="actions">
          <button
            disabled={!courseState}
            onClick={() => courseState && exportFile('course-plan.json', JSON.stringify(courseState, null, 2), 'json')}
          >
            Export course-plan.json
          </button>
          <button
            disabled={!courseState}
            onClick={() => courseState && exportFile('course-plan.md', renderCoursePlanMarkdown(courseState), 'markdown')}
          >
            Export course-plan.md
          </button>
          <button
            disabled={!courseState?.workbook}
            onClick={() => courseState && exportFile('workbook-draft.md', renderWorkbookMarkdown(courseState), 'markdown')}
          >
            Export workbook-draft.md
          </button>
        </div>
      </section>
    </main>
  );
}
