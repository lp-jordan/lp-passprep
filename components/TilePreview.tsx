'use client';

import { useMemo, useState } from 'react';
import { CourseState } from '@/lib/passprep/core';

type TilePreviewProps = {
  courseState: CourseState;
};

type ActiveTile = {
  moduleIndex: number;
  videoIndex: number;
};

export function TilePreview({ courseState }: TilePreviewProps) {
  const [activeTile, setActiveTile] = useState<ActiveTile | null>(null);

  const activeVideo = useMemo(() => {
    if (!activeTile) return null;
    const module = courseState.modules[activeTile.moduleIndex];
    if (!module) return null;
    const video = module.videos[activeTile.videoIndex];
    if (!video) return null;
    return { module, video };
  }, [activeTile, courseState.modules]);

  function closeModal() {
    setActiveTile(null);
  }

  function moveActiveTile(direction: -1 | 1) {
    if (!activeTile) return;
    const module = courseState.modules[activeTile.moduleIndex];
    if (!module) return;
    const nextIndex = activeTile.videoIndex + direction;
    if (nextIndex < 0 || nextIndex >= module.videos.length) return;
    setActiveTile({ ...activeTile, videoIndex: nextIndex });
  }

  return (
    <div className="tile-preview" aria-label="LeaderPass-style tile preview">
      {courseState.modules.map((module, moduleIndex) => (
        <section className="tile-preview-module" key={module.id}>
          <header className="tile-preview-header">
            <h3>{module.title}</h3>
            <p>{module.videos.length} videos</p>
          </header>
          <div className="tile-row" role="list" aria-label={`${module.title} videos`}>
            {module.videos.map((video, videoIndex) => (
              <button
                type="button"
                role="listitem"
                className="video-tile"
                key={`${video.videoId}-${videoIndex}`}
                onClick={() => setActiveTile({ moduleIndex, videoIndex })}
              >
                <span className="tile-thumbnail" aria-hidden="true" />
                <strong>{video.generatedTitle}</strong>
              </button>
            ))}
          </div>
        </section>
      ))}

      {activeTile && activeVideo ? (
        <div className="tile-modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="tile-modal" role="dialog" aria-modal="true" aria-label="Video details" onClick={(event) => event.stopPropagation()}>
            <p className="helper">{activeVideo.module.title}</p>
            <h3>{activeVideo.video.generatedTitle}</h3>
            <p>{activeVideo.video.generatedDescription}</p>
            <div className="actions">
              <button className="btn" onClick={() => moveActiveTile(-1)} disabled={activeTile.videoIndex === 0}>
                ← Prev
              </button>
              <button
                className="btn"
                onClick={() => moveActiveTile(1)}
                disabled={activeTile.videoIndex === activeVideo.module.videos.length - 1}
              >
                Next →
              </button>
              <button className="btn primary" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
