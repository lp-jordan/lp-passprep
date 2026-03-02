'use client';

import { useMemo, useState } from 'react';
import { CourseState } from '@/lib/passprep/core';

type TilePreviewProps = {
  courseState: CourseState;
  onMoveVideo: (
    sourceModuleIndex: number,
    sourceVideoIndex: number,
    targetModuleIndex: number,
    targetVideoIndex: number
  ) => void;
};

type ActiveTile = {
  categoryIndex: number;
  videoIndex: number;
};

export function TilePreview({ courseState, onMoveVideo }: TilePreviewProps) {
  const [activeTile, setActiveTile] = useState<ActiveTile | null>(null);
  const [draggingTile, setDraggingTile] = useState<ActiveTile | null>(null);

  const activeVideo = useMemo(() => {
    if (!activeTile) return null;
    const category = courseState.modules[activeTile.categoryIndex];
    if (!category) return null;
    const video = category.videos[activeTile.videoIndex];
    if (!video) return null;
    return { category, video };
  }, [activeTile, courseState.modules]);

  function closeModal() {
    setActiveTile(null);
  }

  function moveActiveTile(direction: -1 | 1) {
    if (!activeTile) return;
    const category = courseState.modules[activeTile.categoryIndex];
    if (!category) return;
    const nextIndex = activeTile.videoIndex + direction;
    if (nextIndex < 0 || nextIndex >= category.videos.length) return;
    setActiveTile({ ...activeTile, videoIndex: nextIndex });
  }

  function handleDrop(targetModuleIndex: number, targetVideoIndex: number) {
    if (!draggingTile) return;
    onMoveVideo(draggingTile.categoryIndex, draggingTile.videoIndex, targetModuleIndex, targetVideoIndex);
    setDraggingTile(null);
  }

  return (
    <div className="tile-preview" aria-label="Pass Preview tile layout">
      {courseState.modules.map((category, categoryIndex) => (
        <section className="tile-preview-module" key={category.id}>
          <header className="tile-preview-header">
            <h3>{category.title}</h3>
            <p>{category.videos.length} videos</p>
          </header>
          <div className="tile-row" role="list" aria-label={`${category.title} videos`}>
            {category.videos.map((video, videoIndex) => (
              <button
                type="button"
                role="listitem"
                className="video-tile"
                key={`${video.videoId}-${videoIndex}`}
                onClick={() => setActiveTile({ categoryIndex, videoIndex })}
                draggable
                onDragStart={() => setDraggingTile({ categoryIndex, videoIndex })}
                onDragEnd={() => setDraggingTile(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(categoryIndex, videoIndex)}
              >
                <span className="tile-thumbnail" aria-hidden="true" />
                <strong>{video.generatedTitle}</strong>
              </button>
            ))}
            <div className="tile-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={() => handleDrop(categoryIndex, category.videos.length)}>
              Drop tile here
            </div>
          </div>
        </section>
      ))}

      {activeTile && activeVideo ? (
        <div className="tile-modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="tile-modal" role="dialog" aria-modal="true" aria-label="Video details" onClick={(event) => event.stopPropagation()}>
            <p className="helper">{activeVideo.category.title}</p>
            <h3>
              {activeVideo.video.generatedTitle}
              <span className="video-source-inline">Source: {activeVideo.video.sourceTitle}</span>
            </h3>
            <p>{activeVideo.video.generatedDescription}</p>
            <div className="actions">
              <button className="btn" onClick={() => moveActiveTile(-1)} disabled={activeTile.videoIndex === 0}>
                ← Prev
              </button>
              <button
                className="btn"
                onClick={() => moveActiveTile(1)}
                disabled={activeTile.videoIndex === activeVideo.category.videos.length - 1}
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
