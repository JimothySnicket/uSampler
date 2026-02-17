export interface Sample {
  id: string;
  name: string;
  duration: string; // Display string like "0:04"
  size: string;
  waveform: number[]; // Array of normalized amplitudes 0-1
  tags: string[];

  // Real Audio Props
  url?: string;
  buffer?: AudioBuffer;
  blob?: Blob;
  trimStart?: number;
  trimEnd?: number;

  // Processing States
  isTimeStretching?: boolean;
}

export interface Region {
  start: number; // 0-1 percentage
  end: number;   // 0-1 percentage
}

export interface SourceTab {
  id: string;
  title: string;
  icon: string; // url or name
  url: string;
  isActive: boolean;
}

export enum TabView {
  MAIN = 'MAIN',
  EQ = 'EQ',
  TIME_STRETCH = 'TIME_STRETCH'
}