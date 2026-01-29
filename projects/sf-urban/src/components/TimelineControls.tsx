import { useEffect, useState, useCallback, useRef } from 'react';
import type { Timeline, TimelineState } from 'chrona';

interface TimelineControlsProps {
  timeline: Timeline;
  minYear?: number;
  maxYear?: number;
  onYearRangeChange?: (startYear: number, endYear: number) => void;
  accumulatePaths?: boolean;
  onAccumulatePathsChange?: (accumulate: boolean) => void;
}

const SPEED_OPTIONS = [
  { label: '1yr/s', value: 86400 * 365 },
  { label: '2yr/s', value: 86400 * 365 * 2 },
  { label: '5yr/s', value: 86400 * 365 * 5 },
  { label: '10yr/s', value: 86400 * 365 * 10 },
  { label: '20yr/s', value: 86400 * 365 * 20 },
];

export function TimelineControls({
  timeline,
  minYear = 1848,
  maxYear = 2022,
  onYearRangeChange,
  accumulatePaths = true,
  onAccumulatePathsChange,
}: TimelineControlsProps) {
  const [state, setState] = useState<TimelineState>(timeline.state);
  const [isDragging, setIsDragging] = useState(false);
  const scrubberRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleUpdate = () => setState(timeline.state);
    timeline.addEventListener('tick', handleUpdate);
    timeline.addEventListener('play', handleUpdate);
    timeline.addEventListener('pause', handleUpdate);
    timeline.addEventListener('speedchange', handleUpdate);
    timeline.addEventListener('rangechange', handleUpdate);

    return () => {
      timeline.removeEventListener('tick', handleUpdate);
      timeline.removeEventListener('play', handleUpdate);
      timeline.removeEventListener('pause', handleUpdate);
      timeline.removeEventListener('speedchange', handleUpdate);
      timeline.removeEventListener('rangechange', handleUpdate);
    };
  }, [timeline]);

  // Notify parent of year range on mount
  useEffect(() => {
    onYearRangeChange?.(minYear, maxYear);
  }, [minYear, maxYear, onYearRangeChange]);

  const handleScrub = useCallback(
    (clientX: number) => {
      if (!scrubberRef.current) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      timeline.seekProgress(progress);
    },
    [timeline]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      handleScrub(e.clientX);
    },
    [handleScrub]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => handleScrub(e.clientX);
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleScrub]);

  const currentYear = state.currentTime.getFullYear();
  const progress = timeline.progress;

  return (
    <div style={styles.container}>
      {/* Play/Pause */}
      <button
        style={styles.playButton}
        onClick={() => timeline.toggle()}
        title={state.isPlaying ? 'Pause' : 'Play'}
      >
        {state.isPlaying ? '⏸' : '▶'}
      </button>

      {/* Current Year */}
      <div style={styles.yearDisplay}>{currentYear}</div>

      {/* Scrubber */}
      <div
        ref={scrubberRef}
        style={styles.scrubber}
        onMouseDown={handleMouseDown}
      >
        <div style={styles.scrubberTrack}>
          <div style={{ ...styles.scrubberFill, width: `${progress * 100}%` }} />
          <div style={{ ...styles.scrubberHandle, left: `${progress * 100}%` }} />
        </div>
        <div style={styles.scrubberYears}>
          <span>{minYear}</span>
          <span>{maxYear}</span>
        </div>
      </div>

      {/* Speed */}
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

      {/* Accumulate Toggle */}
      <button
        style={{
          ...styles.toggleButton,
          background: accumulatePaths ? 'rgba(77, 175, 74, 0.4)' : 'transparent',
        }}
        onClick={() => onAccumulatePathsChange?.(!accumulatePaths)}
        title={accumulatePaths ? 'Buildings accumulate' : 'Buildings fade after 20 years'}
      >
        {accumulatePaths ? 'Cumulative' : 'Fading'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 20px',
    fontFamily: 'system-ui, sans-serif',
    color: 'white',
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: '#4daf4a',
    color: 'white',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  yearDisplay: {
    fontSize: 28,
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    minWidth: 70,
    flexShrink: 0,
  },
  scrubber: {
    flex: 1,
    cursor: 'pointer',
    padding: '8px 0',
  },
  scrubberTrack: {
    position: 'relative',
    height: 6,
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
  },
  scrubberFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    background: '#4daf4a',
    borderRadius: 3,
  },
  scrubberHandle: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 14,
    height: 14,
    background: 'white',
    borderRadius: '50%',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  },
  scrubberYears: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    opacity: 0.5,
    marginTop: 4,
  },
  speedSelect: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: 'white',
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  toggleButton: {
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: 'white',
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
};
