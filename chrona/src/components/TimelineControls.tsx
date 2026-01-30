import { useEffect, useState, useCallback, useRef } from 'react';
import type { Timeline, TimelineState } from '../core/timeline';
import type { VisualizationConfig } from '../visualizations/types';

interface TimelineControlsProps {
  timeline: Timeline;
  config: VisualizationConfig;
  minYear: number;
  maxYear: number;
  onYearRangeChange?: (startYear: number, endYear: number) => void;
  accumulatePaths: boolean;
  onAccumulatePathsChange: (accumulate: boolean) => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function TimelineControls({
  timeline,
  config,
  minYear,
  maxYear,
  onYearRangeChange,
  accumulatePaths,
  onAccumulatePathsChange,
}: TimelineControlsProps) {
  const [state, setState] = useState<TimelineState>(timeline.state);
  const [isDragging, setIsDragging] = useState(false);
  const [startYear, setStartYear] = useState(timeline.start.getFullYear());
  const [endYear, setEndYear] = useState(timeline.end.getFullYear());
  const scrubberRef = useRef<HTMLDivElement>(null);

  const { controls } = config;
  const isCompact = controls.variant === 'compact';

  useEffect(() => {
    const handleUpdate = () => setState(timeline.state);
    const handleRangeChange = () => {
      setStartYear(timeline.start.getFullYear());
      setEndYear(timeline.end.getFullYear());
      setState(timeline.state);
    };

    timeline.addEventListener('tick', handleUpdate);
    timeline.addEventListener('play', handleUpdate);
    timeline.addEventListener('pause', handleUpdate);
    timeline.addEventListener('speedchange', handleUpdate);
    timeline.addEventListener('rangechange', handleRangeChange);

    return () => {
      timeline.removeEventListener('tick', handleUpdate);
      timeline.removeEventListener('play', handleUpdate);
      timeline.removeEventListener('pause', handleUpdate);
      timeline.removeEventListener('speedchange', handleUpdate);
      timeline.removeEventListener('rangechange', handleRangeChange);
    };
  }, [timeline]);

  // Notify parent of year range on mount (for compact variant)
  useEffect(() => {
    if (isCompact) {
      onYearRangeChange?.(minYear, maxYear);
    }
  }, [isCompact, minYear, maxYear, onYearRangeChange]);

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

  const handleStartYearChange = (year: number) => {
    const clampedYear = Math.max(minYear, Math.min(endYear - 1, year));
    setStartYear(clampedYear);
    timeline.setRange(
      new Date(`${clampedYear}-01-01`),
      new Date(`${endYear}-12-31`)
    );
    onYearRangeChange?.(clampedYear, endYear);
  };

  const handleEndYearChange = (year: number) => {
    const clampedYear = Math.max(startYear + 1, Math.min(maxYear, year));
    setEndYear(clampedYear);
    timeline.setRange(
      new Date(`${startYear}-01-01`),
      new Date(`${clampedYear}-12-31`)
    );
    onYearRangeChange?.(startYear, clampedYear);
  };

  const currentTime = state.currentTime;
  const currentYear = currentTime.getFullYear();
  const currentMonth = MONTH_NAMES[currentTime.getMonth()];
  const progress = timeline.progress;

  if (isCompact) {
    return (
      <div style={compactStyles.container}>
        <button
          style={compactStyles.playButton}
          onClick={() => timeline.toggle()}
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? '⏸' : '▶'}
        </button>

        <div style={compactStyles.yearDisplay}>{currentYear}</div>

        <div
          ref={scrubberRef}
          style={compactStyles.scrubber}
          onMouseDown={handleMouseDown}
        >
          <div style={compactStyles.scrubberTrack}>
            <div style={{ ...compactStyles.scrubberFill, width: `${progress * 100}%` }} />
            <div style={{ ...compactStyles.scrubberHandle, left: `${progress * 100}%` }} />
          </div>
          <div style={compactStyles.scrubberYears}>
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>

        <select
          style={compactStyles.speedSelect}
          value={state.speed}
          onChange={(e) => timeline.setSpeed(Number(e.target.value))}
        >
          {controls.speedOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {controls.showAccumulateToggle && (
          <button
            style={{
              ...compactStyles.toggleButton,
              background: accumulatePaths ? 'rgba(77, 175, 74, 0.4)' : 'transparent',
            }}
            onClick={() => onAccumulatePathsChange(!accumulatePaths)}
            title={accumulatePaths ? 'Showing cumulative' : 'Fading over time'}
          >
            {accumulatePaths ? 'Cumulative' : 'Fading'}
          </button>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div style={fullStyles.container}>
      <div style={fullStyles.dateDisplay}>
        {controls.showMonth && <span style={fullStyles.monthDisplay}>{currentMonth}</span>}
        <span style={fullStyles.yearDisplay}>{currentYear}</span>
      </div>

      {controls.showYearRange && (
        <div style={fullStyles.rangeSelector}>
          <div style={fullStyles.yearRangeDisplay}>
            <span>{startYear}</span>
            <span style={fullStyles.rangeDash}>—</span>
            <span>{endYear}</span>
          </div>
          <div style={fullStyles.sliderContainer}>
            <input
              type="range"
              min={minYear}
              max={maxYear}
              value={startYear}
              onChange={(e) => handleStartYearChange(parseInt(e.target.value))}
              style={fullStyles.slider}
            />
            <input
              type="range"
              min={minYear}
              max={maxYear}
              value={endYear}
              onChange={(e) => handleEndYearChange(parseInt(e.target.value))}
              style={fullStyles.slider}
            />
          </div>
          <div style={fullStyles.sliderLabels}>
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>
      )}

      <div
        ref={scrubberRef}
        style={fullStyles.scrubber}
        onMouseDown={handleMouseDown}
      >
        <div style={fullStyles.scrubberTrack}>
          <div
            style={{
              ...fullStyles.scrubberProgress,
              width: `${progress * 100}%`,
            }}
          />
          <div
            style={{
              ...fullStyles.scrubberHandle,
              left: `${progress * 100}%`,
            }}
          />
        </div>
        <div style={fullStyles.scrubberLabels}>
          <span>{startYear}</span>
          <span>{endYear}</span>
        </div>
      </div>

      <div style={fullStyles.controls}>
        <button
          style={fullStyles.playButton}
          onClick={() => timeline.toggle()}
          title={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? '⏸' : '▶'}
        </button>

        <select
          style={fullStyles.speedSelect}
          value={state.speed}
          onChange={(e) => timeline.setSpeed(Number(e.target.value))}
        >
          {controls.speedOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {controls.showAccumulateToggle && (
          <button
            style={{
              ...fullStyles.toggleButton,
              background: accumulatePaths ? 'rgba(77, 175, 74, 0.3)' : 'rgba(255,255,255,0.1)',
              borderColor: accumulatePaths ? '#4daf4a' : 'rgba(255,255,255,0.2)',
            }}
            onClick={() => onAccumulatePathsChange(!accumulatePaths)}
            title={accumulatePaths ? 'Showing all paths' : 'Paths fade over time'}
          >
            {accumulatePaths ? 'Accumulate' : 'Fade'}
          </button>
        )}
      </div>

      <div style={fullStyles.seasonNote}>
        {accumulatePaths ? 'Data accumulates over time' : 'Older data fades out'}
      </div>
    </div>
  );
}

const compactStyles: Record<string, React.CSSProperties> = {
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

const fullStyles: Record<string, React.CSSProperties> = {
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
    minWidth: 340,
  },
  dateDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  monthDisplay: {
    fontSize: 20,
    fontWeight: 500,
    opacity: 0.8,
  },
  yearDisplay: {
    fontSize: 48,
    fontWeight: 'bold',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  rangeSelector: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  yearRangeDisplay: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    fontSize: 16,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  rangeDash: {
    opacity: 0.4,
  },
  sliderContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  slider: {
    width: '100%',
    height: 6,
    appearance: 'none',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    cursor: 'pointer',
    accentColor: '#4daf4a',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    opacity: 0.5,
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
  toggleButton: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: 'white',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  seasonNote: {
    fontSize: 11,
    opacity: 0.5,
    fontStyle: 'italic',
  },
};
