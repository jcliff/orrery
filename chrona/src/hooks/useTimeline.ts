import { useEffect, useState, useMemo } from 'react';
import { Timeline, type TimelineState } from '../core/timeline';
import type { VisualizationConfig } from '../visualizations/types';

interface UseTimelineResult {
  timeline: Timeline | null;
  state: TimelineState | null;
  currentTime: Date | null;
}

export function useTimeline(
  config: VisualizationConfig,
  dataLoaded: boolean
): UseTimelineResult {
  const [state, setState] = useState<TimelineState | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const timeline = useMemo(() => {
    if (!dataLoaded) return null;

    return new Timeline({
      start: new Date(config.timeRange.start),
      end: new Date(config.timeRange.end),
      speed: config.defaultSpeed,
      seasonMonths: config.seasonMonths,
    });
  }, [dataLoaded, config.timeRange.start, config.timeRange.end, config.defaultSpeed, config.seasonMonths]);

  useEffect(() => {
    if (!timeline) return;

    let lastUpdate = 0;
    const THROTTLE_MS = 100;

    const handleTick = (e: Event) => {
      const now = Date.now();
      if (now - lastUpdate < THROTTLE_MS) return;
      lastUpdate = now;

      const detail = (e as CustomEvent).detail;
      setCurrentTime(detail.currentTime);
      setState(timeline.state);
    };

    const handleStateChange = () => {
      setState(timeline.state);
    };

    timeline.addEventListener('tick', handleTick);
    timeline.addEventListener('play', handleStateChange);
    timeline.addEventListener('pause', handleStateChange);
    timeline.addEventListener('speedchange', handleStateChange);
    timeline.addEventListener('rangechange', handleStateChange);

    // Initialize state
    setCurrentTime(timeline.start);
    setState(timeline.state);

    return () => {
      timeline.removeEventListener('tick', handleTick);
      timeline.removeEventListener('play', handleStateChange);
      timeline.removeEventListener('pause', handleStateChange);
      timeline.removeEventListener('speedchange', handleStateChange);
      timeline.removeEventListener('rangechange', handleStateChange);
      timeline.destroy();
    };
  }, [timeline]);

  return { timeline, state, currentTime };
}
