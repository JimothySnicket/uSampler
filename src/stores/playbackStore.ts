import { create } from 'zustand';
import { Region, Chop } from '../../types';
import { AudioEngine } from '../core/AudioEngine';

interface SampleState {
    region: Region;
    chops: Chop[];
    activeChopId: string | null;
}

interface EQSettings {
    enabled: boolean;
    lowGain: number;
    midGain: number;
    highGain: number;
    lowFreq: number;
    midFreq: number;
    highFreq: number;
    midQ: number;
}

interface ADSRSettings {
    mode: 'envelope' | 'gate';
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    gateThreshold: number;
    gateRatio: number;
    gateAttack: number;
    gateRelease: number;
}

interface PlaybackState {
    // Global playback state
    activeSampleId: string;
    isPlaying: boolean;
    isLooping: boolean;
    playbackTime: { current: number; total: number };

    // Per-sample state map (using Record instead of Map for Zustand compatibility)
    sampleStates: Record<string, SampleState>;

    // Effects (global, reset on sample change)
    eqSettings: EQSettings;
    timeStretchRatio: number;
    timeStretchEnabled: boolean;
    adsrSettings: ADSRSettings;

    isPreviewingStretch: boolean;

    // Actions
    setActiveSample: (sampleId: string) => void;
    setRegion: (sampleId: string, region: Region) => void;
    setChops: (sampleId: string, chops: Chop[]) => void;
    setActiveChopId: (sampleId: string, chopId: string | null) => void;
    setLooping: (looping: boolean) => void;
    setPlaying: (playing: boolean) => void;
    setPlaybackTime: (time: { current: number; total: number }) => void;
    resetEffects: () => void;
    syncWithEngine: (engine: AudioEngine | null) => void;

    // Getters
    getSampleRegion: (sampleId: string) => Region;
    getSampleChops: (sampleId: string) => Chop[];
    getActiveChopId: (sampleId: string) => string | null;

    // EQ actions
    setEQEnabled: (enabled: boolean) => void;
    setEQGain: (band: 'low' | 'mid' | 'high', gain: number) => void;
    setEQFreq: (band: 'low' | 'mid' | 'high', freq: number) => void;
    setMidQ: (q: number) => void;

    // Time stretch
    setTimeStretchRatio: (ratio: number) => void;
    setTimeStretchEnabled: (enabled: boolean) => void;
    setPreviewingStretch: (previewing: boolean) => void;
}

const defaultSampleState: SampleState = {
    region: { start: 0, end: 1 },
    chops: [],
    activeChopId: null,
};

const defaultEQSettings: EQSettings = {
    enabled: false,
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    lowFreq: 100,
    midFreq: 1000,
    highFreq: 8000,
    midQ: 1.2,
};

const defaultADSRSettings: ADSRSettings = {
    mode: 'envelope',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.2,
    gateThreshold: -20,
    gateRatio: 4,
    gateAttack: 0.01,
    gateRelease: 0.1,
};

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
    // Initial state
    activeSampleId: '',
    isPlaying: false,
    isLooping: false,
    playbackTime: { current: 0, total: 0 },
    sampleStates: {} as Record<string, SampleState>,
    eqSettings: defaultEQSettings,
    timeStretchRatio: 1.0,
    timeStretchEnabled: false,
    adsrSettings: defaultADSRSettings,

    isPreviewingStretch: false,

    // Getters
    getSampleRegion: (sampleId: string) => {
        const state = get().sampleStates[sampleId];
        return state?.region || { start: 0, end: 1 };
    },

    getSampleChops: (sampleId: string) => {
        const state = get().sampleStates[sampleId];
        return state?.chops || [];
    },

    getActiveChopId: (sampleId: string) => {
        const state = get().sampleStates[sampleId];
        return state?.activeChopId || null;
    },

    // Actions
    setActiveSample: (sampleId: string) => {
        const currentState = get();

        // Save current sample's state before switching
        if (currentState.activeSampleId) {
            const currentSampleState = currentState.sampleStates[currentState.activeSampleId] || defaultSampleState;
            const newSampleStates = { ...currentState.sampleStates };
            newSampleStates[currentState.activeSampleId] = currentSampleState;

            set({
                sampleStates: newSampleStates,
            });
        }

        // Load or initialize state for new sample
        const newSampleStates = { ...currentState.sampleStates };
        if (!newSampleStates[sampleId]) {
            newSampleStates[sampleId] = { ...defaultSampleState };
        }

        // Reset effects when switching samples (but preserve loop state)
        set({
            activeSampleId: sampleId,
            sampleStates: newSampleStates,
            eqSettings: defaultEQSettings,
            timeStretchRatio: 1.0,
            timeStretchEnabled: false,

            isPreviewingStretch: false,
            // Don't reset isLooping - preserve user's loop preference
        });
    },

    setRegion: (sampleId: string, region: Region) => {
        const currentState = get();
        const sampleState = currentState.sampleStates[sampleId] || { ...defaultSampleState };
        const newSampleStates = { ...currentState.sampleStates };
        newSampleStates[sampleId] = {
            ...sampleState,
            region,
        };
        set({ sampleStates: newSampleStates });
    },

    setChops: (sampleId: string, chops: Chop[]) => {
        const currentState = get();
        const sampleState = currentState.sampleStates[sampleId] || { ...defaultSampleState };
        const newSampleStates = { ...currentState.sampleStates };
        newSampleStates[sampleId] = {
            ...sampleState,
            chops,
        };
        set({ sampleStates: newSampleStates });
    },

    setActiveChopId: (sampleId: string, chopId: string | null) => {
        const currentState = get();
        const sampleState = currentState.sampleStates[sampleId] || { ...defaultSampleState };
        const newSampleStates = { ...currentState.sampleStates };
        newSampleStates[sampleId] = {
            ...sampleState,
            activeChopId: chopId,
        };
        set({ sampleStates: newSampleStates });
    },

    setLooping: (looping: boolean) => {
        set({ isLooping: looping });
    },

    setPlaying: (playing: boolean) => {
        set({ isPlaying: playing });
    },

    setPlaybackTime: (time: { current: number; total: number }) => {
        set({ playbackTime: time });
    },

    resetEffects: () => {
        set({
            eqSettings: defaultEQSettings,
            timeStretchRatio: 1.0,
            timeStretchEnabled: false,

            isPreviewingStretch: false,
        });
    },

    syncWithEngine: (engine: AudioEngine | null) => {
        if (engine) {
            set({
                isLooping: engine.isLooping ?? false,
                isPlaying: engine.activeSource !== null,
            });
        }
    },

    // EQ actions
    setEQEnabled: (enabled: boolean) => {
        set((state) => ({
            eqSettings: { ...state.eqSettings, enabled },
        }));
    },

    setEQGain: (band: 'low' | 'mid' | 'high', gain: number) => {
        set((state) => {
            const newSettings = { ...state.eqSettings };
            if (band === 'low') newSettings.lowGain = gain;
            else if (band === 'mid') newSettings.midGain = gain;
            else if (band === 'high') newSettings.highGain = gain;
            return { eqSettings: newSettings };
        });
    },

    setEQFreq: (band: 'low' | 'mid' | 'high', freq: number) => {
        set((state) => {
            const newSettings = { ...state.eqSettings };
            if (band === 'low') newSettings.lowFreq = freq;
            else if (band === 'mid') newSettings.midFreq = freq;
            else if (band === 'high') newSettings.highFreq = freq;
            return { eqSettings: newSettings };
        });
    },

    setMidQ: (q: number) => {
        set((state) => ({
            eqSettings: { ...state.eqSettings, midQ: q },
        }));
    },

    setTimeStretchRatio: (ratio: number) => {
        set({ timeStretchRatio: ratio });
    },

    setTimeStretchEnabled: (enabled: boolean) => {
        set({ timeStretchEnabled: enabled });
    },

    setPreviewingStretch: (previewing: boolean) => {
        set({ isPreviewingStretch: previewing });
    },
}));

