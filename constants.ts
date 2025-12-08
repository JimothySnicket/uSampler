import { Sample, SourceTab } from './types';

// Generate a random-looking waveform
const generateWaveform = (points: number): number[] => {
  return Array.from({ length: points }, () => Math.random() * 0.5 + Math.random() * 0.5);
};

export const MOCK_SAMPLES: Sample[] = [
  {
    id: '1',
    name: 'Amen_Break_Clean.wav',
    duration: '0:06',
    bpm: 174,
    size: '1.2 MB',
    waveform: generateWaveform(100),
    tags: ['Drum', 'Loop', 'Classic'],
  },
  {
    id: '2',
    name: 'Deep_Sub_Kick.wav',
    duration: '0:01',
    bpm: 140,
    size: '240 KB',
    waveform: generateWaveform(100).map(x => x * Math.exp(-1)), // Decay shape
    tags: ['Kick', 'One-shot'],
  },
  {
    id: '3',
    name: 'Ethereal_Pad_Gm.wav',
    duration: '0:12',
    bpm: 90,
    size: '3.5 MB',
    waveform: generateWaveform(100),
    tags: ['Synth', 'Pad', 'Atmosphere'],
  },
  {
    id: '4',
    name: 'Vocal_Chop_Yeah.wav',
    duration: '0:02',
    bpm: 128,
    size: '400 KB',
    waveform: generateWaveform(100),
    tags: ['Vocal', 'FX'],
  },
  {
    id: '5',
    name: 'Acid_Bass_Loop_303.wav',
    duration: '0:04',
    bpm: 135,
    size: '900 KB',
    waveform: generateWaveform(100),
    tags: ['Bass', 'Acid', 'Loop'],
  },
];

export const MOCK_TABS: SourceTab[] = [
  { id: 't1', title: 'YouTube - Lofi Hip Hop Radio', icon: 'youtube', url: 'youtube.com/watch?v=...', isActive: true },
  { id: 't2', title: 'Spotify Web Player', icon: 'spotify', url: 'open.spotify.com', isActive: false },
  { id: 't3', title: 'Splice - Sounds', icon: 'splice', url: 'splice.com', isActive: false },
  { id: 't4', title: 'Current Tab', icon: 'chrome', url: 'localhost:3000', isActive: false },
];