export interface Chop {
  id: string;
  start: number; // Normalized 0-1
  end: number; // Normalized 0-1
  startFrame: number; // Actual frame number
  endFrame: number; // Actual frame number
  buffer?: AudioBuffer; // Cached buffer for preview
  keyboardNote?: number; // MIDI note for keyboard mapping
}

export interface Sample {
  id: string;
  name: string;
  duration: string; // Display string like "0:04"
  bpm: number | string;
  size: string;
  waveform: number[]; // Array of normalized amplitudes 0-1
  tags: string[];

  // Real Audio Props
  url?: string;
  buffer?: AudioBuffer;
  blob?: Blob;
  trimStart?: number;
  trimEnd?: number;
  
  // Chopping
  chops?: Chop[]; // Array of chops for this sample
  
  // Audio Analysis
  detectedBPM?: number;
  detectedKey?: {
    key: string;
    mode: 'major' | 'minor';
    confidence: number;
  };
  isAnalyzing?: boolean;
  
  // Processing states
  isTimeStretching?: boolean;
  isSeparatingStems?: boolean;
  
  // Separated stems (if available)
  stems?: {
    vocals?: AudioBuffer;
    drums?: AudioBuffer;
    bass?: AudioBuffer;
    other?: AudioBuffer;
    accompaniment?: AudioBuffer;
  };
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
  CHOP = 'CHOP',
  EQ = 'EQ',
  FX = 'FX',
  TIME_STRETCH = 'TIME_STRETCH',
  STEM_SEPARATION = 'STEM_SEPARATION'
}