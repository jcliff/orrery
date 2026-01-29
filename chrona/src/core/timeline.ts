export interface TimelineOptions {
  start: Date;
  end: Date;
  speed?: number; // real-time multiplier (e.g., 86400 = 1 day/sec)
  seasonMonths?: [number, number]; // [startMonth, endMonth] 0-indexed, e.g., [7, 10] for Aug-Nov
}

export interface TimelineState {
  currentTime: Date;
  isPlaying: boolean;
  speed: number;
}

export interface TickEvent extends Event {
  detail: {
    currentTime: Date;
    progress: number; // 0-1
  };
}

export class Timeline extends EventTarget {
  private startTime: Date;
  private endTime: Date;
  private currentTime: Date;
  private speed: number;
  private isPlaying: boolean = false;
  private lastFrameTime: number = 0;
  private animationFrameId: number | null = null;
  private seasonMonths: [number, number] | null = null;

  constructor(options: TimelineOptions) {
    super();
    this.startTime = options.start;
    this.endTime = options.end;
    this.currentTime = new Date(options.start);
    this.speed = options.speed ?? 86400 * 365; // default: 1 year/sec
    this.seasonMonths = options.seasonMonths ?? null;

    // If season is set, snap to start of season
    if (this.seasonMonths) {
      this.snapToSeason();
    }
  }

  private snapToSeason(): void {
    if (!this.seasonMonths) return;
    const [startMonth] = this.seasonMonths;
    const year = this.currentTime.getFullYear();
    const month = this.currentTime.getMonth();

    if (month < startMonth) {
      this.currentTime = new Date(year, startMonth, 1);
    } else if (month > this.seasonMonths[1]) {
      // Move to next year's season start
      this.currentTime = new Date(year + 1, startMonth, 1);
    }
  }

  private isInSeason(date: Date): boolean {
    if (!this.seasonMonths) return true;
    const month = date.getMonth();
    return month >= this.seasonMonths[0] && month <= this.seasonMonths[1];
  }

  private advanceToNextSeason(date: Date): Date {
    if (!this.seasonMonths) return date;
    const [startMonth] = this.seasonMonths;
    const year = date.getFullYear();
    return new Date(year + 1, startMonth, 1);
  }

  get state(): TimelineState {
    return {
      currentTime: new Date(this.currentTime),
      isPlaying: this.isPlaying,
      speed: this.speed,
    };
  }

  get start(): Date {
    return new Date(this.startTime);
  }

  get end(): Date {
    return new Date(this.endTime);
  }

  get progress(): number {
    const total = this.endTime.getTime() - this.startTime.getTime();
    const current = this.currentTime.getTime() - this.startTime.getTime();
    return Math.max(0, Math.min(1, current / total));
  }

  play(): void {
    if (this.isPlaying) return;

    // If at the end, restart from beginning
    if (this.currentTime >= this.endTime) {
      this.currentTime = new Date(this.startTime);
    }

    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    this.tick();
    this.dispatchEvent(new Event('play'));
  }

  pause(): void {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.dispatchEvent(new Event('pause'));
  }

  toggle(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(date: Date): void {
    const time = date.getTime();
    const clampedTime = Math.max(
      this.startTime.getTime(),
      Math.min(this.endTime.getTime(), time)
    );
    this.currentTime = new Date(clampedTime);
    this.emitTick();
  }

  seekProgress(progress: number): void {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const total = this.endTime.getTime() - this.startTime.getTime();
    const time = this.startTime.getTime() + total * clampedProgress;
    this.currentTime = new Date(time);
    this.emitTick();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.dispatchEvent(new Event('speedchange'));
  }

  private tick(): void {
    if (!this.isPlaying) return;

    const now = performance.now();
    const deltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    // Convert real time delta to simulated time delta
    // speed is in simulated seconds per real second
    const simulatedDeltaMs = deltaMs * this.speed;
    let newTime = new Date(this.currentTime.getTime() + simulatedDeltaMs);

    // If we have a season restriction, skip months outside season
    if (this.seasonMonths && !this.isInSeason(newTime)) {
      newTime = this.advanceToNextSeason(this.currentTime);
    }

    if (newTime.getTime() >= this.endTime.getTime()) {
      this.currentTime = new Date(this.endTime);
      this.emitTick();
      this.pause();
      this.dispatchEvent(new Event('complete'));
      return;
    }

    this.currentTime = newTime;
    this.emitTick();

    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  private emitTick(): void {
    const event = new CustomEvent('tick', {
      detail: {
        currentTime: new Date(this.currentTime),
        progress: this.progress,
      },
    });
    this.dispatchEvent(event);
  }

  setRange(start: Date, end: Date): void {
    this.startTime = start;
    this.endTime = end;

    // Clamp current time to new range
    if (this.currentTime < start) {
      this.currentTime = new Date(start);
    } else if (this.currentTime > end) {
      this.currentTime = new Date(end);
    }

    if (this.seasonMonths) {
      this.snapToSeason();
    }

    this.emitTick();
    this.dispatchEvent(new Event('rangechange'));
  }

  setSeason(months: [number, number] | null): void {
    this.seasonMonths = months;
    if (months) {
      this.snapToSeason();
    }
    this.emitTick();
  }

  destroy(): void {
    this.pause();
    // Clear all event listeners would require tracking them
  }
}
