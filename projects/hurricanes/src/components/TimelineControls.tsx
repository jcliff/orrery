import { useEffect, useState, useCallback, useRef } from 'react';
import type { Timeline, TimelineState } from 'chrona';

interface TimelineControlsProps {
  timeline: Timeline;
}

const SPEED_OPTIONS = [
  { label: '1 year/sec', value: 86400 * 365 },
  { label: '2 years/sec', value: 86400 * 365 * 2 },
  { label: '5 years/sec', value: 86400 * 365 * 5 },
  { label: '10 years/sec', value: 86400 * 365 * 10 },
];

export function TimelineControls({ timeline }: TimelineControlsProps) {
  const [state, setState] = useState<TimelineState>(timeline.state);
  const [isDragging, setIsDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleTick = () => setState(timeline.state);
    const handlePlay = () => setState(timeline.state);
    const handlePause = () => setState(timeline.state);
    const handleSpeedChange = () => setState(timeline.state);

    timeline.addEventListener('tick', handleTick);
    timeline.addEventListener('play', handlePlay);
    timeline.addEventListener('pause', handlePause);
    timeline.addEventListener('speedchange', handleSpeedChange);

    return () => {
      timeline.removeEventListener('tick', handleTick);
      timeline.removeEventListener('play', handlePlay);
      timeline.removeEventListener('pause', handlePause);
      timeline.removeEventListener('speedchange', handleSpeedChange);
    };
  }, [timeline]);

  const handleScrubberClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrubberRef.current) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      timeline.seekProgress(progress);
    },
    [timeline]
  );

  const handleScrubberDrag = useCallback(
    (e: MouseEvent) => {
      if (!scrubberRef.current || !isDragging) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      timeline.seekProgress(progress);
    },
    [timeline, isDragging]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      handleScrubberClick(e);
    },
    [handleScrubberClick]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleScrubberDrag);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleScrubberDrag);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleScrubberDrag, handleMouseUp]);

  const currentYear = state.currentTime.getFullYear();
  const startYear = timeline.start.getFullYear();
  const endYear = timeline.end.getFullYear();
  const progress = timeline.progress;

  return (
    <div style={styles.container}>
      {/* Year Display */}
      <div style={styles.yearDisplay}>{currentYear}</div>

      {/* Scrubber */}
      <div
        ref={scrubberRef}
        style={styles.scrubber}
        onMouseDown={handleMouseDown}
      >
        <div style={styles.scrubberTrack}>
          <div
            style={{
              ...styles.scrubberProgress,
              width: `${progress * 100}%`,
            }}
          />
          <div
            style={{
              ...styles.scrubberHandle,
              left: `${progress * 100}%`,
            }}
          />
        </div>
        <div style={styles.scrubberLabels}>
          <span>{startYear}</span>
          <span>{endYear}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <button
          style={styles.playButton}
          onClick={() => timeline.toggle()}
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? '⏸' : '▶'}
        </button>

        <select
          style={styles.speedSelect}
          value={state.speed}
          onChange={(e) => timeline.setSpeed(Number(e.target.value))}
        >
          {SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)',
    color: 'white',
    padding: '16px 24px',
    borderRadius: 12,
    fontFamily: 'system-ui, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    minWidth: 300,
  },
  yearDisplay: {
    fontSize: 48,
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  scrubber: {
    width: '100%',
    cursor: 'pointer',
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrubberTrack: {
    position: 'relative',
    height: 6,
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
  },
  scrubberProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: '#4daf4a',
    borderRadius: 3,
    transition: 'width 0.05s linear',
  },
  scrubberHandle: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 14,
    height: 14,
    background: 'white',
    borderRadius: '50%',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  scrubberLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    opacity: 0.6,
    marginTop: 6,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: 'none',
    background: '#4daf4a',
    color: 'white',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedSelect: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
};
