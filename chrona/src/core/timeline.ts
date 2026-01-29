export interface TimelineOptions {
  start: Date;
  end: Date;
  speed?: number; // real-time multiplier (e.g., 86400 = 1 day/sec)
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

  constructor(options: TimelineOptions) {
    super();
    this.startTime = options.start;
    this.endTime = options.end;
    this.currentTime = new Date(options.start);
    this.speed = options.speed ?? 86400 * 365; // default: 1 year/sec
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
    const newTime = this.currentTime.getTime() + simulatedDeltaMs;

    if (newTime >= this.endTime.getTime()) {
      this.currentTime = new Date(this.endTime);
      this.emitTick();
      this.pause();
      this.dispatchEvent(new Event('complete'));
      return;
    }

    this.currentTime = new Date(newTime);
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

  destroy(): void {
    this.pause();
    // Clear all event listeners would require tracking them
  }
}
