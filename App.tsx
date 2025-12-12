import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAudio } from './src/context/AudioContext';
import { usePlaybackStore } from './src/stores/playbackStore';

// Chrome Extension API type declarations
interface ChromeWindow {
    id?: number;
    width?: number;
    height?: number;
}

interface ChromeWindowsAPI {
    getCurrent: (callback: (window: ChromeWindow) => void) => void;
    get: (windowId: number, callback: (window: ChromeWindow) => void) => void;
    update: (windowId: number, updateInfo: { width?: number; height?: number }, callback?: () => void) => void;
    onBoundsChanged?: {
        addListener: (callback: (window: ChromeWindow) => void) => void;
        removeListener: (callback: (window: ChromeWindow) => void) => void;
    };
}

interface ChromeTabsAPI {
    query: (queryInfo: { active?: boolean; currentWindow?: boolean }, callback: (tabs: Array<{ id?: number; url?: string; muted?: boolean }>) => void) => void;
    update: (tabId: number, updateInfo: { muted?: boolean }, callback?: (tab?: { id?: number; muted?: boolean }) => void) => void;
    get: (tabId: number, callback: (tab: { id?: number; muted?: boolean }) => void) => void;
}

interface ChromeTabCaptureAPI {
    getMediaStreamId: (options: { targetTabId?: number }, callback: (streamId?: string) => void) => void;
}

interface ChromeRuntimeAPI {
    lastError?: { message: string };
}

declare const chrome: {
    windows?: ChromeWindowsAPI;
    tabs?: ChromeTabsAPI;
    tabCapture?: ChromeTabCaptureAPI;
    runtime?: ChromeRuntimeAPI;
} | undefined;
import {
    Play, Pause, Square, SkipBack, Scissors,
    Sliders, Lock, MonitorPlay, ChevronDown, RefreshCcw, Crop, Volume2, Keyboard, ChevronRight, Sparkles, Loader2, Gauge, Power, Repeat, Save, FolderOpen, VolumeX
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Logo } from './components/Logo';
import { WaveformDisplay } from './components/WaveformDisplay';
import { UnifiedControl } from './components/UnifiedControl';
import { PaddleControl } from './components/PaddleControl';
import { ProcessingDialog } from './components/ProcessingDialog';
import { NoiseReductionTab } from './components/NoiseReductionTab';
import { SessionDialog } from './components/SessionDialog';
import { ExportDialog, ExportFormat as ExportDialogFormat, ExportSampleRate, MP3Bitrate } from './components/ExportDialog';
import { EQKnob } from './components/EQKnob';
import { EQVisualizer } from './components/EQVisualizer';
import { EQWaveformVisualizer } from './components/EQWaveformVisualizer';
import { EQOscilloscopeVisualizer } from './components/EQOscilloscopeVisualizer';
import { EQCombinedVisualizer } from './components/EQCombinedVisualizer';
import { formatDuration, audioBufferToWav, audioBufferToFormat, ExportFormat } from './src/utils/audioUtils';
import { downloadBlobWithPreference } from './src/utils/downloadUtils';
import { Sample, Region, TabView, Chop } from './types';
import { AudioState } from './src/core/AudioEngine';
import JSZip from 'jszip';

// Version number
const DEV_VERSION = '1.0.0';

export default function App() {
    const { engine, state, startRecording, stopRecording, toggleArm, isArmed, selectSource, setRecordingCallback } = useAudio();

    const isRecording = state === AudioState.RECORDING;

    // Zustand store selectors
    // Select state values - these will trigger re-renders when they change
    const isPlaying = usePlaybackStore(state => state.isPlaying);
    const isLooping = usePlaybackStore(state => state.isLooping);
    const playbackTime = usePlaybackStore(state => state.playbackTime);
    const activeSampleId = usePlaybackStore(state => state.activeSampleId);


    // Select actions - Zustand ensures these are stable references
    const setActiveSample = usePlaybackStore(state => state.setActiveSample);
    const setLooping = usePlaybackStore(state => state.setLooping);
    const setPlaying = usePlaybackStore(state => state.setPlaying);
    const setPlaybackTime = usePlaybackStore(state => state.setPlaybackTime);
    const setRegion = usePlaybackStore(state => state.setRegion);
    const getSampleRegion = usePlaybackStore(state => state.getSampleRegion);
    const getSampleChops = usePlaybackStore(state => state.getSampleChops);
    const setChops = usePlaybackStore(state => state.setChops);
    const getActiveChopId = usePlaybackStore(state => state.getActiveChopId);
    const setActiveChopId = usePlaybackStore(state => state.setActiveChopId);

    // Get current region and chops for active sample
    // Subscribe to store state to get reactive updates
    const sampleStates = usePlaybackStore(state => state.sampleStates);
    const region = useMemo(() => {
        return activeSampleId && sampleStates[activeSampleId]
            ? sampleStates[activeSampleId].region
            : { start: 0, end: 1 };
    }, [activeSampleId, sampleStates]);
    const chops = useMemo(() => {
        return activeSampleId && sampleStates[activeSampleId]
            ? sampleStates[activeSampleId].chops
            : [];
    }, [activeSampleId, sampleStates]);
    const activeChopId = useMemo(() => {
        return activeSampleId && sampleStates[activeSampleId]
            ? sampleStates[activeSampleId].activeChopId
            : null;
    }, [activeSampleId, sampleStates]);

    // Loop is a global state - it affects what happens when playback reaches the end
    // The AudioEngine's play() method will use the current loop state when starting playback
    // When loop is ON: playback will automatically restart at the end
    // When loop is OFF: playback will stop at the end

    const [activeTab, setActiveTab] = useState<TabView>(TabView.MAIN);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
    const [gain, setGain] = useState(100);
    const [recThreshold, setRecThreshold] = useState(75);
    const [isMuted, setIsMuted] = useState(false);
    const [activeSourceTitle, setActiveSourceTitle] = useState('Select Source');
    const [isSourceConnected, setIsSourceConnected] = useState(false);
    const [muteSourceDuringRecording, setMuteSourceDuringRecording] = useState(false);
    const [sourceTabId, setSourceTabId] = useState<number | null>(null);

    // Multiband filtering state (3-band EQ defaults matching design) - from Zustand store
    const eqSettings = usePlaybackStore(state => state.eqSettings);
    const eqEnabled = eqSettings.enabled;
    const lowFreq = eqSettings.lowFreq;
    const highFreq = eqSettings.highFreq;
    const lowGain = eqSettings.lowGain;
    const highGain = eqSettings.highGain;
    const midFreq = eqSettings.midFreq;
    const midGain = eqSettings.midGain;
    const midQ = eqSettings.midQ;
    const setEQEnabled = usePlaybackStore(state => state.setEQEnabled);
    const setEQGain = usePlaybackStore(state => state.setEQGain);
    const setEQFreq = usePlaybackStore(state => state.setEQFreq);
    const setMidQ = usePlaybackStore(state => state.setMidQ);

    // Local setters for backward compatibility
    const setEqEnabled = (enabled: boolean) => setEQEnabled(enabled);
    const setLowFreq = (freq: number) => setEQFreq('low', freq);
    const setHighFreq = (freq: number) => setEQFreq('high', freq);
    const setLowGain = (gain: number) => setEQGain('low', gain);
    const setHighGain = (gain: number) => setEQGain('high', gain);
    const setMidFreq = (freq: number) => setEQFreq('mid', freq);
    const setMidGain = (gain: number) => setEQGain('mid', gain);

    // ADSR state
    const [adsrMode, setAdsrMode] = useState<'envelope' | 'gate'>('envelope');
    // Full ADSR envelope
    const [attack, setAttack] = useState(0.01); // seconds
    const [decay, setDecay] = useState(0.1); // seconds
    const [sustain, setSustain] = useState(0.7); // 0-1 level
    const [release, setRelease] = useState(0.2); // seconds
    // Gate/compressor style
    const [gateThreshold, setGateThreshold] = useState(-20); // dB
    const [gateRatio, setGateRatio] = useState(4); // ratio
    const [gateAttack, setGateAttack] = useState(0.01); // seconds
    const [gateRelease, setGateRelease] = useState(0.1); // seconds
    const [noiseGateEnabled, setNoiseGateEnabled] = useState(false);
    const [liveNoiseSensitivity, setLiveNoiseSensitivity] = useState(0.5);
    const [liveNoiseAmount, setLiveNoiseAmount] = useState(0.5);

    // Chopping state (chops and activeChopId now from store, others remain local)
    const [chopThreshold, setChopThreshold] = useState(30); // % (higher = fewer chops)
    const [bpmWeight, setBpmWeight] = useState<number | null>(null); // null = auto, 0-1 = manual weight
    const [chopSliceCount, setChopSliceCount] = useState(8);
    const [chopsLinked, setChopsLinked] = useState(true); // Default linked
    const [keyboardMappingEnabled, setKeyboardMappingEnabled] = useState(false);
    const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set());
    const [autoChoppingEnabled, setAutoChoppingEnabled] = useState(false);
    const [chopSubTab, setChopSubTab] = useState<'auto' | 'equal' | 'manual'>('auto');

    // Export dialog state
    const [exportDialog, setExportDialog] = useState<{
        isOpen: boolean;
        mode: 'save-selected' | 'export-all';
        sampleId?: string; // For save-selected mode
    } | null>(null);

    // Processing dialog state
    const [processingDialog, setProcessingDialog] = useState<{
        isOpen: boolean;
        type: 'crop' | 'normalize' | 'noise-reduction' | 'filter' | 'adsr' | 'chop' | 'chop-with-processing' | 'filter-with-crop' | 'timeStretch-with-crop';
        title?: string;
        description?: string;
        onConfirm: () => void;
        onApplyAndChop?: () => void; // For chop-with-processing dialog
        onApplyWithCrop?: () => void; // For filter/timeStretch-with-crop dialog
    } | null>(null);


    // Session dialog state
    const [sessionDialogMode, setSessionDialogMode] = useState<'save' | 'load' | null>(null);





    const [noiseSensitivity, setNoiseSensitivity] = useState(0.5);
    const [noiseAmount, setNoiseAmount] = useState(0.5);

    // Edit mode (individual vs all)
    const [editMode, setEditMode] = useState<'individual' | 'all'>('individual');

    // Manual chopping state
    const [manualChoppingEnabled, setManualChoppingEnabled] = useState(false);
    const [manualChopPoints, setManualChopPoints] = useState<number[]>([]);

    // Track which samples have manually edited chops (to prevent auto chop from overwriting)
    const [manuallyEditedChops, setManuallyEditedChops] = useState<Set<string>>(new Set());

    // Resizable splitter state (0.4 = 40% waveform, 60% controls)
    const [splitRatio, setSplitRatio] = useState(0.4);
    const [isResizing, setIsResizing] = useState(false);

    // Time stretching state - from Zustand store
    const timeStretchRatio = usePlaybackStore(state => state.timeStretchRatio);
    const timeStretchEnabled = usePlaybackStore(state => state.timeStretchEnabled);
    const isPreviewingStretch = usePlaybackStore(state => state.isPreviewingStretch);
    const setTimeStretchRatio = usePlaybackStore(state => state.setTimeStretchRatio);
    const setTimeStretchEnabled = usePlaybackStore(state => state.setTimeStretchEnabled);
    const setPreviewingStretch = usePlaybackStore(state => state.setPreviewingStretch);
    const [timeStretchProgress, setTimeStretchProgress] = useState(0);

    // Local setter for backward compatibility
    const setIsPreviewingStretch = (previewing: boolean) => setPreviewingStretch(previewing);
    const [targetTempo, setTargetTempo] = useState<number | null>(null);
    const [syncToTempo, setSyncToTempo] = useState(false);
    const [isDetectingBPM, setIsDetectingBPM] = useState(false);
    const prevStretchRatioRef = useRef<number>(1.0);
    const prevTimeStretchEnabledRef = useRef<boolean>(false);
    const prevNoiseGateSettingsRef = useRef<{ enabled: boolean; sensitivity: number; amount: number }>({
        enabled: false,
        sensitivity: 0.5,
        amount: 0.5
    });
    const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const noiseGateRestartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isRestartingNoiseGateRef = useRef<boolean>(false);


    const activeSample = samples.find(s => s.id === activeSampleId);

    // Set up recording callback
    useEffect(() => {
        console.log('[App] Setting up recording callback');
        setRecordingCallback((blob: Blob, audioBuffer: AudioBuffer | null) => {
            console.log('[App] Recording callback fired! Blob size:', blob.size);

            if (!audioBuffer) {
                console.error('[App] No audio buffer provided');
                return;
            }

            const newSample: Sample = {
                id: Date.now().toString(),
                name: `Rec_${new Date().toLocaleTimeString().replace(/:/g, '-')}.wav`,
                duration: formatDuration(audioBuffer.duration),
                bpm: 0,
                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: ['New'],
                buffer: audioBuffer,
                blob: blob,
                trimStart: 0,
                trimEnd: 1
            };

            console.log('[App] Creating new sample:', newSample.name);
            setSamples(prev => [newSample, ...prev]);
            setActiveSample(newSample.id);
            
            // Reset all effects when a new sample is recorded to ensure clean, unprocessed sample
            // This ensures the new sample plays cleanly unless user explicitly applies effects
            usePlaybackStore.getState().resetEffects();
            setNoiseGateEnabled(false);
            setLiveNoiseSensitivity(0.5);
            setLiveNoiseAmount(0.5);
        });
    }, [setRecordingCallback]);

    // Auto-initialize on mount (only once)
    useEffect(() => {
        const init = async () => {
            try {
                // Get targetTabId from URL if present
                const urlParams = new URLSearchParams(window.location.search);
                const targetTabIdParam = urlParams.get('targetTabId');
                if (targetTabIdParam) {
                    const tabId = parseInt(targetTabIdParam, 10);
                    if (!isNaN(tabId)) {
                        setSourceTabId(tabId);
                        console.log(`[App] Target tab ID from URL: ${tabId}`);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 100));
                // Only initialize if no source is connected
                if (engine && !engine.sourceNode) {
                    try {
                        await selectSource();
                        setActiveSourceTitle('Display Media');
                    } catch (err) {
                        console.log("Display media selection cancelled:", err);
                    }
                }
            } catch (err) {
                console.error("Initialization error:", err);
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // Handle resize drag
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            const mainElement = document.querySelector('main');
            if (!mainElement) return;

            const rect = mainElement.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const ratio = Math.max(0.2, Math.min(0.8, y / rect.height));
            setSplitRatio(ratio);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // Ensure window opens at correct size and optionally maintain aspect ratio on resize
    useEffect(() => {
        // Check if chrome.windows API is available
        if (typeof chrome === 'undefined' || !chrome.windows) {
            return;
        }

        let windowId: number | null = null;

        // Get current window ID and ensure correct initial size
        chrome.windows.getCurrent((window) => {
            if (window && window.id) {
                windowId = window.id;
                // Ensure window is at correct size on mount with a small delay
                setTimeout(() => {
                    chrome.windows!.getCurrent((currentWindow) => {
                        if (currentWindow && currentWindow.id &&
                            (currentWindow.width !== 1200 || currentWindow.height !== 900)) {
                            chrome.windows!.update(currentWindow.id, {
                                width: 1200,
                                height: 900
                            });
                        }
                    });
                }, 200);
            }
        });
    }, []);

    // Sync playback end and volume, and check source connection status
    useEffect(() => {
        if (engine) {
            engine.onPlaybackEnded = () => {
                // Read current loop state from store (source of truth)
                // This callback fires when playback ends naturally - check loop state to decide whether to loop or stop
                const store = usePlaybackStore.getState();
                const currentLoopState = store.isLooping; // Check store value - it's the global toggle

                // Also get current sample state from store to avoid stale closures
                const currentActiveSampleId = store.activeSampleId;
                const currentSampleStates = store.sampleStates;
                const currentRegion = currentActiveSampleId && currentSampleStates[currentActiveSampleId]
                    ? currentSampleStates[currentActiveSampleId].region
                    : { start: 0, end: 1 };
                const currentChops = currentActiveSampleId && currentSampleStates[currentActiveSampleId]
                    ? currentSampleStates[currentActiveSampleId].chops
                    : [];
                const currentActiveChopId = currentActiveSampleId && currentSampleStates[currentActiveSampleId]
                    ? currentSampleStates[currentActiveSampleId].activeChopId
                    : null;

                if (currentLoopState && activeSample?.buffer) {
                    // Loop is ON - restart playback at the crop/region start
                    // We handle looping manually (not using AudioBufferSourceNode loop)
                    setTimeout(() => {
                        if (engine && activeSample?.buffer && !engine.activeSource) {
                            // Use current values from store/closure
                            const chopToUse = currentActiveChopId && activeTab === TabView.CHOP
                                ? currentChops.find(c => c.id === currentActiveChopId)
                                : null;

                            const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                            if (chopToUse && activeSample.buffer) {
                                engine.play(activeSample.buffer, chopToUse.start, chopToUse.end, true, playbackRate);
                                setPlaying(true);
                            } else if (activeSample.buffer) {
                                engine.play(activeSample.buffer, currentRegion.start, currentRegion.end, true, playbackRate);
                                setPlaying(true);
                            }
                        }
                    }, 10);
                } else {
                    // Loop is OFF - stop playback normally
                    setPlaying(false);
                    setPlaybackTime({ current: 0, total: 0 });
                }
            };
            engine.setVolume(isMuted ? 0 : gain / 100);
            // Check if source is connected
            setIsSourceConnected(!!engine.sourceNode);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, gain, isMuted, state, activeSample, activeChopId, activeTab, region, chops]); // Include dependencies for loop restart

    // Update playback time display
    useEffect(() => {
        // Always show time display, even when not playing or no sample
        if (!isPlaying || !engine || !engine.context) {
            if (activeSample?.buffer) {
                // Show total duration even when not playing
                const duration = activeSample.buffer.duration;
                const playbackRate = engine?.currentPlaybackRate || 1.0;
                const regionDuration = duration * (region.end - region.start);
                const effectiveDuration = regionDuration / playbackRate;
                setPlaybackTime({ current: 0, total: effectiveDuration });
            } else {
                setPlaybackTime({ current: 0, total: 0 });
            }
            return;
        }

        if (!activeSample?.buffer) {
            setPlaybackTime({ current: 0, total: 0 });
            return;
        }

        let animationFrameId: number;
        const updateTime = () => {
            if (!engine.context || !activeSample?.buffer) {
                setPlaybackTime({ current: 0, total: 0 });
                return;
            }

            const duration = activeSample.buffer.duration;
            const playbackRate = engine.currentPlaybackRate || 1.0;

            // Determine which region is actually being played
            let actualRegionDuration: number;
            if (activeChopId && activeTab === TabView.CHOP) {
                const chop = chops.find(c => c.id === activeChopId);
                if (chop) {
                    actualRegionDuration = duration * (chop.end - chop.start);
                } else {
                    actualRegionDuration = duration * (region.end - region.start);
                }
            } else {
                actualRegionDuration = duration * (region.end - region.start);
            }
            const effectiveDuration = actualRegionDuration / playbackRate;

            if (engine.playbackStartTime > 0) {
                const elapsed = engine.context.currentTime - engine.playbackStartTime;
                const playbackRate = engine.currentPlaybackRate || 1.0;

                // Determine which region is actually playing
                let actualRegionStart: number;
                let actualRegionEnd: number;
                if (activeChopId && activeTab === TabView.CHOP) {
                    const chop = chops.find(c => c.id === activeChopId);
                    if (chop) {
                        actualRegionStart = duration * chop.start;
                        actualRegionEnd = duration * chop.end;
                    } else {
                        actualRegionStart = duration * region.start;
                        actualRegionEnd = duration * region.end;
                    }
                } else {
                    actualRegionStart = duration * region.start;
                    actualRegionEnd = duration * region.end;
                }
                const actualRegionDuration = actualRegionEnd - actualRegionStart;

                // Calculate buffer time elapsed (real-time * playbackRate)
                const bufferTimeElapsed = elapsed * playbackRate;

                // Calculate current position in the buffer
                // If looping (either normal playback or preview with loop enabled), wrap the position back to start when it exceeds the end
                const isCurrentlyLooping = isLooping && engine.isLooping;
                let bufferPosition: number;

                if (isCurrentlyLooping) {
                    // Wrap position within the region boundaries
                    bufferPosition = actualRegionStart + (bufferTimeElapsed % actualRegionDuration);
                } else {
                    // Clamp to region boundaries
                    bufferPosition = actualRegionStart + bufferTimeElapsed;
                    if (bufferPosition > actualRegionEnd) {
                        bufferPosition = actualRegionEnd;
                    }
                }

                // Current position relative to the region being played
                const currentPos = isCurrentlyLooping
                    ? (bufferPosition - actualRegionStart) // Position within the loop cycle
                    : Math.max(0, Math.min(bufferPosition - actualRegionStart, actualRegionDuration));
                setPlaybackTime({ current: currentPos, total: effectiveDuration });
            } else {
                setPlaybackTime({ current: 0, total: effectiveDuration });
            }

            if (isPlaying) {
                animationFrameId = requestAnimationFrame(updateTime);
            }
        };

        updateTime();
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, engine, activeSample, region, isLooping, activeChopId, activeTab, chops]);

    // Live time stretching: restart playback when ratio changes and time-stretch is enabled
    useEffect(() => {
        // Skip on initial mount or if time-stretch is not enabled or not playing
        if (!timeStretchEnabled || !isPlaying || !activeSample?.buffer || !engine || !engine.context) {
            prevStretchRatioRef.current = timeStretchRatio;
            return;
        }

        // Only restart if ratio actually changed
        if (prevStretchRatioRef.current === timeStretchRatio) {
            return;
        }

        // Cancel any pending restart to prevent overlapping restarts
        if (restartTimeoutRef.current) {
            clearTimeout(restartTimeoutRef.current);
            restartTimeoutRef.current = null;
        }

        // Explicitly stop current playback first to prevent overlapping sources
        // This ensures the previous source is fully stopped before starting a new one
        engine.stop();

        // Small delay to ensure stop() completes before starting new playback
        // This prevents race conditions where multiple sources might play simultaneously
        restartTimeoutRef.current = setTimeout(() => {
            // Calculate current playback position within the region
            const elapsed = engine.context.currentTime - engine.playbackStartTime;
            const playbackRate = engine.currentPlaybackRate || 1.0;
            const bufferTimeElapsed = elapsed * playbackRate;

            // Calculate position relative to region start
            const bufferDuration = activeSample.buffer.duration;
            const regionDuration = bufferDuration * (region.end - region.start);

            // Calculate position within region, accounting for looping
            // Use modulo to wrap position if it exceeds region duration
            let positionInRegion = bufferTimeElapsed % regionDuration;

            // Ensure position is within valid bounds (handle edge cases)
            if (positionInRegion < 0) {
                positionInRegion = 0;
            }
            if (positionInRegion > regionDuration) {
                positionInRegion = regionDuration;
            }

            // Calculate normalized position (0-1) within the full buffer
            const currentPositionInBuffer = region.start * bufferDuration + positionInRegion;
            const currentPosition = Math.max(region.start, Math.min(currentPositionInBuffer / bufferDuration, region.end));

            // Restart playback from current position with new ratio
            // CRITICAL: Always use region.start and region.end for loop boundaries, not currentPosition
            // This prevents tiny loops when currentPosition is close to region.start
            const newPlaybackRate = 1 / timeStretchRatio;
            const originalOnPlaybackEnded = engine.onPlaybackEnded;
            engine.onPlaybackEnded = null;

            // Get current loop state from store
            const currentLoopState = usePlaybackStore.getState().isLooping;

            // Always use full region boundaries for loop points to prevent tiny loops
            // The AudioEngine.play() method uses trimStart/trimEnd as loop boundaries when looping is enabled
            // By always using region.start and region.end, we ensure consistent loop boundaries
            // Note: We restart from region.start (not currentPosition) because:
            // 1. BufferSourceNode doesn't support seeking mid-buffer
            // 2. Using currentPosition as startPos creates tiny loops when it's close to region.start
            // 3. Restarting from region.start prevents the looping bug
            // The slight position loss is acceptable compared to the looping bug
            engine.play(activeSample.buffer, region.start, region.end, currentLoopState, newPlaybackRate);

            // Calculate new stretched duration based on full region
            const remainingBufferDuration = bufferDuration * (region.end - region.start);
            const remainingStretchedDuration = remainingBufferDuration / newPlaybackRate;

            // Handle playback end based on loop state
            if (currentLoopState) {
                // If looping, restore callback so it can handle looping
                engine.onPlaybackEnded = originalOnPlaybackEnded;
            } else {
                // If not looping, stop preview when audio actually ends
                setTimeout(() => {
                    setPreviewingStretch(false);
                    setPlaying(false);
                    if (engine.onPlaybackEnded === null) {
                        engine.onPlaybackEnded = originalOnPlaybackEnded;
                    }
                }, remainingStretchedDuration * 1000);
            }

            // Update ref to track current ratio
            prevStretchRatioRef.current = timeStretchRatio;
            restartTimeoutRef.current = null;
        }, 10); // Small delay to ensure stop() completes

        return () => {
            if (restartTimeoutRef.current) {
                clearTimeout(restartTimeoutRef.current);
                restartTimeoutRef.current = null;
            }
        };
    }, [timeStretchRatio, timeStretchEnabled, isPlaying, activeSample, engine, region]);

    // Restart playback immediately when time-stretch toggle changes during playback
    useEffect(() => {
        // Skip on initial mount or if not playing
        if (!isPlaying || !activeSample?.buffer || !engine || !engine.context) {
            prevTimeStretchEnabledRef.current = timeStretchEnabled;
            return;
        }

        // Only restart if enabled state actually changed
        if (prevTimeStretchEnabledRef.current === timeStretchEnabled) {
            return;
        }

        // Cancel any pending restart to prevent overlapping restarts
        if (restartTimeoutRef.current) {
            clearTimeout(restartTimeoutRef.current);
            restartTimeoutRef.current = null;
        }

        // Explicitly stop current playback first
        engine.stop();

        // Small delay to ensure stop() completes before starting new playback
        restartTimeoutRef.current = setTimeout(() => {
            // Calculate current playback position within the region
            const elapsed = engine.context.currentTime - engine.playbackStartTime;
            const playbackRate = engine.currentPlaybackRate || 1.0;
            const bufferTimeElapsed = elapsed * playbackRate;

            // Calculate position relative to region start
            const bufferDuration = activeSample.buffer.duration;
            const regionDuration = bufferDuration * (region.end - region.start);

            // Calculate position within region, accounting for looping
            let positionInRegion = bufferTimeElapsed % regionDuration;

            // Ensure position is within valid bounds
            if (positionInRegion < 0) {
                positionInRegion = 0;
            }
            if (positionInRegion > regionDuration) {
                positionInRegion = regionDuration;
            }

            // Calculate normalized position (0-1) within the full buffer
            const currentPositionInBuffer = region.start * bufferDuration + positionInRegion;
            const currentPosition = Math.max(region.start, Math.min(currentPositionInBuffer / bufferDuration, region.end));

            // Calculate playback rate based on new enabled state
            const newPlaybackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
            const originalOnPlaybackEnded = engine.onPlaybackEnded;
            engine.onPlaybackEnded = null;

            // Get current loop state from store
            const currentLoopState = usePlaybackStore.getState().isLooping;

            // Restart playback from region start with new playback rate
            // Always use full region boundaries for loop points
            engine.play(activeSample.buffer, region.start, region.end, currentLoopState, newPlaybackRate);

            // Restore callback
            engine.onPlaybackEnded = originalOnPlaybackEnded;

            // Update ref to track current enabled state
            prevTimeStretchEnabledRef.current = timeStretchEnabled;
            restartTimeoutRef.current = null;
        }, 10); // Small delay to ensure stop() completes

        return () => {
            if (restartTimeoutRef.current) {
                clearTimeout(restartTimeoutRef.current);
                restartTimeoutRef.current = null;
            }
        };
    }, [timeStretchEnabled, isPlaying, activeSample, engine, region, timeStretchRatio]);

    // Sync stretch ratio to tempo when target tempo changes
    useEffect(() => {
        if (!syncToTempo || !targetTempo || !activeSample) return;

        const sampleBPM = typeof activeSample.bpm === 'number' ? activeSample.bpm :
            activeSample.detectedBPM || null;

        if (sampleBPM && sampleBPM > 0 && targetTempo > 0) {
            // stretchRatio = sampleBPM / targetBPM
            // Higher target tempo = faster playback = lower stretchRatio
            // Lower target tempo = slower playback = higher stretchRatio
            const calculatedRatio = sampleBPM / targetTempo;
            setTimeStretchRatio(Math.max(0.25, Math.min(4.0, calculatedRatio)));
        }
    }, [targetTempo, syncToTempo, activeSample]);

    // Update threshold
    useEffect(() => {
        if (engine) {
            engine.threshold = recThreshold;
        }
    }, [recThreshold, engine]);

    // Auto-enable EQ when controls are moved (but don't auto-disable - user must use On/Off button)
    useEffect(() => {
        // Check if any control is moved from default
        const hasNonZeroGain = lowGain !== 0 || midGain !== 0 || highGain !== 0;
        const hasNonDefaultFreq = lowFreq !== 100 || midFreq !== 1000 || highFreq !== 8000;
        const hasNonDefaultQ = midQ !== 1.2;

        const shouldBeEnabled = hasNonZeroGain || hasNonDefaultFreq || hasNonDefaultQ;

        // Only auto-enable when controls are moved while disabled
        // Don't auto-disable - user must explicitly turn off via On/Off button
        // Only check enabled state, don't include it in dependencies to avoid re-triggering on manual toggle
        const currentEnabled = usePlaybackStore.getState().eqSettings.enabled;
        if (shouldBeEnabled && !currentEnabled) {
            setEQEnabled(true);
        }
        // Removed auto-disable logic - user controls this via On/Off button
    }, [lowGain, midGain, highGain, lowFreq, midFreq, highFreq, midQ, setEQEnabled]);

    // Auto-enable Time Stretch when ratio is changed (but don't auto-disable - user must use On/Off button)
    useEffect(() => {
        // Check if ratio is changed from default (1.0)
        const shouldBeEnabled = timeStretchRatio !== 1.0;

        // Only auto-enable when ratio is changed while disabled
        // Don't auto-disable - user must explicitly turn off via On/Off button
        // Only check enabled state, don't include it in dependencies to avoid re-triggering on manual toggle
        const currentEnabled = usePlaybackStore.getState().timeStretchEnabled;
        if (shouldBeEnabled && !currentEnabled) {
            setTimeStretchEnabled(true);
        }
        // Removed auto-disable logic - user controls this via On/Off button
    }, [timeStretchRatio, setTimeStretchEnabled]);

    // Reset noise gate when switching samples (for clean pass-through)
    useEffect(() => {
        setNoiseGateEnabled(false);
        setLiveNoiseSensitivity(0.5);
        setLiveNoiseAmount(0.5);
    }, [activeSampleId]);

    // Sync EQ parameters to AudioEngine (live updates)
    useEffect(() => {
        if (engine) {
            engine.setEQ({
                enabled: eqEnabled,
                lowGain,
                lowFreq,
                midGain,
                midFreq,
                midQ,
                highGain,
                highFreq
            });
        }
    }, [engine, eqEnabled, lowGain, lowFreq, midGain, midFreq, midQ, highGain, highFreq]);

    // Loop is a global state - it affects what happens when playback reaches the end
    // When loop is ON: playback will automatically restart at the end (respecting crop/region)
    // When loop is OFF: playback will stop at the end
    // We handle looping manually in onPlaybackEnded callback, so we don't use AudioBufferSourceNode's
    // built-in loop property. This allows loop state to change during playback without restarting.

    // Handle region changes during playback - restart playback with new region
    const prevRegionRef = useRef<Region>({ start: region.start, end: region.end });
    const isInitialMountRef = useRef(true);

    useEffect(() => {
        // Skip on initial mount
        if (isInitialMountRef.current) {
            isInitialMountRef.current = false;
            prevRegionRef.current = { start: region.start, end: region.end };
            return;
        }

        // Check if region actually changed
        const regionChanged = prevRegionRef.current.start !== region.start ||
            prevRegionRef.current.end !== region.end;

        // Only restart if region actually changed and we're currently playing
        if (regionChanged && engine && engine.activeSource && isPlaying && activeSample?.buffer && activeTab !== TabView.CHOP) {
            // Restart playback with new region boundaries
            // This is especially important for looping - loop boundaries need to be updated
            engine.stop();
            setPlaying(false);

            // Restart immediately (Debounce removed for responsiveness)
            if (activeSample.buffer && !engine.activeSource && document.visibilityState === 'visible') {
                const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                engine.play(activeSample.buffer, region.start, region.end, isLooping, playbackRate);
                setPlaying(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [region.start, region.end]);

    // Mute/unmute source tab functions
    const muteSourceTab = async (tabId: number): Promise<boolean> => {
        if (!chrome?.tabs) {
            console.error('[App] chrome.tabs API not available');
            return false;
        }
        return new Promise((resolve) => {
            try {
                chrome.tabs!.update(tabId, { muted: true }, (tab) => {
                    if (chrome.runtime?.lastError) {
                        console.error('[App] Error muting tab:', chrome.runtime.lastError.message);
                        resolve(false);
                    } else {
                        console.log(`[App] Tab ${tabId} muted successfully`, tab);
                        resolve(true);
                    }
                });
            } catch (err) {
                console.error('[App] Error muting tab:', err);
                resolve(false);
            }
        });
    };

    const unmuteSourceTab = async (tabId: number): Promise<boolean> => {
        if (!chrome?.tabs) {
            console.error('[App] chrome.tabs API not available');
            return false;
        }
        return new Promise((resolve) => {
            try {
                chrome.tabs!.update(tabId, { muted: false }, (tab) => {
                    if (chrome.runtime?.lastError) {
                        console.error('[App] Error unmuting tab:', chrome.runtime.lastError.message);
                        resolve(false);
                    } else {
                        console.log(`[App] Tab ${tabId} unmuted successfully`, tab);
                        resolve(true);
                    }
                });
            } catch (err) {
                console.error('[App] Error unmuting tab:', err);
                resolve(false);
            }
        });
    };

    // Helper function to mute tab before starting recording (used by both record button and threshold)
    const muteBeforeRecording = async (): Promise<void> => {
        if (!chrome?.tabs || !muteSourceDuringRecording) return;
        
        let tabIdToMute: number | null = null;
        
        // First try to use sourceTabId if we have it
        if (sourceTabId !== null) {
            tabIdToMute = sourceTabId;
        } else {
            // Try to get tab ID from URL parameter
            const urlParams = new URLSearchParams(window.location.search);
            const targetTabIdParam = urlParams.get('targetTabId');
            if (targetTabIdParam) {
                const tabId = parseInt(targetTabIdParam, 10);
                if (!isNaN(tabId)) {
                    tabIdToMute = tabId;
                    setSourceTabId(tabId);
                }
            }
        }
        
        // Mute the tab if we have a valid ID
        if (tabIdToMute !== null) {
            console.log(`[App] Muting tab ${tabIdToMute} before starting recording`);
            await muteSourceTab(tabIdToMute);
        } else {
            console.warn('[App] Cannot mute: no tab ID available. Make sure to click extension icon on the tab you want to record.');
        }
    };

    // Unmute tab when recording stops (only if mute was enabled)
    useEffect(() => {
        if (!isRecording && sourceTabId !== null && muteSourceDuringRecording) {
            // Recording stopped - unmute the tab if it was muted
            console.log(`[App] Recording stopped, unmuting tab ${sourceTabId}`);
            unmuteSourceTab(sourceTabId);
            // Don't clear sourceTabId - keep it for next recording
        }
    }, [isRecording, sourceTabId, muteSourceDuringRecording]);

    const toggleRecord = async () => {
        if (isRecording) {
            // Stop recording and unmute tab if it was muted
            stopRecording();
            if (sourceTabId !== null && muteSourceDuringRecording) {
                console.log(`[App] Stopping recording, unmuting tab ${sourceTabId}`);
                await unmuteSourceTab(sourceTabId);
                // Don't clear sourceTabId - keep it for next recording
            }
        } else {
            // Start recording - mute source tab if mute is enabled
            await muteBeforeRecording();
            
            // Reset all effects before starting a new recording to ensure clean sample
            usePlaybackStore.getState().resetEffects();
            setNoiseGateEnabled(false);
            setLiveNoiseSensitivity(0.5);
            setLiveNoiseAmount(0.5);
            startRecording();
        }
    };

    // Wrapper for startRecording that resets effects to ensure clean recording
    const handleStartRecording = async () => {
        // Mute tab before starting recording if mute is enabled
        await muteBeforeRecording();
        
        // Reset all effects before starting a new recording to ensure clean sample
        usePlaybackStore.getState().resetEffects();
        setNoiseGateEnabled(false);
        setLiveNoiseSensitivity(0.5);
        setLiveNoiseAmount(0.5);
        startRecording();
    };

    // Helper function to restart playback with current settings
    const restartPlaybackIfPlaying = useCallback(() => {
        if (!isPlaying || !activeSample?.buffer || !engine) return;

        // Prevent multiple simultaneous restarts - cancel any pending restart and start fresh
        if (noiseGateRestartTimeoutRef.current) {
            clearTimeout(noiseGateRestartTimeoutRef.current);
            noiseGateRestartTimeoutRef.current = null;
        }

        // If already in the process of restarting, cancel it and start fresh
        if (isRestartingNoiseGateRef.current) {
            // Stop any playback that might have started
            engine.stop();
        }

        isRestartingNoiseGateRef.current = true;
        const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;

        // Stop current playback
        engine.stop();

        // Small delay to ensure stop completes, but also double-check no active source exists
        noiseGateRestartTimeoutRef.current = setTimeout(() => {
            // Double-check we're still supposed to be playing
            if (!isPlaying || !activeSample?.buffer) {
                isRestartingNoiseGateRef.current = false;
                noiseGateRestartTimeoutRef.current = null;
                return;
            }

            // Safety check: if there's still an active source, stop it again
            if (engine.activeSource) {
                engine.stop();
            }

            if (activeChopId && activeTab === TabView.CHOP) {
                const chop = chops.find(c => c.id === activeChopId);
                if (chop && activeSample.buffer) {
                    engine.play(activeSample.buffer, chop.start, chop.end, isLooping, playbackRate);
                }
            } else {
                engine.play(activeSample.buffer, region.start, region.end, isLooping, playbackRate);
            }
            isRestartingNoiseGateRef.current = false;
            noiseGateRestartTimeoutRef.current = null;
        }, 10);
    }, [isPlaying, activeSample, engine, timeStretchEnabled, timeStretchRatio, activeChopId, activeTab, chops, isLooping, region]);

    const handlePlayToggle = () => {
        if (!activeSample) return;

        if (isPlaying) {
            setPlaying(false);
            if (engine) engine.stop();
        } else {
            if (engine && activeSample.buffer) {
                // Calculate playback rate based on time-stretch enabled state
                const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;

                // Use current loop state from store - respect user's loop preference
                // If there's an active chop, play that; otherwise play the region
                if (activeChopId && activeTab === TabView.CHOP) {
                    const chop = chops.find(c => c.id === activeChopId);
                    if (chop && activeSample.buffer) {
                        engine.play(activeSample.buffer, chop.start, chop.end, isLooping, playbackRate);
                        setPlaying(true);
                    }
                } else {
                    engine.play(activeSample.buffer, region.start, region.end, isLooping, playbackRate);
                    setPlaying(true);
                }
            }
        }
    };

    // Multi-select handler
    const handleSelectSample = (id: string, multiSelectType: 'ctrl' | 'shift' | null = null) => {
        if (multiSelectType === 'ctrl') {
            const newSelection = new Set(selectedSampleIds);
            if (newSelection.has(id)) {
                newSelection.delete(id);
            } else {
                newSelection.add(id);
                setActiveSample(id);
            }
            setSelectedSampleIds(newSelection);
        } else if (multiSelectType === 'shift' && activeSampleId) {
            const currentIndex = samples.findIndex(s => s.id === id);
            const activeIndex = samples.findIndex(s => s.id === activeSampleId);

            if (currentIndex !== -1 && activeIndex !== -1) {
                const start = Math.min(currentIndex, activeIndex);
                const end = Math.max(currentIndex, activeIndex);

                const newSelection = new Set(selectedSampleIds);
                for (let i = start; i <= end; i++) {
                    newSelection.add(samples[i].id);
                }
                setSelectedSampleIds(newSelection);
                setActiveSample(id);
            }
        } else {
            setSelectedSampleIds(new Set([id]));
            setActiveSample(id);
        }
    };

    const handleDeleteSample = (id: string) => {
        const newSamples = samples.filter(s => s.id !== id);
        setSamples(newSamples);
        if (activeSampleId === id && newSamples.length > 0) {
            setActiveSample(newSamples[0].id);
        } else if (activeSampleId === id) {
            setActiveSample('');
        }
    };

    const handleDuplicateSample = (id: string) => {
        const sample = samples.find(s => s.id === id);
        if (sample) {
            const newSample = { ...sample, id: Date.now().toString(), name: `${sample.name.replace('.wav', '')}_copy.wav` };
            setSamples([...samples, newSample]);
        }
    };

    const handleRenameSample = (id: string, newName: string) => {
        setSamples(samples.map(s => s.id === id ? { ...s, name: newName } : s));
    };

    const handleAnalyzeSample = async (id: string) => {
        const sample = samples.find(s => s.id === id);
        if (!sample || !sample.buffer || !engine) return;

        // Set analyzing state
        setSamples(samples.map(s => s.id === id ? { ...s, isAnalyzing: true } : s));

        try {
            const results = await engine.analyzeAudio(sample.buffer);

            // Update sample with results
            setSamples(samples.map(s => {
                if (s.id === id) {
                    const updated: Sample = { ...s, isAnalyzing: false };
                    if (results.bpm) {
                        updated.detectedBPM = results.bpm.bpm;
                        // Also update the display bpm if it's empty or 0
                        if (!updated.bpm || updated.bpm === 0) {
                            updated.bpm = results.bpm.bpm;
                        }
                    }
                    if (results.key) {
                        updated.detectedKey = {
                            key: results.key.key,
                            mode: results.key.mode as 'major' | 'minor',
                            confidence: results.key.confidence
                        };
                    }
                    return updated;
                }
                return s;
            }));
        } catch (error) {
            console.error('Analysis error:', error);
            setSamples(samples.map(s => s.id === id ? { ...s, isAnalyzing: false } : s));
        }
    };

    // downloadBlob replaced with downloadBlobWithPreference from downloadUtils

    const handleSaveAs = (id: string) => {
        // Show export dialog instead of directly exporting
        setExportDialog({
            isOpen: true,
            mode: 'save-selected',
            sampleId: id
        });
    };

    const performSaveAs = async (id: string, format: ExportDialogFormat, sampleRate: ExportSampleRate, bitrate?: MP3Bitrate) => {
        if (!engine) {
            alert('Error: Audio engine is not available. Please refresh the page.');
            return;
        }

        try {
            // Get effective sample rate
            const targetSampleRate = sampleRate === 'original' 
                ? null 
                : sampleRate;

            // If saving the active sample and a chop is selected, save ONLY that chop
            if (id === activeSampleId && activeChopId) {
                const chop = chops.find(c => c.id === activeChopId);
                const sample = samples.find(s => s.id === id);

                if (chop && sample && sample.buffer && engine) {
                    const tempStub = {
                        buffer: sample.buffer,
                        trimStart: chop.start,
                        trimEnd: chop.end
                    };
                    let newBuffer = await engine.crop(tempStub);
                    if (newBuffer) {
                        // Resample if needed
                        if (targetSampleRate && newBuffer.sampleRate !== targetSampleRate) {
                            newBuffer = await engine.resampleBuffer(newBuffer, targetSampleRate);
                        }
                        const blob = await audioBufferToFormat(newBuffer, format, { bitrate });
                        const originalName = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                        const chopIndex = chops.findIndex(c => c.id === activeChopId) + 1;
                        const filename = `${originalName}_Slice_${chopIndex}.${format}`;
                        await downloadBlobWithPreference(blob, filename);
                        return;
                    }
                }
            }

            const targets = new Set(selectedSampleIds);
            let idsToSave = (targets.size > 0 && targets.has(id)) ? Array.from(targets) : [id];

            // Export individual files (no ZIP for save-selected mode)
            let exportedCount = 0;
            let failedCount = 0;
            const exportedFiles: string[] = [];

            for (const tid of idsToSave) {
                const sample = samples.find(s => s.id === tid);
                if (sample && sample.buffer) {
                    try {
                        let buffer = sample.buffer;
                        // Resample if needed
                        if (targetSampleRate && buffer.sampleRate !== targetSampleRate) {
                            buffer = await engine.resampleBuffer(buffer, targetSampleRate);
                        }
                        const blob = await audioBufferToFormat(buffer, format, { bitrate });
                        const nameWithoutExt = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                        const filename = `${nameWithoutExt}.${format}`;
                        await downloadBlobWithPreference(blob, filename);
                        exportedFiles.push(filename);
                        exportedCount++;
                    } catch (error) {
                        console.error(`[App] Failed to export sample "${sample.name}":`, error);
                        failedCount++;
                    }
                } else {
                    failedCount++;
                }
            }

            if (exportedCount === 0) {
                const errorMsg = format === 'mp3' 
                    ? 'MP3 export failed. All samples may be invalid, missing audio buffers, or MP3 encoding may have failed. Check console for details.'
                    : 'No samples could be exported. All samples may be invalid or missing audio buffers.';
                throw new Error(errorMsg);
            }

            // Success - downloads sidebar will show the files
        } catch (error) {
            console.error('[App] Export error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            alert(`Export failed: ${errorMessage}\n\nPlease check the console for more details.`);
        }
    };

    const handleExportAll = () => {
        if (samples.length === 0) return;
        // Show export dialog instead of directly exporting
        setExportDialog({
            isOpen: true,
            mode: 'export-all'
        });
    };

    const performExportAll = async (format: ExportDialogFormat, sampleRate: ExportSampleRate, bitrate?: MP3Bitrate, exportAsZip?: boolean) => {
        if (samples.length === 0) {
            alert('No samples to export.');
            return;
        }

        if (!engine) {
            alert('Error: Audio engine is not available. Please refresh the page.');
            return;
        }

        try {
            // Get effective sample rate
            const targetSampleRate = sampleRate === 'original' 
                ? null 
                : sampleRate;

            // Use default uSampler folder

            if (exportAsZip) {
                // Export as ZIP (existing logic)
                const zip = new JSZip();
                const dateStr = new Date().toISOString().slice(0, 10);
                const folder = zip.folder(`uSampler_Session_${dateStr}`);

                let exportedCount = 0;
                for (const sample of samples) {
                    if (sample.buffer) {
                        try {
                            let buffer = sample.buffer;
                            // Resample if needed
                            if (targetSampleRate && buffer.sampleRate !== targetSampleRate) {
                                buffer = await engine.resampleBuffer(buffer, targetSampleRate);
                            }
                            const blob = await audioBufferToFormat(buffer, format, { bitrate });
                            const nameWithoutExt = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                            folder?.file(`${nameWithoutExt}.${format}`, blob);
                            exportedCount++;
                        } catch (error) {
                            console.error(`[App] Failed to export sample "${sample.name}":`, error);
                            // Continue with other samples even if one fails
                        }
                    }
                }

                if (exportedCount === 0) {
                    const errorMsg = format === 'mp3' 
                        ? 'MP3 export failed. All samples may be invalid, missing audio buffers, or MP3 encoding may have failed. Check console for details.'
                        : 'No samples could be exported. All samples may be invalid or missing audio buffers.';
                    throw new Error(errorMsg);
                }

                const metadata = {
                    version: DEV_VERSION,
                    date: new Date().toISOString(),
                    samples: samples.map(s => ({
                        id: s.id,
                        name: s.name,
                        duration: s.duration,
                        bpm: s.bpm,
                        chops: s.chops
                    }))
                };
                folder?.file("session_data.json", JSON.stringify(metadata, null, 2));

                const content = await zip.generateAsync({ type: "blob" });
                const zipFilename = `uSampler_Session_${dateStr}.zip`;
                await downloadBlobWithPreference(content, zipFilename);
            } else {
                // Export individual files (default)
                let exportedCount = 0;
                let failedCount = 0;
                const exportedFiles: string[] = [];
                
                for (const sample of samples) {
                    if (sample.buffer) {
                        try {
                            let buffer = sample.buffer;
                            // Resample if needed
                            if (targetSampleRate && buffer.sampleRate !== targetSampleRate) {
                                buffer = await engine.resampleBuffer(buffer, targetSampleRate);
                            }
                            const blob = await audioBufferToFormat(buffer, format, { bitrate });
                            const nameWithoutExt = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                            const filename = `${nameWithoutExt}.${format}`;
                            await downloadBlobWithPreference(blob, filename);
                            exportedFiles.push(filename);
                            exportedCount++;
                        } catch (error) {
                            console.error(`[App] Failed to export sample "${sample.name}":`, error);
                            failedCount++;
                            // Continue with other samples even if one fails
                        }
                    } else {
                        failedCount++;
                    }
                }

                if (exportedCount === 0) {
                    const errorMsg = format === 'mp3' 
                        ? 'MP3 export failed. All samples may be invalid, missing audio buffers, or MP3 encoding may have failed. Check console for details.'
                        : 'No samples could be exported. All samples may be invalid or missing audio buffers.';
                    throw new Error(errorMsg);
                }

                // Success - downloads sidebar will show the files
            }
        } catch (error) {
            console.error('[App] Export All error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            alert(`Export All failed: ${errorMessage}\n\nPlease check the console for more details.`);
        }
    };


    // Live Noise Gate Effect - Apply immediately when controls change
    useEffect(() => {
        if (!engine) return;

        const prevSettings = prevNoiseGateSettingsRef.current;
        const settingsChanged =
            prevSettings.enabled !== noiseGateEnabled ||
            Math.abs(prevSettings.sensitivity - liveNoiseSensitivity) > 0.001 ||
            Math.abs(prevSettings.amount - liveNoiseAmount) > 0.001;


        // Update engine with new settings
        (engine as any).setNoiseGate(noiseGateEnabled, liveNoiseSensitivity, liveNoiseAmount);

        // Only restart playback if enabled state changed (to add/remove node from chain)
        // Sensitivity and amount changes apply in real-time via the processor callback
        const enabledChanged = prevSettings.enabled !== noiseGateEnabled;


        // Restart playback if currently playing and enabled state changed
        // The noise gate node is only connected in the audio chain when playback starts,
        // so we need to restart to add/remove it from the chain
        if (enabledChanged && isPlaying && activeSample?.buffer) {
            restartPlaybackIfPlaying();
        }

        // Update ref
        prevNoiseGateSettingsRef.current = {
            enabled: noiseGateEnabled,
            sensitivity: liveNoiseSensitivity,
            amount: liveNoiseAmount
        };
    }, [engine, noiseGateEnabled, liveNoiseSensitivity, liveNoiseAmount, isPlaying, activeSample, restartPlaybackIfPlaying]);

    const handleCrop = async () => {
        if (!activeSample || !engine) return;

        setProcessingDialog({
            isOpen: true,
            type: 'crop',
            onConfirm: async () => {
                setProcessingDialog(null);
                const tempSampleStub = {
                    buffer: activeSample.buffer!,
                    trimStart: region.start,
                    trimEnd: region.end
                };

                const newBuffer = await engine.crop(tempSampleStub);
                if (newBuffer) {
                    const newBlob = engine.bufferToBlob(newBuffer);

                    // Auto-rename with _Cropped suffix
                    const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                    const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                    const newName = `${originalName}_Cropped.${extension}`;

                    const newSample: Sample = {
                        id: Date.now().toString(),
                        name: newName,
                        duration: formatDuration(newBuffer.duration),
                        bpm: activeSample.bpm,
                        size: `${(newBlob.size / 1024 / 1024).toFixed(2)} MB`,
                        waveform: [],
                        tags: ['Cropped', ...activeSample.tags.filter(t => t !== 'New')],
                        buffer: newBuffer,
                        blob: newBlob,
                        trimStart: 0,
                        trimEnd: 1
                    };
                    setSamples(prev => [newSample, ...prev]);
                    setActiveSample(newSample.id);
                    setRegion(newSample.id, { start: 0, end: 1 });
                }
            }
        });
    };

    const handleApplyNoiseReduction = async () => {
        if (!activeSample || !engine || !activeSample.buffer) return;

        // Use the offline version of the gate to bake the effect
        // Cast to any because TS might not see the new method yet
        const newBuffer = (engine as any).applyNoiseGateOffline(activeSample.buffer, liveNoiseSensitivity, liveNoiseAmount);

        if (newBuffer) {
            const newBlob = engine.bufferToBlob(newBuffer);
            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
            const newName = `${originalName}_Denoised.${extension}`;

            const newSample: Sample = {
                id: Date.now().toString(),
                name: newName,
                duration: formatDuration(newBuffer.duration),
                bpm: activeSample.bpm,
                size: `${(newBlob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: ['Denoised', ...activeSample.tags.filter(t => t !== 'New')],
                buffer: newBuffer,
                blob: newBlob,
                trimStart: 0,
                trimEnd: 1
            };
            setSamples(prev => [newSample, ...prev]);
            setActiveSample(newSample.id);

            // Reset noise gate state after baking to prevent double application
            setNoiseGateEnabled(false);
            setLiveNoiseSensitivity(0.5);
            setLiveNoiseAmount(0.5);
        }
    };

    const handleNormalize = async () => {
        if (!activeSample || !engine) return;

        setProcessingDialog({
            isOpen: true,
            type: 'normalize',
            onConfirm: async () => {
                setProcessingDialog(null);
                const newBuffer = await engine.normalize(activeSample.buffer!);
                if (newBuffer) {
                    const newBlob = engine.bufferToBlob(newBuffer);

                    // Auto-rename with _Normalized suffix
                    const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                    const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                    const newName = `${originalName}_Normalized.${extension}`;

                    const newSample: Sample = {
                        id: Date.now().toString(),
                        name: newName,
                        duration: formatDuration(newBuffer.duration),
                        bpm: activeSample.bpm,
                        size: `${(newBlob.size / 1024 / 1024).toFixed(2)} MB`,
                        waveform: [],
                        tags: ['Normalized', ...activeSample.tags.filter(t => t !== 'New')],
                        buffer: newBuffer,
                        blob: newBlob,
                        trimStart: 0,
                        trimEnd: 1
                    };
                    setSamples(prev => [newSample, ...prev]);
                    setActiveSample(newSample.id);
                }
            }
        });
    };




    const handleSetChopsLinked = (linked: boolean) => {
        setChopsLinked(linked);

        // If enabling link, snap chops together to remove gaps/overlaps
        if (linked && activeSample && chops.length > 1) {
            const sortedChops = chops.map(c => ({ ...c })).sort((a, b) => a.start - b.start);
            const bufferLen = activeSample.buffer?.length || 0;

            for (let i = 0; i < sortedChops.length - 1; i++) {
                const current = sortedChops[i];
                const next = sortedChops[i + 1];

                // Snap to next start (Anchor Starts)
                // User requested: "snap the ends to the starts"
                const target = next.start;

                current.end = target;
                current.endFrame = Math.floor(target * bufferLen);
                // next.start remains unchanged (it is the anchor)
            }

            if (activeSampleId) {
                setChops(activeSampleId, sortedChops);
            }
            setSamples(prev => prev.map(s =>
                s.id === activeSampleId ? { ...s, chops: sortedChops } : s
            ));
        }
    };



    // Convert chop points to Chop objects with MIDI note mapping
    const convertChopPointsToChops = (chopPoints: number[], buffer: AudioBuffer): Chop[] => {
        const baseNote = 60; // C4
        const chops: Chop[] = [];
        for (let i = 0; i < chopPoints.length - 1; i++) {
            const startFrame = chopPoints[i];
            const endFrame = chopPoints[i + 1];
            chops.push({
                id: `chop_${i}`,
                start: startFrame / buffer.length,
                end: endFrame / buffer.length,
                startFrame,
                endFrame,
                keyboardNote: baseNote + i
            });
        }
        return chops;
    };

    // Auto-detect BPM when auto chop is enabled (if not already detected)
    useEffect(() => {
        if (activeSample && engine && activeTab === TabView.CHOP && autoChoppingEnabled && chopSubTab === 'auto' && !activeSample.detectedBPM) {
            // Auto-detect BPM when auto chop is turned on
            (async () => {
                try {
                    const bpmResult = await engine.detectBPM(activeSample.buffer!);
                    if (bpmResult && (bpmResult.bpm || typeof bpmResult === 'number')) {
                        // Handle both {bpm: number} and number return types
                        const bpm = typeof bpmResult === 'number' ? bpmResult : bpmResult.bpm;
                        setSamples(prev => prev.map(s =>
                            s.id === activeSampleId ? { ...s, detectedBPM: bpm } : s
                        ));
                    }
                } catch (error) {
                    console.error('Auto BPM detection error:', error);
                }
            })();
        }
    }, [autoChoppingEnabled, activeSample?.buffer, activeSample?.detectedBPM, activeSample?.id, engine, activeTab, chopSubTab, activeSampleId]);

    // Dynamic auto chop with live preview
    // Only runs when controls change (chopThreshold, bpmWeight) OR when enabling auto chop
    // Does NOT run when switching samples - respects manual edits
    useEffect(() => {
        // Only proceed if auto chop is enabled and we're on the auto tab
        if (!(activeSample && engine && activeTab === TabView.CHOP && autoChoppingEnabled && chopSubTab === 'auto')) {
            // If auto chop is disabled, clear chops only if we're on auto tab
            if (!autoChoppingEnabled && chopSubTab === 'auto') {
                if (activeSampleId) {
                    setChops(activeSampleId, []);
                }
                setSamples(prev => prev.map(s =>
                    s.id === activeSampleId ? { ...s, chops: undefined } : s
                ));
            }
            return;
        }

        // Check if this sample has been manually edited - if so, don't auto-regenerate
        if (activeSampleId && manuallyEditedChops.has(activeSampleId)) {
            // Sample has been manually edited - don't overwrite
            return;
        }

        // Use async detection with BPM information
        (async () => {
            try {
                const detectedBPM = activeSample.detectedBPM || null;
                const bpmConfidence = activeSample.detectedBPM ? 0.8 : 0;

                const chopPoints = await engine.detectTransients(
                    activeSample.buffer!,
                    chopThreshold,
                    {
                        detectedBPM,
                        bpmConfidence,
                        bpmWeight: bpmWeight !== null ? bpmWeight : undefined
                    }
                );

                const newChops = convertChopPointsToChops(chopPoints, activeSample.buffer!);
                if (activeSampleId) {
                    setChops(activeSampleId, newChops);
                }

                // Update active sample with chops for sidebar display
                setSamples(prev => prev.map(s =>
                    s.id === activeSampleId ? { ...s, chops: newChops } : s
                ));

                // Auto-expand sample in sidebar when chops are created
                if (newChops.length > 0) {
                    setExpandedSamples(prev => new Set([...prev, activeSampleId]));
                }

                if (newChops.length > 0 && !activeChopId && activeSampleId) {
                    setActiveChopId(activeSampleId, newChops[0].id);
                }
            } catch (error) {
                console.error('Error detecting transients:', error);
            }
        })();
    }, [chopThreshold, bpmWeight, autoChoppingEnabled, chopSubTab, activeTab, engine, activeSample?.buffer, activeSample?.detectedBPM, activeSampleId, activeChopId, manuallyEditedChops]);

    // Clear manual edit flag when auto chop controls change (allows regeneration)
    useEffect(() => {
        if (activeSampleId && autoChoppingEnabled && chopSubTab === 'auto') {
            // When controls change, clear the manual edit flag so auto chop can regenerate
            setManuallyEditedChops(prev => {
                const updated = new Set(prev);
                updated.delete(activeSampleId);
                return updated;
            });
        }
    }, [chopThreshold, bpmWeight, activeSampleId, autoChoppingEnabled, chopSubTab]);

    // Dynamic equal chopping with live preview
    useEffect(() => {
        if (activeSample && engine && activeTab === TabView.CHOP && chopSubTab === 'equal' && chopSliceCount > 1) {
            // Clear manual edit flag when switching to equal chop (user is regenerating chops)
            if (activeSampleId) {
                setManuallyEditedChops(prev => {
                    const updated = new Set(prev);
                    updated.delete(activeSampleId);
                    return updated;
                });
            }

            // Create equal divisions as Chop objects
            const newChops: Chop[] = [];
            const bufferLength = activeSample.buffer!.length;
            const sliceLength = bufferLength / chopSliceCount;

            for (let i = 0; i < chopSliceCount; i++) {
                const startFrame = Math.floor(i * sliceLength);
                const endFrame = Math.floor((i + 1) * sliceLength);
                newChops.push({
                    id: `chop_${i}`,
                    start: i / chopSliceCount,
                    end: (i + 1) / chopSliceCount,
                    startFrame,
                    endFrame,
                    keyboardNote: 60 + i
                });
            }

            if (activeSampleId) {
                setChops(activeSampleId, newChops);
            }
            setSamples(prev => prev.map(s =>
                s.id === activeSampleId ? { ...s, chops: newChops } : s
            ));

            // Auto-expand sample in sidebar when chops are created
            if (newChops.length > 0) {
                setExpandedSamples(prev => new Set([...prev, activeSampleId]));
            }

            if (newChops.length > 0 && !activeChopId && activeSampleId) {
                setActiveChopId(activeSampleId, newChops[0].id);
            }
        } else if (chopSubTab === 'equal' && chopSliceCount <= 1) {
            if (activeSampleId) {
                setChops(activeSampleId, []);
            }
            setSamples(prev => prev.map(s =>
                s.id === activeSampleId ? { ...s, chops: undefined } : s
            ));
        }
    }, [chopSliceCount, activeSample?.buffer, activeSample?.id, engine, activeTab, chopSubTab]);

    // Keyboard event handling for chop playback
    useEffect(() => {
        if (!keyboardMappingEnabled || !engine || !activeSample || chops.length === 0) return;

        const handleKeyPress = (e: KeyboardEvent) => {
            // QWERTY to MIDI mapping (A=60, W=61, S=62, etc.)
            const keyMap: { [key: string]: number } = {
                'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65, 't': 66, 'g': 67,
                'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72, 'o': 73, 'l': 74, 'p': 75,
                ';': 76, 'z': 48, 'x': 49, 'c': 50, 'v': 51, 'b': 52, 'n': 53, 'm': 54
            };

            const note = keyMap[e.key.toLowerCase()];
            if (note !== undefined) {
                const chop = chops.find(c => c.keyboardNote === note);
                if (chop && activeSample.buffer) {
                    if (activeSampleId) {
                        setActiveChopId(activeSampleId, chop.id);
                    }
                    // Play chop with pitch shifting if needed
                    const pitchShift = Math.pow(2, (note - 60) / 12); // C4 = 60 is base
                    const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                    engine.play(activeSample.buffer, chop.start, chop.end, false, playbackRate);
                    // Note: pitch shifting would require modifying play() method
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [keyboardMappingEnabled, engine, activeSample, chops]);

    // Consolidated Global Spacebar Handler
    useEffect(() => {
        const handleSpacebar = async (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.code !== 'Space') return;
            // Ignore if input focused
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            e.preventDefault();

            // 1. Empty Sampler -> Toggle Record
            if (!activeSample && samples.length === 0) {
                if (isRecording) {
                    stopRecording();
                } else {
                    // Mute tab before starting recording if mute is enabled
                    await muteBeforeRecording();
                    
                    // Reset all effects before starting a new recording to ensure clean sample
                    usePlaybackStore.getState().resetEffects();
                    setNoiseGateEnabled(false);
                    setLiveNoiseSensitivity(0.5);
                    setLiveNoiseAmount(0.5);
                    startRecording();
                }
                return;
            }

            // 2. Manual Chop Logic
            if (manualChoppingEnabled && activeSample && activeTab === TabView.CHOP && chopSubTab === 'manual') {
                if (!isPlaying) {
                    // Check for active chop to resume from (Consumer requirement #3)
                    if (activeChopId) {
                        const chop = chops.find(c => c.id === activeChopId);
                        if (chop && activeSample.buffer) {
                            // Resume from slice start
                            setPlaying(true);

                            // Overwrite future: Remove chops after this point
                            // Keep points <= chop.start
                            const keptPoints = manualChopPoints.filter(p => p <= chop.start);
                            // Ensure start point exists if > 0
                            if (chop.start > 0 && !keptPoints.includes(chop.start)) {
                                keptPoints.push(chop.start);
                            }
                            const uniquePoints = Array.from(new Set(keptPoints)).sort((a, b) => a - b);

                            setManualChopPoints(uniquePoints);

                            // Construct Chops Inline
                            const newChops: Chop[] = [];
                            for (let i = 0; i < uniquePoints.length - 1; i++) {
                                newChops.push({
                                    id: `manual_chop_${Date.now()}_${i}`,
                                    start: uniquePoints[i],
                                    end: uniquePoints[i + 1],
                                    startFrame: Math.floor(uniquePoints[i] * activeSample.buffer.length),
                                    endFrame: Math.floor(uniquePoints[i + 1] * activeSample.buffer.length),
                                    keyboardNote: 60 + i
                                });
                            }
                            // Add final segment
                            const lastP = uniquePoints[uniquePoints.length - 1];
                            if (lastP < 0.999) {
                                newChops.push({
                                    id: `manual_chop_${Date.now()}_last`,
                                    start: lastP,
                                    end: 1,
                                    startFrame: Math.floor(lastP * activeSample.buffer.length),
                                    endFrame: activeSample.buffer.length,
                                    keyboardNote: 60 + newChops.length
                                });
                            }

                            if (activeSampleId) {
                                setChops(activeSampleId, newChops);
                            }
                            setSamples(prev => prev.map(s =>
                                s.id === activeSampleId ? { ...s, chops: newChops } : s
                            ));

                            // Play from start
                            engine.play(activeSample.buffer, chop.start, 1, false);
                            return;
                        }
                    }

                    // Default Start
                    setPlaying(true);
                    engine.play(activeSample.buffer!, 0, 1, false);
                } else {
                    // Add chop point
                    if (engine.context && engine.playbackStartTime !== undefined) {
                        const elapsed = engine.context.currentTime - engine.playbackStartTime;
                        const duration = activeSample.buffer!.duration;
                        const position = Math.max(0, Math.min(1, elapsed / duration));

                        // Add new point
                        const currentPoints = manualChopPoints.length === 0 ? [0] : manualChopPoints;
                        const newPoints = [...currentPoints, position];
                        const uniquePoints = Array.from(new Set(newPoints)).sort((a, b) => a - b);

                        setManualChopPoints(uniquePoints);

                        // Construct Chops
                        const newChops: Chop[] = [];
                        for (let i = 0; i < uniquePoints.length - 1; i++) {
                            newChops.push({
                                id: `manual_chop_${Date.now()}_${i}`,
                                start: uniquePoints[i],
                                end: uniquePoints[i + 1],
                                startFrame: Math.floor(uniquePoints[i] * activeSample.buffer!.length),
                                endFrame: Math.floor(uniquePoints[i + 1] * activeSample.buffer!.length),
                                keyboardNote: 60 + i
                            });
                        }
                        const lastP = uniquePoints[uniquePoints.length - 1];
                        if (lastP < 0.999) {
                            newChops.push({
                                id: `manual_chop_${Date.now()}_last`,
                                start: lastP,
                                end: 1,
                                startFrame: Math.floor(lastP * activeSample.buffer!.length),
                                endFrame: activeSample.buffer!.length,
                                keyboardNote: 60 + newChops.length
                            });
                        }

                        if (activeSampleId) {
                            setChops(activeSampleId, newChops);
                        }
                        setSamples(prev => prev.map(s =>
                            s.id === activeSampleId ? { ...s, chops: newChops } : s
                        ));

                        // Auto-expand and select last chop
                        setExpandedSamples(prev => new Set([...prev, activeSampleId]));
                        if (newChops.length > 0) {
                            // Find the chop that corresponds to the newly added point (it starts at position)
                            // or just select the one we are currently "in".
                            // Usually the one starting at 'position'.
                            const newChop = newChops.find(c => Math.abs(c.start - position) < 0.0001);
                            if (newChop && activeSampleId) {
                                setActiveChopId(activeSampleId, newChop.id);
                            }
                        }
                    }
                }
            }


            // 3. Standard Playback
            if (activeSample && engine) {
                if (isPlaying) {
                    setPlaying(false);
                    engine.stop();
                } else {
                    // Play Selection if Active (Consumer requirement #2)
                    const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                    // Only play chops when CHOP tab is active
                    if (activeChopId && !manualChoppingEnabled && activeTab === TabView.CHOP) {
                        const chop = chops.find(c => c.id === activeChopId);
                        if (chop && activeSample.buffer) {
                            setPlaying(true);
                            engine.play(activeSample.buffer, chop.start, chop.end, isLooping, playbackRate);
                            return;
                        }
                    }

                    // Fallback: Play full sample region
                    setPlaying(true);
                    engine.play(activeSample.buffer!, region.start, region.end, isLooping, playbackRate);
                }
            }

        };

        window.addEventListener('keydown', handleSpacebar);
        return () => window.removeEventListener('keydown', handleSpacebar);
    }, [manualChoppingEnabled, engine, activeSample, isPlaying, activeTab, chopSubTab, activeSampleId, manualChopPoints, region, activeChopId, chops]);

    // Sync store with AudioEngine and handle sample changes
    useEffect(() => {
        if (engine) {
            usePlaybackStore.getState().syncWithEngine(engine);
        }
    }, [engine, isPlaying, isLooping]);

    // Reset Chop State on Sample Change
    useEffect(() => {
        // Stop playback and preview when switching samples (Consumer requirement #5)
        if (isPlaying) {
            setPlaying(false);
            if (engine) engine.stop();
        }

        // Stop any active preview
        // Stop any time-stretch preview if active (legacy cleanup)
        if (isPreviewingStretch) {
            setPreviewingStretch(false);
        }

        if (activeSample && activeSampleId) {
            // Load chops from sample or store
            const sampleChops = activeSample.chops || getSampleChops(activeSampleId);
            setChops(activeSampleId, sampleChops);
            setActiveChopId(activeSampleId, null);
            // Optional: Reset manual mode to avoid confusion?
            // The user report says "chop mode overlay doesnt disable", suggesting they expect it to clear.
            setManualChopPoints([]);
            // We usually want to keep the mode enabled if they are slicing multiple things, 
            // but we MUST clear the points so the old lines don't show up.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSampleId, engine]); // Don't include isPlaying/isPreviewingStretch - they would cause infinite loops

    // Note: Effects are reset explicitly when:
    // 1. Applying effects to create a new sample (in applyEffectsAndResample handler)
    // 2. Time stretching to create a new sample (in time stretch handler)
    // We don't automatically reset when switching samples to avoid breaking playback
    // when creating new samples via crop/normalize/etc.

    // Check if there are pending changes (region or effects)
    const hasPendingChanges = () => {
        // Check if region is modified (not full sample)
        const regionModified = region.start !== 0 || region.end !== 1;

        // Check if EQ is enabled with non-zero gains
        const eqActive = eqEnabled && (lowGain !== 0 || midGain !== 0 || highGain !== 0);

        // Check if Noise Gate is enabled
        const noiseGateActive = noiseGateEnabled;

        // Check if Time Stretch is enabled with non-default ratio
        const timeStretchActive = timeStretchEnabled && timeStretchRatio !== 1.0;

        return regionModified || eqActive || noiseGateActive || timeStretchActive;
    };

    // Check if there's a pending crop (region adjustment)
    const hasPendingCrop = () => {
        return region.start !== 0 || region.end !== 1;
    };

    // Helper function to apply time stretch (with optional crop)
    const applyTimeStretch = async (applyCrop: boolean = false) => {
        if (!activeSample?.buffer || !engine) {
            console.error('Cannot time stretch: missing buffer or engine');
            alert('Cannot time stretch: Please select a sample with audio data');
            return;
        }

        // Capture all needed data before async operations
        const currentSampleId = activeSample.id;
        let sourceBuffer = activeSample.buffer;
        const currentName = activeSample.name;
        const currentBpm = activeSample.bpm;
        const currentTags = [...activeSample.tags];

        // Apply crop first if requested
        if (applyCrop) {
            const tempSampleStub = {
                buffer: sourceBuffer,
                trimStart: region.start,
                trimEnd: region.end
            };
            const croppedBuffer = await engine.crop(tempSampleStub);
            if (croppedBuffer) {
                sourceBuffer = croppedBuffer;
                // Reset region after crop is applied
                if (activeSampleId) {
                    setRegion(activeSampleId, { start: 0, end: 1 });
                }
            }
        }

        console.log('Starting time stretch...', {
            sampleId: currentSampleId,
            ratio: timeStretchRatio,
            bufferLength: sourceBuffer.length,
            sampleRate: sourceBuffer.sampleRate,
            applyCrop
        });

        setTimeStretchProgress(0);
        setSamples(prevSamples =>
            prevSamples.map(s =>
                s.id === currentSampleId ? { ...s, isTimeStretching: true } : s
            )
        );

        try {
            // Detect BPM before stretching
            let originalBPM: number | null = null;
            try {
                const bpmResult = await engine.detectBPM(sourceBuffer);
                if (bpmResult && bpmResult.bpm) {
                    originalBPM = bpmResult.bpm;
                    console.log('Detected BPM before stretching:', originalBPM);
                }
            } catch (bpmError) {
                console.warn('BPM detection failed, continuing without BPM update:', bpmError);
            }

            // Calculate new BPM based on stretch ratio
            const newBPM = originalBPM ? originalBPM * timeStretchRatio : currentBpm;

            const stretched = await engine.timeStretch(
                sourceBuffer,
                timeStretchRatio,
                (progress) => {
                    setTimeStretchProgress(progress);
                }
            );

            if (!stretched || !stretched.length) {
                throw new Error('Time stretch returned invalid buffer');
            }

            console.log('Time stretch completed successfully', {
                originalLength: sourceBuffer.length,
                stretchedLength: stretched.length,
                originalDuration: sourceBuffer.duration,
                stretchedDuration: stretched.duration,
                originalBPM,
                newBPM
            });

            const blob = audioBufferToWav(stretched);
            const originalName = currentName.replace(/\.(wav|mp3|flac|ogg)$/i, '');
            const extension = currentName.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
            const suffix = applyCrop ? '_Cropped_Stretched' : '_Stretched';
            const newName = `${originalName}${suffix}_${timeStretchRatio.toFixed(2)}x.${extension}`;

            const newSample: Sample = {
                id: Date.now().toString(),
                name: newName,
                duration: formatDuration(stretched.duration),
                bpm: typeof newBPM === 'number' ? Math.round(newBPM) : newBPM,
                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: [...currentTags, 'Time Stretched', ...(applyCrop ? ['Cropped'] : [])],
                buffer: stretched,
                blob: blob,
                trimStart: 0,
                trimEnd: 1,
                detectedBPM: typeof newBPM === 'number' ? newBPM : undefined
            };

            // Use functional updates to ensure we have the latest state
            setSamples(prevSamples => {
                // First, clear the isTimeStretching flag from the original sample
                const updatedSamples = prevSamples.map(s =>
                    s.id === currentSampleId ? { ...s, isTimeStretching: false } : s
                );
                // Then add the new sample at the beginning
                return [newSample, ...updatedSamples];
            });

            // Set the new sample as active
            console.log('Setting new sample as active:', newSample.id, newSample.name);
            setActiveSample(newSample.id);

            // Reset only time stretch effect after baking (not all effects)
            // This prevents double application when the new stretched sample is played
            setTimeStretchEnabled(false);
            setTimeStretchRatio(1.0);
            setPreviewingStretch(false);
            prevStretchRatioRef.current = 1.0;
        } catch (error) {
            console.error('Time stretch error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Error details:', { error, errorMessage, stack: error instanceof Error ? error.stack : undefined });
            alert(`Time stretch failed: ${errorMessage}\n\nCheck the console for more details.`);

            // Clear the isTimeStretching flag on error and preserve active sample
            setSamples(prevSamples =>
                prevSamples.map(s =>
                    s.id === currentSampleId ? { ...s, isTimeStretching: false } : s
                )
            );
            // Make sure we don't deselect the sample on error
            setActiveSample(currentSampleId);
        } finally {
            setTimeStretchProgress(0);
        }
    };

    // Chopping handlers
    const handleCreateChopSamples = async (applyProcessing: boolean = false) => {
        if (!activeSample || !engine || chops.length === 0) return;

        // If applying processing, first process the sample with current settings
        let sourceBuffer = activeSample.buffer!;
        if (applyProcessing) {
            // Apply region crop if region is modified
            if (region.start !== 0 || region.end !== 1) {
                const tempSampleStub = {
                    buffer: sourceBuffer,
                    trimStart: region.start,
                    trimEnd: region.end
                };
                sourceBuffer = await engine.crop(tempSampleStub) || sourceBuffer;
                // Reset region after crop is applied
                if (activeSampleId) {
                    setRegion(activeSampleId, { start: 0, end: 1 });
                }
            }

            // Apply EQ if enabled
            if (eqEnabled && (lowGain !== 0 || midGain !== 0 || highGain !== 0)) {
                sourceBuffer = await engine.applyEffectsAndResample(sourceBuffer) || sourceBuffer;
            }
        }

        const newSamples: Sample[] = [];
        for (let i = 0; i < chops.length; i++) {
            const chop = chops[i];
            const tempSampleStub = {
                buffer: sourceBuffer,
                trimStart: chop.start,
                trimEnd: chop.end
            };
            const chopBuffer = await engine.crop(tempSampleStub);

            if (chopBuffer) {
                const blob = engine.bufferToBlob(chopBuffer);
                const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                const newSample: Sample = {
                    id: `${Date.now()}_chop${i}`,
                    name: `${originalName}_chop${i + 1}.${extension}`,
                    duration: formatDuration(chopBuffer.duration),
                    bpm: activeSample.bpm,
                    size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                    waveform: [],
                    tags: ['Chopped', ...activeSample.tags.filter(t => t !== 'New')],
                    buffer: chopBuffer,
                    blob: blob,
                    trimStart: 0,
                    trimEnd: 1
                };
                newSamples.push(newSample);
            }
        }

        setSamples(prev => [...newSamples, ...prev]);
        if (activeSampleId) {
            setChops(activeSampleId, []); // Clear chops after creating samples
            setActiveChopId(activeSampleId, null);
        }

        // Reset only the effects that were applied (EQ in this case) if processing was applied
        if (applyProcessing) {
            // Only reset EQ since that's what gets applied during chop processing
            setEQEnabled(false);
            setLowGain(0);
            setMidGain(0);
            setHighGain(0);
            setLowFreq(100);
            setMidFreq(1000);
            setHighFreq(8000);
            setMidQ(1.2);
        }
    };


    const handleClearChops = () => {
        // Clear all chops
        if (activeSampleId) {
            setChops(activeSampleId, []);
            setActiveChopId(activeSampleId, null);
        }

        // Clear chops from all samples in the tree
        setSamples(prev => prev.map(s => ({ ...s, chops: undefined })));

        // Turn off all chop modes
        setAutoChoppingEnabled(false);
        setManualChoppingEnabled(false);
        setManualChopPoints([]);

        // Clear expanded samples that only had chops
        setExpandedSamples(new Set());
    };

    const handleExtractActiveChop = async () => {
        if (!activeSample || !engine || !activeChopId) return;

        const chop = chops.find(c => c.id === activeChopId);
        if (!chop) return;

        const tempSampleStub = {
            buffer: activeSample.buffer!,
            trimStart: chop.start,
            trimEnd: chop.end
        };
        console.log('[Extract] Chopping:', {
            chopId: chop.id,
            start: chop.start,
            end: chop.end,
            bufDuration: activeSample.buffer!.duration
        });
        const chopBuffer = await engine.crop(tempSampleStub);

        if (chopBuffer) {
            const blob = engine.bufferToBlob(chopBuffer);
            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
            const chopIndex = chops.findIndex(c => c.id === activeChopId) + 1;

            const newSample: Sample = {
                id: `${Date.now()}_extract_${activeChopId}`,
                name: `${originalName}_Slice_${chopIndex}.${extension}`,
                duration: formatDuration(chopBuffer.duration),
                bpm: activeSample.bpm,
                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: ['Extracted', ...activeSample.tags.filter(t => t !== 'New')],
                buffer: chopBuffer,
                blob: blob,
                trimStart: 0,
                trimEnd: 1
            };

            setSamples(prev => [newSample, ...prev]);
            // Optional: Switch to new sample? 
            // setActiveSampleId(newSample.id); 
            // Maybe just expand sidebar to show it?
        }
    };

    // Add button to process slices into individual samples
    const handleProcessSlices = async () => {
        if (!activeSample || !engine || chops.length === 0) return;

        // Check if there are pending changes (region or effects)
        if (hasPendingChanges()) {
            // Show dialog asking if user wants to apply processing
            setProcessingDialog({
                isOpen: true,
                type: 'chop-with-processing',
                onConfirm: async () => {
                    setProcessingDialog(null);
                    await handleCreateChopSamples(false); // Chop only
                },
                onApplyAndChop: async () => {
                    setProcessingDialog(null);
                    await handleCreateChopSamples(true); // Apply processing then chop
                }
            });
        } else {
            // No pending changes, just chop normally
            setProcessingDialog({
                isOpen: true,
                type: 'chop',
                onConfirm: async () => {
                    setProcessingDialog(null);
                    await handleCreateChopSamples(false);
                }
            });
        }
    };

    // Clear chops when switching chop modes
    useEffect(() => {
        if (activeTab === TabView.CHOP && chops.length > 0) {
            // Clear chops when switching between modes
            handleClearChops();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chopSubTab]);

    return (
        <div className="h-full w-full bg-black text-white font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">
            {/* GLOBAL HEADER */}
            <header className="h-16 border-b border-zinc-800 flex items-center bg-zinc-950 shrink-0 z-50 relative overflow-hidden">
                {/* LOGO CONTAINER - Simplified */}
                <div className="min-w-[180px] w-64 max-w-[240px] h-full border-r border-zinc-800 flex items-center px-4 xl:px-6 gap-2 text-indigo-400 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Logo size={24} className="shrink-0 xl:w-6 xl:h-6" />
                        <div className="flex flex-col min-w-0">
                            <h1 className="font-bold text-base xl:text-lg tracking-tight text-white truncate">uSampler</h1>
                        </div>
                    </div>
                </div>

                {/* MAIN CONTROLS AREA - Distinct containers with proper spacing */}
                <div className="flex-1 flex items-center gap-4 xl:gap-6 px-4 xl:px-6 min-w-0 overflow-x-auto scrollbar-hide">
                    {/* SOURCE CONTAINER */}
                    <div className="flex items-center gap-2 xl:gap-3 shrink-0 min-w-0 px-2 xl:px-4">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[9px] xl:text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-0.5">Source</span>
                            <div className="flex items-center gap-1.5 xl:gap-2">
                                <div className="relative group min-w-0">
                                    <button
                                        onClick={async () => {
                                            // Disconnect existing source first to allow selecting a new one
                                            if (engine && engine.sourceNode) {
                                                engine.sourceNode.disconnect();
                                                engine.sourceNode = null;
                                                setIsSourceConnected(false);
                                            }

                                            // Open source selection dialog
                                            const success = await selectSource();
                                            if (success) {
                                                setActiveSourceTitle('Display Media');
                                                setIsSourceConnected(true);
                                                // Capture tab ID from URL parameter (the tab where extension icon was clicked)
                                                const urlParams = new URLSearchParams(window.location.search);
                                                const targetTabIdParam = urlParams.get('targetTabId');
                                                if (targetTabIdParam && chrome?.tabs) {
                                                    const tabId = parseInt(targetTabIdParam, 10);
                                                    if (!isNaN(tabId)) {
                                                        console.log(`[App] Captured source tab ID from URL: ${tabId}`);
                                                        setSourceTabId(tabId);
                                                    }
                                                } else if (chrome?.tabs && sourceTabId === null) {
                                                    // Fallback: query active tab (may not be the source tab)
                                                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                                        if (tabs[0]?.id) {
                                                            console.log(`[App] Captured source tab ID from active tab: ${tabs[0].id}`);
                                                            setSourceTabId(tabs[0].id);
                                                        }
                                                    });
                                                }
                                            } else {
                                                setIsSourceConnected(false);
                                                // Don't clear sourceTabId - keep it for next connection attempt
                                            }
                                        }}
                                        className="flex items-center gap-1.5 xl:gap-2 text-xs xl:text-sm text-zinc-200 hover:text-white font-medium transition-colors min-w-0 cursor-pointer"
                                        title="Select audio source (tab/window)"
                                    >
                                        <MonitorPlay className={`w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0 ${isSourceConnected ? 'text-green-500' : 'text-red-500'}`} />
                                        <span className="truncate max-w-[100px] xl:max-w-[120px]">{isSourceConnected ? activeSourceTitle : 'Select Source'}</span>
                                        <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                                    </button>
                                </div>
                                <button
                                    onClick={async () => {
                                        // Check current connection status
                                        if (engine) {
                                            const isConnected = !!engine.sourceNode;
                                            setIsSourceConnected(isConnected);

                                            // If disconnected, reconnect (opens dialog)
                                            if (!isConnected) {
                                                const success = await selectSource();
                                                if (success) {
                                                    setActiveSourceTitle('Display Media');
                                                    setIsSourceConnected(true);
                                                } else {
                                                    setIsSourceConnected(false);
                                                }
                                            }
                                        } else {
                                            setIsSourceConnected(false);
                                        }
                                    }}
                                    className={`p-1.5 hover:bg-zinc-800 rounded-full transition-colors shrink-0 cursor-pointer ${isSourceConnected ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'}`}
                                    title={isSourceConnected ? "Audio source connected" : "Reconnect audio source"}
                                >
                                    <RefreshCcw className={`w-3 h-3 ${isSourceConnected ? '' : 'animate-pulse'}`} />
                                </button>
                                {/* Mute Source Toggle */}
                                {isSourceConnected && (
                                    <button
                                        onClick={async () => {
                                            const newValue = !muteSourceDuringRecording;
                                            setMuteSourceDuringRecording(newValue);
                                            
                                            // Ensure we have a tab ID
                                            let tabIdToUse = sourceTabId;
                                            if (tabIdToUse === null) {
                                                const urlParams = new URLSearchParams(window.location.search);
                                                const targetTabIdParam = urlParams.get('targetTabId');
                                                if (targetTabIdParam) {
                                                    const tabId = parseInt(targetTabIdParam, 10);
                                                    if (!isNaN(tabId)) {
                                                        tabIdToUse = tabId;
                                                        setSourceTabId(tabId);
                                                    }
                                                }
                                            }
                                            
                                            // If recording is active, apply mute/unmute immediately
                                            if (isRecording && tabIdToUse !== null) {
                                                if (newValue) {
                                                    console.log(`[App] Muting tab ${tabIdToUse} (toggle ON during recording)`);
                                                    await muteSourceTab(tabIdToUse);
                                                } else {
                                                    console.log(`[App] Unmuting tab ${tabIdToUse} (toggle OFF during recording)`);
                                                    await unmuteSourceTab(tabIdToUse);
                                                }
                                            }
                                        }}
                                        className={`p-1.5 hover:bg-zinc-800 rounded transition-colors shrink-0 cursor-pointer ${
                                            muteSourceDuringRecording 
                                                ? 'text-orange-500 hover:text-orange-400' 
                                                : 'text-zinc-500 hover:text-zinc-400'
                                        }`}
                                        title={muteSourceDuringRecording ? "Mute source tab during recording (ON) - Click to unmute" : "Mute source tab during recording (OFF) - Click to mute"}
                                    >
                                        {muteSourceDuringRecording ? (
                                            <VolumeX className="w-3.5 h-3.5" />
                                        ) : (
                                            <Volume2 className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* VERTICAL DIVIDER */}
                    <div className="w-px h-8 bg-zinc-800 shrink-0" />

                    {/* TRANSPORT CONTAINER - Grouped controls */}
                    <div className="flex items-center gap-2 xl:gap-3 shrink-0 px-2 xl:px-4">
                        <button
                            onClick={toggleArm}
                            className={`flex flex-col items-center justify-center px-2.5 xl:px-4 py-1.5 rounded transition-all border shrink-0 ${isArmed
                                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400'
                                }`}
                            title={isArmed ? "Disarm threshold recording" : "Arm threshold recording"}
                        >
                            <span className="text-[8px] xl:text-[9px] font-bold uppercase tracking-wider">ARM</span>
                            <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isArmed ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-700'}`} />
                        </button>

                        <button
                            onClick={() => setKeyboardMappingEnabled(!keyboardMappingEnabled)}
                            className={`flex flex-col items-center justify-center px-2.5 xl:px-4 py-1.5 rounded transition-all border shrink-0 ${keyboardMappingEnabled
                                ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400'
                                }`}
                            title={keyboardMappingEnabled ? "Disable keyboard mapping" : "Enable keyboard mapping (Ableton-style)"}
                        >
                            <Keyboard className="w-3 h-3 mb-0.5" />
                            <span className="text-[8px] xl:text-[9px] font-bold uppercase tracking-wider">KEY</span>
                        </button>

                        <div className="w-px h-8 bg-zinc-800 mx-0.5 xl:mx-1 shrink-0" />

                        <button
                            onClick={() => {
                                if (isRecording) stopRecording();
                                if (engine) engine.stop();
                                setPlaying(false);
                            }}
                            className="p-2 xl:p-2.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
                            title="Stop Recording/Playback"
                        >
                            <SkipBack className="w-4 h-4 xl:w-5 xl:h-5 fill-current" />
                        </button>

                        <button
                            onClick={() => {
                                if (isRecording) stopRecording();
                                if (engine) engine.stop();
                                setPlaying(false);
                            }}
                            className="p-2 xl:p-2.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0"
                            title="Stop Recording/Playback"
                        >
                            <Square className="w-4 h-4 xl:w-5 xl:h-5 fill-current" />
                        </button>

                        <button
                            onClick={handlePlayToggle}
                            title={isPlaying ? "Pause Playback" : "Play Sample"}
                            aria-label={isPlaying ? "Pause Playback" : "Play Sample"}
                            className={`w-10 h-10 xl:w-12 xl:h-12 rounded-full flex items-center justify-center transition-all border shrink-0 ${isPlaying
                                ? 'bg-indigo-500 border-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-zinc-600 hover:text-white'
                                }`}
                        >
                            {isPlaying ? <Pause className="w-5 h-5 xl:w-6 xl:h-6 fill-current" /> : <Play className="w-5 h-5 xl:w-6 xl:h-6 fill-current ml-0.5 xl:ml-1" />}
                        </button>

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newLoopState = !isLooping;

                                // Update the engine's loop state immediately (vanilla JS - maintains portability)
                                if (engine) {
                                    engine.isLooping = newLoopState;
                                }

                                // Update the Zustand store
                                setLooping(newLoopState);

                                // If loop is being turned OFF during active playback, we need to stop and restart
                                // without looping. This is because AudioBufferSourceNode's loop property can't be
                                // changed after starting - a looping source will loop forever until stopped.
                                if (isPlaying && !newLoopState && engine && activeSample?.buffer && engine.activeSource) {
                                    // Calculate current playback position
                                    const elapsed = engine.context.currentTime - engine.playbackStartTime;
                                    const playbackRate = engine.currentPlaybackRate || 1.0;
                                    const bufferTimeElapsed = elapsed * playbackRate;

                                    // Determine what we're playing (chop or region)
                                    let startPct = region.start;
                                    let endPct = region.end;

                                    if (activeChopId && activeTab === TabView.CHOP) {
                                        const chop = chops.find(c => c.id === activeChopId);
                                        if (chop) {
                                            startPct = chop.start;
                                            endPct = chop.end;
                                        }
                                    }

                                    const duration = activeSample.buffer.duration;
                                    const regionStart = startPct * duration;
                                    const regionEnd = endPct * duration;
                                    const regionDuration = regionEnd - regionStart;

                                    // Calculate current position within the region (accounting for looping)
                                    let currentPositionInRegion = (bufferTimeElapsed % regionDuration);
                                    const currentBufferPosition = regionStart + currentPositionInRegion;
                                    const currentPositionPct = currentBufferPosition / duration;

                                    // Stop current playback with fade-out to prevent crackling
                                    engine.stop(true); // Use fade-out

                                    // Restart from current position without looping
                                    setTimeout(() => {
                                        if (engine && activeSample?.buffer && !engine.activeSource) {
                                            // Clamp position to region bounds
                                            const clampedPosition = Math.max(startPct, Math.min(currentPositionPct, endPct));

                                            // Store the current time before calling play()
                                            const restartTime = engine.context.currentTime;

                                            if (activeChopId && activeTab === TabView.CHOP) {
                                                const chop = chops.find(c => c.id === activeChopId);
                                                if (chop && activeSample.buffer) {
                                                    engine.play(activeSample.buffer, clampedPosition, chop.end, false);

                                                    // Adjust playbackStartTime so playhead continues smoothly
                                                    // Calculate how much buffer time we've already played
                                                    const positionOffset = (clampedPosition - startPct) * duration;
                                                    const realTimeOffset = positionOffset / playbackRate;
                                                    engine.playbackStartTime = restartTime - realTimeOffset;

                                                    setPlaying(true);
                                                }
                                            } else {
                                                engine.play(activeSample.buffer, clampedPosition, region.end, false);

                                                // Adjust playbackStartTime so playhead continues smoothly
                                                const positionOffset = (clampedPosition - startPct) * duration;
                                                const realTimeOffset = positionOffset / playbackRate;
                                                engine.playbackStartTime = restartTime - realTimeOffset;

                                                setPlaying(true);
                                            }
                                        }
                                    }, 10);
                                }
                            }}
                            title={isLooping ? "Disable Loop" : "Enable Loop"}
                            aria-label={isLooping ? "Disable Loop" : "Enable Loop"}
                            className={`w-10 h-10 xl:w-12 xl:h-12 rounded-full flex items-center justify-center transition-all border ml-0.5 xl:ml-1 shrink-0 ${isLooping
                                ? 'bg-green-600 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-600 hover:text-green-400'
                                }`}
                        >
                            <Repeat className="w-4 h-4 xl:w-5 xl:h-5" />
                        </button>

                        <button
                            onClick={toggleRecord}
                            title={isRecording ? "Stop Recording" : "Start Recording"}
                            className={`w-10 h-10 xl:w-12 xl:h-12 rounded-full flex items-center justify-center border transition-all ml-0.5 xl:ml-1 shrink-0 ${isRecording
                                ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]'
                                : 'bg-zinc-900 border-red-900/40 text-red-600 hover:text-red-500 hover:border-red-500 hover:bg-red-950/20 shadow-[0_0_10px_rgba(220,38,38,0.1)]'
                                }`}
                        >
                            <div className={`rounded-full transition-all ${isRecording ? 'w-3.5 h-3.5 xl:w-4 xl:h-4 bg-white rounded-sm' : 'w-4 h-4 xl:w-5 xl:h-5 bg-current'}`} />
                        </button>
                    </div>

                    {/* VERTICAL DIVIDER */}
                    <div className="w-px h-8 bg-zinc-800 shrink-0" />

                    {/* TIME & STATUS CONTAINER - Combined right-aligned */}
                    <div className="flex items-center gap-4 shrink-0 px-2 xl:px-4 min-w-0 ml-auto">
                        <div className="flex items-center gap-2 shrink-0 min-w-0">
                            <div className="text-[10px] xl:text-xs font-mono text-zinc-400 whitespace-nowrap min-w-0">
                                {formatDuration(playbackTime.current)} / {formatDuration(playbackTime.total)}
                            </div>
                        </div>
                        <div className="flex justify-end shrink-0 min-w-[80px] xl:min-w-[120px]">
                            {isRecording ? (
                                <span className="flex items-center gap-2 text-[10px] xl:text-xs text-red-500 animate-pulse font-bold tracking-widest font-mono">
                                    <div className="w-2 h-2 rounded-full bg-red-500" />
                                    RECORDING
                                </span>
                            ) : isArmed ? (
                                <button
                                    onClick={() => {
                                        setActiveSample('');
                                        if (activeSampleId) {
                                            setRegion(activeSampleId, { start: 0, end: 1 });
                                        }
                                        setPlaying(false);
                                        if (engine) engine.stop();
                                        if (activeSampleId) {
                                            setActiveChopId(activeSampleId, null);
                                        }
                                    }}
                                    className="text-[10px] xl:text-xs text-yellow-600 hover:text-yellow-500 font-medium tracking-wide font-mono transition-colors cursor-pointer"
                                    title="Clear workspace for new sample"
                                >
                                    READY TO RECORD
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setActiveSample('');
                                        if (activeSampleId) {
                                            setRegion(activeSampleId, { start: 0, end: 1 });
                                        }
                                        setPlaying(false);
                                        if (engine) engine.stop();
                                        if (activeSampleId) {
                                            setActiveChopId(activeSampleId, null);
                                        }
                                    }}
                                    className="text-[10px] xl:text-xs text-zinc-500 hover:text-zinc-400 font-medium tracking-wide font-mono transition-colors cursor-pointer"
                                    title="Clear workspace for new sample"
                                >
                                    New Sample
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            </header>

            {/* MAIN WORKSPACE ROW */}
            <div className="flex-1 flex min-h-0">
                {/* LEFT: Library Sidebar */}
                <Sidebar
                    samples={samples.map(s => s.id === activeSampleId ? { ...s, chops } : s)}
                    activeSampleId={activeSampleId}
                    activeChopId={activeChopId}
                    expandedSamples={expandedSamples}
                    selectedSampleIds={selectedSampleIds}
                    onSelectSample={handleSelectSample}
                    onSaveAs={handleSaveAs}
                    onExportAll={handleExportAll}
                    onSaveSession={() => setSessionDialogMode('save')}
                    onLoadSession={() => setSessionDialogMode('load')}
                    onSelectChop={(sampleId, chopId) => {
                        handleSelectSample(sampleId);
                        setActiveSample(sampleId);
                        setActiveChopId(sampleId, chopId);
                        const chop = chops.find(c => c.id === chopId);
                        if (chop && engine && activeSample?.buffer) {
                            engine.playSnippet(activeSample.buffer, chop.start, 0.2);
                        }
                    }}
                    onToggleExpand={(id) => {
                        const newExpanded = new Set(expandedSamples);
                        if (newExpanded.has(id)) {
                            newExpanded.delete(id);
                        } else {
                            newExpanded.add(id);
                        }
                        setExpandedSamples(newExpanded);
                    }}
                    onDeleteSample={handleDeleteSample}
                    onDuplicateSample={handleDuplicateSample}
                    onRenameSample={handleRenameSample}
                />

                {/* CENTER: Work Area - Must be able to grow */}
                <main className="flex-1 flex flex-col bg-zinc-950/50 min-w-0 min-h-0 overflow-hidden">
                    {/* Waveform - Dynamic height based on split ratio */}
                    <div
                        className="flex flex-col bg-zinc-900/50 border-b border-zinc-800 relative min-h-0 overflow-hidden"
                        style={{ height: `${splitRatio * 100}%` }}
                    >
                        {activeSample ? (
                            <>
                                {/* Header Bar - Compact */}
                                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-950/50 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                                            {activeSample.name}
                                            <span className="text-[10px] font-normal text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">{activeSample.duration}</span>
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleCrop}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-indigo-300 rounded text-[10px] font-bold tracking-wide uppercase border border-zinc-700 hover:border-indigo-500/50 transition-all"
                                            title="Create new sample from selection"
                                        >
                                            <Crop className="w-3 h-3" /> Crop
                                        </button>
                                        <button
                                            onClick={handleNormalize}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-green-300 rounded text-[10px] font-bold tracking-wide uppercase border border-zinc-700 hover:border-green-500/50 transition-all"
                                            title="Normalize audio levels"
                                        >
                                            <Volume2 className="w-3 h-3" /> Normalize
                                        </button>

                                    </div>
                                </div>

                                {/* Waveform Area - Constrained to available space */}
                                <div className="flex-1 relative min-h-0 max-h-full pb-8 overflow-hidden">
                                    <WaveformDisplay
                                        sample={activeSample}
                                        region={region}
                                        onRegionChange={(newRegion) => {
                                            if (activeSampleId) {
                                                setRegion(activeSampleId, newRegion);
                                            }
                                        }}
                                        isPlaying={isPlaying}
                                        isRecording={isRecording}
                                        chops={activeTab === TabView.CHOP ? chops : []}
                                        activeChopId={activeChopId}
                                        chopsLinked={chopsLinked}
                                        previewMode={activeTab === TabView.CHOP}
                                        isLooping={isLooping}
                                        onChopClick={(chopId) => {
                                            // Only allow chop playback when CHOP tab is active
                                            if (activeTab !== TabView.CHOP) return;

                                            if (activeSampleId) {
                                                setActiveChopId(activeSampleId, chopId);
                                            }
                                            const chop = chops.find(c => c.id === chopId);
                                            if (chop && engine && activeSample?.buffer) {
                                                const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                                                engine.play(activeSample.buffer, chop.start, chop.end, false, playbackRate);
                                            }
                                        }}
                                        onChopUpdate={(updatedChops) => {
                                            if (activeSampleId) {
                                                setChops(activeSampleId, updatedChops);
                                                // Mark this sample as manually edited to prevent auto chop from overwriting
                                                setManuallyEditedChops(prev => new Set(prev).add(activeSampleId));
                                            }
                                            setSamples(prev => prev.map(s =>
                                                s.id === activeSampleId ? { ...s, chops: updatedChops } : s
                                            ));
                                        }}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                {isRecording ? (
                                    <div className="w-full h-full absolute inset-0">
                                        <WaveformDisplay
                                            sample={null}
                                            region={{ start: 0, end: 1 }}
                                            onRegionChange={() => { }}
                                            isPlaying={false}
                                            isRecording={true}
                                        />
                                    </div>
                                ) : (
                                    <div className="text-center opacity-50">
                                        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4 animate-pulse">
                                            <Volume2 className="w-8 h-8 text-zinc-600" />
                                        </div>
                                        <h3 className="text-zinc-400 font-bold mb-1">Ready to Capture</h3>
                                        <p className="text-zinc-600 text-xs max-w-[200px]">Arm the sampler and click Record to start sampling from the active tab.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Resize Handle */}
                    <div
                        className="h-1 bg-zinc-800 hover:bg-indigo-600 cursor-ns-resize transition-colors relative group shrink-0"
                        onMouseDown={(e) => {
                            setIsResizing(true);
                            e.preventDefault();
                        }}
                    >
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-0.5 bg-zinc-600 group-hover:bg-indigo-400 rounded transition-colors" />
                        </div>
                    </div>

                    {/* Bottom Panel: Tabbed Tools - Dynamic height based on split ratio */}
                    <div
                        className="bg-zinc-900 border-t border-zinc-800 flex flex-col shrink-0 overflow-hidden min-h-[300px]"
                        style={{ height: `${(1 - splitRatio) * 100}%` }}
                    >
                        <div className="flex border-b border-zinc-800 bg-zinc-950 shrink-0">
                            <button
                                onClick={() => setActiveTab(TabView.MAIN)}
                                className={`px-3 py-2.5 text-[10px] font-bold tracking-normal whitespace-nowrap transition-colors border-r border-zinc-800 flex-1 min-w-0 ${activeTab === TabView.MAIN ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                INFO
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.CHOP)}
                                className={`px-3 py-2.5 text-[10px] font-bold tracking-normal whitespace-nowrap transition-colors border-r border-zinc-800 flex items-center justify-center gap-1.5 flex-1 min-w-0 ${activeTab === TabView.CHOP ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Scissors className="w-2.5 h-2.5 shrink-0" /> <span>CHOP</span>
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.EQ)}
                                className={`px-3 py-2.5 text-[10px] font-bold tracking-normal whitespace-nowrap transition-colors border-r border-zinc-800 flex items-center justify-center gap-1.5 flex-1 min-w-0 ${activeTab === TabView.EQ ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Sliders className="w-2.5 h-2.5 shrink-0" /> <span>EQ</span>
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.NOISE)}
                                className={`px-3 py-2.5 text-[10px] font-bold tracking-normal whitespace-nowrap transition-colors border-r border-zinc-800 flex items-center justify-center gap-1.5 flex-1 min-w-0 ${activeTab === TabView.NOISE ? 'text-blue-400 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Volume2 className="w-2.5 h-2.5 shrink-0" /> <span>NOISE</span>
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.TIME_STRETCH)}
                                className={`px-3 py-2.5 text-[10px] font-bold tracking-normal whitespace-nowrap transition-colors border-r border-zinc-800 flex items-center justify-center gap-1.5 flex-1 min-w-0 ${activeTab === TabView.TIME_STRETCH ? 'text-indigo-400 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Gauge className="w-2.5 h-2.5 shrink-0" /> <span className="truncate">TIME STRETCH</span>
                            </button>
                        </div>

                        <div className="flex-1 relative p-4 bg-zinc-900 overflow-auto min-h-0">
                            {activeTab === TabView.MAIN && activeSample && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-full">
                                    <div className="min-w-0">
                                        <h4 className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-3 sticky top-0 bg-zinc-900 pb-2 z-10">Sample Metadata</h4>
                                        <div className="space-y-2">
                                            {activeSample.buffer && (
                                                <>
                                                    <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                        <span className="text-zinc-500 shrink-0">Sample Rate</span>
                                                        <span className="text-zinc-200 font-mono text-xs truncate">
                                                            {activeSample.buffer.sampleRate % 1000 === 0
                                                                ? `${(activeSample.buffer.sampleRate / 1000).toFixed(0)}.0 kHz`
                                                                : `${(activeSample.buffer.sampleRate / 1000).toFixed(1)} kHz`}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                        <span className="text-zinc-500 shrink-0">Bit Depth</span>
                                                        <span className="text-zinc-200 font-mono text-xs">32-bit (Float)</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                        <span className="text-zinc-500 shrink-0">Channels</span>
                                                        <span className="text-zinc-200 font-mono text-xs">
                                                            {activeSample.buffer.numberOfChannels === 1 ? 'Mono' :
                                                                activeSample.buffer.numberOfChannels === 2 ? 'Stereo' :
                                                                    `${activeSample.buffer.numberOfChannels} Channels`}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                        <span className="text-zinc-500 shrink-0">Format</span>
                                                        <span className="text-zinc-200 font-mono text-xs">
                                                            {activeSample.blob?.type === 'audio/webm' ? 'WebM' :
                                                                activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1]?.toUpperCase() || 'WAV'}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                <span className="text-zinc-500 shrink-0">Duration</span>
                                                <span className="text-zinc-200 font-mono text-xs">{activeSample.duration}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                <span className="text-zinc-500 shrink-0">Size</span>
                                                <span className="text-zinc-200 font-mono text-xs">{activeSample.size}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                <span className="text-zinc-500 shrink-0">BPM</span>
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="text-zinc-200 font-mono text-xs">
                                                        {activeSample.detectedBPM || activeSample.bpm || '—'}
                                                    </span>
                                                    {(activeSample.detectedBPM || activeSample.bpm) && (
                                                        <div className="flex items-center gap-0.5 shrink-0">
                                                            <button
                                                                onClick={() => {
                                                                    const bpmValue = activeSample.detectedBPM || (typeof activeSample.bpm === 'number' ? activeSample.bpm : Number(activeSample.bpm)) || 0;
                                                                    if (bpmValue > 0) {
                                                                        const newBPM = bpmValue * 2;
                                                                        setSamples(prev => prev.map(s =>
                                                                            s.id === activeSampleId
                                                                                ? { ...s, detectedBPM: newBPM, bpm: newBPM }
                                                                                : s
                                                                        ));
                                                                    }
                                                                }}
                                                                className="px-1.5 py-0.5 text-[9px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                                                                title="Double BPM (x2)"
                                                            >
                                                                x2
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const bpmValue = activeSample.detectedBPM || (typeof activeSample.bpm === 'number' ? activeSample.bpm : Number(activeSample.bpm)) || 0;
                                                                    if (bpmValue > 0) {
                                                                        const newBPM = Math.round(bpmValue / 2);
                                                                        setSamples(prev => prev.map(s =>
                                                                            s.id === activeSampleId
                                                                                ? { ...s, detectedBPM: newBPM, bpm: newBPM }
                                                                                : s
                                                                        ));
                                                                    }
                                                                }}
                                                                className="px-1.5 py-0.5 text-[9px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                                                                title="Half BPM (/2)"
                                                            >
                                                                /2
                                                            </button>
                                                        </div>
                                                    )}
                                                    {activeSample.detectedBPM && activeSample.bpm && activeSample.detectedBPM !== activeSample.bpm && (
                                                        <span className="text-zinc-500 text-[10px] shrink-0">(detected: {activeSample.detectedBPM})</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center text-xs border-b border-zinc-800 pb-1.5 gap-2">
                                                <span className="text-zinc-500 shrink-0">Key</span>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-zinc-200 font-mono text-xs truncate">
                                                        {activeSample.detectedKey
                                                            ? `${activeSample.detectedKey.key} ${activeSample.detectedKey.mode === 'major' ? 'Major' : 'Minor'}${activeSample.detectedKey.confidence < 0.5 ? '?' : ''}`
                                                            : '—'
                                                        }
                                                    </span>
                                                    {activeSample.detectedKey && (
                                                        <span className="text-zinc-500 text-[10px] shrink-0">
                                                            ({Math.round(activeSample.detectedKey.confidence * 100)}%)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {activeSample.buffer && (
                                                <div className="pt-3 border-t border-zinc-800">
                                                    <button
                                                        onClick={() => handleAnalyzeSample(activeSample.id)}
                                                        disabled={activeSample.isAnalyzing}
                                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-xs font-bold rounded border border-indigo-500 transition-colors"
                                                    >
                                                        {activeSample.isAnalyzing ? (
                                                            <>
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Analyzing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-3.5 h-3.5" />
                                                                Analyze Audio
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-3 sticky top-0 bg-zinc-900 pb-2 z-10">Tags</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {activeSample.tags.map(tag => (
                                                <span key={tag} className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-full border border-zinc-700 transition-colors cursor-pointer">{tag}</span>
                                            ))}
                                            <button className="px-2.5 py-1 bg-transparent hover:bg-zinc-800 text-zinc-500 text-xs rounded-full border border-zinc-800 border-dashed transition-colors">+ Add</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === TabView.CHOP && activeSample && (
                                <div className="flex flex-col h-full">
                                    {/* Sub-tabs */}
                                    <div className="flex border-b border-zinc-800 bg-zinc-950/50 shrink-0">
                                        <button
                                            onClick={() => {
                                                if (chopSubTab !== 'auto') {
                                                    handleClearChops();
                                                }
                                                setChopSubTab('auto');
                                            }}
                                            className={`px-6 py-3 text-sm font-bold tracking-wide transition-colors border-r border-zinc-800 ${chopSubTab === 'auto' ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                                }`}
                                        >
                                            Auto
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (chopSubTab !== 'equal') {
                                                    handleClearChops();
                                                }
                                                setChopSubTab('equal');
                                            }}
                                            className={`px-6 py-3 text-sm font-bold tracking-wide transition-colors border-r border-zinc-800 ${chopSubTab === 'equal' ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                                }`}
                                        >
                                            Equal Divide
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (chopSubTab !== 'manual') {
                                                    handleClearChops();
                                                }
                                                setChopSubTab('manual');
                                            }}
                                            className={`px-6 py-3 text-sm font-bold tracking-wide transition-colors ${chopSubTab === 'manual' ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                                }`}
                                        >
                                            Manual
                                        </button>
                                    </div>

                                    {/* Content based on sub-tab */}
                                    <div className="flex-1 overflow-hidden">
                                        {chopSubTab === 'auto' && (
                                            <div className="h-full p-4 flex flex-col overflow-hidden relative">
                                                <div className="flex items-center justify-between mb-4 shrink-0">
                                                    <div>
                                                        <h4 className="text-zinc-200 text-base font-bold mb-1">Auto Chop</h4>
                                                        <p className="text-xs text-zinc-400">Detect transients and create chops automatically</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {activeChopId && (
                                                            <button
                                                                onClick={handleExtractActiveChop}
                                                                className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500"
                                                                title="Extract selected slice to new sample"
                                                            >
                                                                Extract Slice
                                                            </button>
                                                        )}
                                                        {chops.length > 0 && (
                                                            <>
                                                                <button
                                                                    onClick={handleProcessSlices}
                                                                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-green-600 hover:bg-green-500 text-white border border-green-500"
                                                                >
                                                                    Process Slices
                                                                </button>
                                                                <button
                                                                    onClick={handleClearChops}
                                                                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                                                                >
                                                                    Clear Chops
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                if (autoChoppingEnabled) {
                                                                    // Turning off - clear chops
                                                                    handleClearChops();
                                                                }
                                                                setAutoChoppingEnabled(!autoChoppingEnabled);
                                                            }}
                                                            className={`px-4 py-2 rounded text-xs font-bold transition-all shrink-0 ${autoChoppingEnabled
                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                }`}
                                                        >
                                                            {autoChoppingEnabled ? 'ON' : 'OFF'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {autoChoppingEnabled && (
                                                    <div className="flex-1 grid grid-cols-2 gap-6 min-h-0 overflow-hidden">
                                                        {/* Left: Controls */}
                                                        <div className="flex flex-col gap-4">
                                                            <div className="space-y-3 shrink-0">
                                                                <div>
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <label className="text-sm font-semibold text-zinc-300">Sensitivity</label>
                                                                        <span className="text-sm font-mono font-bold text-indigo-400">{chopThreshold}%</span>
                                                                    </div>
                                                                    <input
                                                                        type="range"
                                                                        min="1"
                                                                        max="100"
                                                                        value={chopThreshold}
                                                                        onChange={(e) => setChopThreshold(Number(e.target.value))}
                                                                        className="w-full max-w-[60%] h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                        style={{
                                                                            background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${((chopThreshold - 1) / (100 - 1)) * 100}%, rgb(39, 39, 42) ${((chopThreshold - 1) / (100 - 1)) * 100}%, rgb(39, 39, 42) 100%)`
                                                                        }}
                                                                    />
                                                                    <div className="flex justify-between text-xs text-zinc-500 mt-1 max-w-[60%]">
                                                                        <span>Lower = more chops</span>
                                                                        <span className="font-semibold text-indigo-400">{chops.length} chops detected</span>
                                                                    </div>
                                                                </div>

                                                                {/* BPM Weight Slider - only show if BPM detected */}
                                                                {activeSample?.detectedBPM && (
                                                                    <div className="mt-4">
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <label className="text-sm font-semibold text-zinc-300">
                                                                                Transients ↔ BPM Alignment
                                                                            </label>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="text-xs text-zinc-500">
                                                                                    BPM: {activeSample.detectedBPM}
                                                                                </span>
                                                                                {activeSample.detectedBPM && (
                                                                                    <div className="flex items-center gap-0.5">
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const newBPM = activeSample.detectedBPM! * 2;
                                                                                                setSamples(prev => prev.map(s =>
                                                                                                    s.id === activeSampleId
                                                                                                        ? { ...s, detectedBPM: newBPM, bpm: newBPM }
                                                                                                        : s
                                                                                                ));
                                                                                            }}
                                                                                            className="px-1 py-0.5 text-[9px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                                                                                            title="Double BPM (x2)"
                                                                                        >
                                                                                            x2
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const newBPM = Math.round(activeSample.detectedBPM! / 2);
                                                                                                setSamples(prev => prev.map(s =>
                                                                                                    s.id === activeSampleId
                                                                                                        ? { ...s, detectedBPM: newBPM, bpm: newBPM }
                                                                                                        : s
                                                                                                ));
                                                                                            }}
                                                                                            className="px-1 py-0.5 text-[9px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                                                                                            title="Half BPM (/2)"
                                                                                        >
                                                                                            /2
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <input
                                                                            type="range"
                                                                            min="0"
                                                                            max="100"
                                                                            value={bpmWeight !== null ? Math.round(bpmWeight * 100) : (activeSample.detectedBPM ? 50 : 0)}
                                                                            onChange={(e) => {
                                                                                const val = Number(e.target.value) / 100;
                                                                                setBpmWeight(val === 0.5 ? null : val); // 50% = auto
                                                                            }}
                                                                            className="w-full max-w-[60%] h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                            style={{
                                                                                background: `linear-gradient(to right, rgb(99, 102, 241) 0%, rgb(99, 102, 241) ${bpmWeight !== null ? (bpmWeight * 100) : 50}%, rgb(39, 39, 42) ${bpmWeight !== null ? (bpmWeight * 100) : 50}%, rgb(39, 39, 42) 100%)`
                                                                            }}
                                                                        />
                                                                        <div className="flex justify-between text-xs text-zinc-500 mt-1 max-w-[60%]">
                                                                            <span>Transients</span>
                                                                            <span className="text-zinc-400">Auto</span>
                                                                            <span>Beat Grid</span>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={chopsLinked}
                                                                        onChange={(e) => handleSetChopsLinked(e.target.checked)}
                                                                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                                                                    />
                                                                    <span className="text-sm text-zinc-300">Link Start/End Points</span>
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {/* Right: Explanation */}
                                                        <div className="flex flex-col min-h-0 overflow-hidden">
                                                            <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-800 h-full overflow-y-auto">
                                                                <div className="font-semibold text-zinc-300 mb-3 text-sm">How it works:</div>
                                                                <ul className="space-y-2 text-xs leading-relaxed text-zinc-400">
                                                                    <li>• Chops appear on waveform when enabled</li>
                                                                    <li>• Click chops to preview individually</li>
                                                                    <li>• Adjust sensitivity to control detection</li>
                                                                    <li>• Edit start/end points on waveform</li>
                                                                    <li>• Chops appear in sidebar tree</li>
                                                                </ul>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {!autoChoppingEnabled && (
                                                    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                                                        Enable auto chop to detect and create chops automatically
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {chopSubTab === 'equal' && (
                                            <div className="h-full p-4 flex flex-col overflow-hidden relative">
                                                <div className="flex items-center justify-between mb-4 shrink-0">
                                                    <div>
                                                        <h4 className="text-zinc-200 text-base font-bold mb-1">Equal Divisions</h4>
                                                        <p className="text-xs text-zinc-400">Divide sample into equal slices</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {activeChopId && (
                                                            <button
                                                                onClick={handleExtractActiveChop}
                                                                className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500"
                                                                title="Extract selected slice to new sample"
                                                            >
                                                                Extract Slice
                                                            </button>
                                                        )}
                                                        {chops.length > 0 && (
                                                            <>
                                                                <button
                                                                    onClick={handleProcessSlices}
                                                                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-green-600 hover:bg-green-500 text-white border border-green-500"
                                                                >
                                                                    Process Slices
                                                                </button>
                                                                <button
                                                                    onClick={handleClearChops}
                                                                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                                                                >
                                                                    Clear Chops
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex-1 grid grid-cols-2 gap-6 min-h-0 overflow-hidden">
                                                    {/* Left: Controls */}
                                                    <div className="flex flex-col gap-4">
                                                        <div className="space-y-3 shrink-0">
                                                            <div>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <label className="text-sm font-semibold text-zinc-300">Number of Slices</label>
                                                                    <span className="text-sm font-mono font-bold text-green-400">{chopSliceCount}</span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min="2"
                                                                    max="64"
                                                                    value={chopSliceCount}
                                                                    onChange={(e) => setChopSliceCount(Number(e.target.value))}
                                                                    className="w-full max-w-[60%] h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-600"
                                                                    style={{
                                                                        background: `linear-gradient(to right, rgb(22, 163, 74) 0%, rgb(22, 163, 74) ${((chopSliceCount - 2) / (64 - 2)) * 100}%, rgb(39, 39, 42) ${((chopSliceCount - 2) / (64 - 2)) * 100}%, rgb(39, 39, 42) 100%)`
                                                                    }}
                                                                />
                                                            </div>

                                                            <div className="flex items-center gap-2 shrink-0 pt-2 border-t border-zinc-800/50">
                                                                <label className="flex items-center gap-2 cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={chopsLinked}
                                                                        onChange={(e) => handleSetChopsLinked(e.target.checked)}
                                                                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                                                                    />
                                                                    <span className="text-sm text-zinc-300">Link Start/End Points</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Right: Explanation */}
                                                    <div className="flex flex-col min-h-0 overflow-hidden">
                                                        <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-800 h-full overflow-y-auto">
                                                            <div className="font-semibold text-zinc-300 mb-3 text-sm">How it works:</div>
                                                            <ul className="space-y-2 text-xs leading-relaxed text-zinc-400">
                                                                <li>• Divides the sample into {chopSliceCount} equal-length slices</li>
                                                                <li>• Each slice becomes a separate chop</li>
                                                                <li>• Chops appear on waveform and in sidebar</li>
                                                                <li>• Click chops to preview individually</li>
                                                                <li>• Edit start/end points when not linked</li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {chopSubTab === 'manual' && (
                                            <div className="h-full p-4 flex flex-col overflow-hidden relative">
                                                <div className="flex items-center justify-between mb-4 shrink-0">
                                                    <div>
                                                        <h4 className="text-zinc-200 text-base font-bold mb-1">Manual Markers</h4>
                                                        <p className="text-xs text-zinc-400">Press spacebar to start playback, each press adds a chop point</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {activeChopId && (
                                                            <button
                                                                onClick={handleExtractActiveChop}
                                                                className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500"
                                                                title="Extract selected slice to new sample"
                                                            >
                                                                Extract Slice
                                                            </button>
                                                        )}
                                                        {chops.length > 0 && (
                                                            <>
                                                                <button
                                                                    onClick={handleProcessSlices}
                                                                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-green-600 hover:bg-green-500 text-white border border-green-500"
                                                                >
                                                                    Process Slices
                                                                </button>
                                                                <button
                                                                    onClick={handleClearChops}
                                                                    className="px-3 py-1.5 rounded text-xs font-semibold transition-all bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                                                                >
                                                                    Clear Chops
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                if (manualChoppingEnabled) {
                                                                    setManualChoppingEnabled(false);
                                                                    setPlaying(false);
                                                                    if (engine) engine.stop();
                                                                } else {
                                                                    setManualChoppingEnabled(true);
                                                                    setManualChopPoints([0]);
                                                                }
                                                            }}
                                                            className={`px-4 py-2 rounded text-xs font-bold transition-all shrink-0 ${manualChoppingEnabled
                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                }`}
                                                        >
                                                            {manualChoppingEnabled ? 'ON' : 'OFF'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex-1 grid grid-cols-2 gap-6 min-h-0 overflow-hidden">
                                                    {/* Left: Controls */}
                                                    <div className="flex flex-col gap-4">
                                                        {manualChoppingEnabled && (
                                                            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4">
                                                                <div className="text-sm text-indigo-300 font-semibold mb-2">Manual Chopping Active</div>
                                                                <div className="text-xs text-zinc-400 space-y-1">
                                                                    <p>• Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-indigo-300 font-mono">SPACE</kbd> to start playback</p>
                                                                    <p>• Each <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-indigo-300 font-mono">SPACE</kbd> press adds a chop point</p>
                                                                    <p>• Chops appear on waveform in real-time</p>
                                                                    <p>• {manualChopPoints.length} chop points added</p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Right: Explanation */}
                                                    <div className="flex flex-col min-h-0 overflow-hidden">
                                                        <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-800 h-full overflow-y-auto">
                                                            <div className="font-semibold text-zinc-300 mb-3 text-sm">How it works:</div>
                                                            <ul className="space-y-2 text-xs leading-relaxed text-zinc-400">
                                                                <li>• Click on waveform to place markers</li>
                                                                <li>• Each marker creates a chop point</li>
                                                                <li>• Chops appear on waveform and in sidebar</li>
                                                                <li>• Edit start/end points when not linked</li>
                                                                <li>• Full manual control over chop placement</li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === TabView.EQ && activeSample && (
                                <div className="h-full p-4 overflow-y-auto flex items-center justify-center">
                                    {/* 3-Band EQ Design */}
                                    <div className={`
                                        relative w-full max-w-4xl bg-zinc-900 rounded-3xl 
                                        shadow-[0_20px_50px_-12px_rgba(0,0,0,1),0_0_0_1px_rgba(255,255,255,0.05),inset_0_1px_1px_rgba(255,255,255,0.05)]
                                        overflow-hidden transition-all duration-500
                                    `}>

                                        {/* Header / Status Bar */}
                                        <div className="flex items-center justify-between px-6 pt-6 pb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1.5 h-1.5 rounded-full ${eqEnabled && (lowGain !== 0 || midGain !== 0 || highGain !== 0 || lowFreq !== 100 || midFreq !== 1000 || highFreq !== 8000 || midQ !== 1.2) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-zinc-600'}`}></div>
                                                <span className="text-zinc-400 text-xs font-bold tracking-[0.2em]">EQ-3 PRO</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => {
                                                        setLowGain(0);
                                                        setLowFreq(100);
                                                        setMidGain(0);
                                                        setMidFreq(1000);
                                                        setMidQ(1.2);
                                                        setHighGain(0);
                                                        setHighFreq(8000);
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                                                    title="Reset EQ to defaults"
                                                >
                                                    Reset
                                                </button>
                                                <button
                                                    onClick={() => setEqEnabled(!eqEnabled)}
                                                    className={`px-4 py-2 text-xs font-bold transition-all border rounded ${eqEnabled
                                                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)] hover:bg-emerald-500'
                                                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                                                        }`}
                                                    title={eqEnabled ? "Disable EQ" : "Enable EQ"}
                                                >
                                                    {eqEnabled ? 'ON' : 'OFF'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Main Content: Visualizer and Controls in Columns */}
                                        <div className="px-6 pb-6 flex gap-6">
                                            {/* Left Column: Visualizer */}
                                            <div className="flex-1">
                                                <EQCombinedVisualizer
                                                    isPlaying={isPlaying}
                                                    bands={[
                                                        { name: 'Low', gain: lowGain, freq: lowFreq, q: 1.0, color: '#f59e0b' },
                                                        { name: 'Mid', gain: midGain, freq: midFreq, q: midQ, color: '#3b82f6' },
                                                        { name: 'High', gain: highGain, freq: highFreq, q: 1.0, color: '#8b5cf6' }
                                                    ]}
                                                />
                                            </div>

                                            {/* Right Column: Controls */}
                                            <div className="flex-shrink-0">
                                                <div className="flex justify-between bg-zinc-950/40 rounded-2xl p-5 border border-white/5 shadow-inner">

                                                    {/* Low Band */}
                                                    <div className="flex flex-col items-center gap-5 px-1 w-24">
                                                        <EQKnob
                                                            label="Low"
                                                            size="md"
                                                            value={lowGain}
                                                            min={-12}
                                                            max={12}
                                                            color="#f59e0b"
                                                            onChange={(val) => setLowGain(val)}
                                                        />
                                                        <div className="flex flex-col gap-3 pt-1 w-full items-center border-t border-white/5">
                                                            <EQKnob
                                                                label="Freq"
                                                                size="sm"
                                                                min={20}
                                                                max={400}
                                                                value={lowFreq}
                                                                color="#f59e0b"
                                                                formatValue={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${Math.round(val)}`}
                                                                onChange={(val) => setLowFreq(val)}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="w-px bg-zinc-800/80 my-2"></div>

                                                    {/* Mid Band */}
                                                    <div className="flex flex-col items-center gap-5 px-1 w-24">
                                                        <EQKnob
                                                            label="Mid"
                                                            size="md"
                                                            value={midGain}
                                                            min={-12}
                                                            max={12}
                                                            color="#10b981"
                                                            onChange={(val) => setMidGain(val)}
                                                        />
                                                        <div className="flex flex-col gap-3 pt-1 w-full items-center border-t border-white/5">
                                                            <div className="flex items-center justify-between w-full gap-2">
                                                                <EQKnob
                                                                    label="Freq"
                                                                    size="sm"
                                                                    min={400}
                                                                    max={4000}
                                                                    value={midFreq}
                                                                    color="#10b981"
                                                                    formatValue={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${Math.round(val)}`}
                                                                    onChange={(val) => setMidFreq(val)}
                                                                />
                                                                <EQKnob
                                                                    label="Q"
                                                                    size="sm"
                                                                    min={0.1}
                                                                    max={10}
                                                                    value={midQ}
                                                                    color="#10b981"
                                                                    formatValue={(val) => val.toFixed(1)}
                                                                    onChange={(val) => setMidQ(val)}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="w-px bg-zinc-800/80 my-2"></div>

                                                    {/* High Band */}
                                                    <div className="flex flex-col items-center gap-5 px-1 w-24">
                                                        <EQKnob
                                                            label="High"
                                                            size="md"
                                                            value={highGain}
                                                            min={-12}
                                                            max={12}
                                                            color="#3b82f6"
                                                            onChange={(val) => setHighGain(val)}
                                                        />
                                                        <div className="flex flex-col gap-3 pt-1 w-full items-center border-t border-white/5">
                                                            <EQKnob
                                                                label="Freq"
                                                                size="sm"
                                                                min={4000}
                                                                max={20000}
                                                                value={highFreq}
                                                                color="#3b82f6"
                                                                formatValue={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${Math.round(val)}`}
                                                                onChange={(val) => setHighFreq(val)}
                                                            />
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>

                                        {/* Apply Button - Centered */}
                                        <div className="px-8 pb-6 flex justify-center">
                                            <button
                                                onClick={() => {
                                                    // Check if there's a pending crop
                                                    if (hasPendingCrop()) {
                                                        setProcessingDialog({
                                                            isOpen: true,
                                                            type: 'filter-with-crop',
                                                            onConfirm: async () => {
                                                                setProcessingDialog(null);
                                                                if (activeSample && engine && activeSample.buffer) {
                                                                    try {
                                                                        // Apply EQ only (no crop)
                                                                        const processedBuffer = await engine.applyEffectsAndResample(activeSample.buffer);
                                                                        if (processedBuffer) {
                                                                            const blob = audioBufferToWav(processedBuffer);
                                                                            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                                                                            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                                                                            const newName = `${originalName}_EQ.${extension}`;

                                                                            const newSample: Sample = {
                                                                                ...activeSample,
                                                                                id: Date.now().toString(),
                                                                                name: newName,
                                                                                duration: formatDuration(processedBuffer.duration),
                                                                                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                                                                                buffer: processedBuffer,
                                                                                blob: blob,
                                                                                waveform: []
                                                                            };

                                                                            setSamples(prev => [newSample, ...prev]);
                                                                            setActiveSample(newSample.id);

                                                                            // Reset only EQ effect after baking (not all effects)
                                                                            setEQEnabled(false);
                                                                            setLowGain(0);
                                                                            setMidGain(0);
                                                                            setHighGain(0);
                                                                            setLowFreq(100);
                                                                            setMidFreq(1000);
                                                                            setHighFreq(8000);
                                                                            setMidQ(1.2);
                                                                        }
                                                                    } catch (error) {
                                                                        console.error('Error applying EQ:', error);
                                                                    }
                                                                }
                                                            },
                                                            onApplyWithCrop: async () => {
                                                                setProcessingDialog(null);
                                                                if (activeSample && engine && activeSample.buffer) {
                                                                    try {
                                                                        // First apply crop, then EQ
                                                                        const tempSampleStub = {
                                                                            buffer: activeSample.buffer,
                                                                            trimStart: region.start,
                                                                            trimEnd: region.end
                                                                        };
                                                                        const croppedBuffer = await engine.crop(tempSampleStub);
                                                                        if (!croppedBuffer) return;

                                                                        // Reset region after crop is applied
                                                                        if (activeSampleId) {
                                                                            setRegion(activeSampleId, { start: 0, end: 1 });
                                                                        }

                                                                        const processedBuffer = await engine.applyEffectsAndResample(croppedBuffer);
                                                                        if (processedBuffer) {
                                                                            const blob = audioBufferToWav(processedBuffer);
                                                                            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                                                                            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                                                                            const newName = `${originalName}_Cropped_EQ.${extension}`;

                                                                            const newSample: Sample = {
                                                                                ...activeSample,
                                                                                id: Date.now().toString(),
                                                                                name: newName,
                                                                                duration: formatDuration(processedBuffer.duration),
                                                                                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                                                                                buffer: processedBuffer,
                                                                                blob: blob,
                                                                                waveform: []
                                                                            };

                                                                            setSamples(prev => [newSample, ...prev]);
                                                                            setActiveSample(newSample.id);

                                                                            // Reset only EQ effect after baking (not all effects)
                                                                            setEQEnabled(false);
                                                                            setLowGain(0);
                                                                            setMidGain(0);
                                                                            setHighGain(0);
                                                                            setLowFreq(100);
                                                                            setMidFreq(1000);
                                                                            setHighFreq(8000);
                                                                            setMidQ(1.2);
                                                                        }
                                                                    } catch (error) {
                                                                        console.error('Error applying EQ with crop:', error);
                                                                    }
                                                                }
                                                            }
                                                        });
                                                    } else {
                                                        // Check if other effects are active
                                                        const noiseGateActive = noiseGateEnabled;
                                                        const timeStretchActive = timeStretchEnabled && timeStretchRatio !== 1.0;
                                                        const hasOtherEffects = noiseGateActive || timeStretchActive;

                                                        // No pending crop, apply EQ normally
                                                        setProcessingDialog({
                                                            isOpen: true,
                                                            type: 'filter',
                                                            title: hasOtherEffects ? 'Apply EQ (Other Effects Active)' : 'Apply EQ',
                                                            description: hasOtherEffects 
                                                                ? 'EQ will be baked into the sample. Note: Noise Gate and/or Time Stretch are also active but will not be applied unless you use those controls separately.'
                                                                : 'This will create a new sample with EQ processing applied. The original sample will remain unchanged.',
                                                            onConfirm: async () => {
                                                                setProcessingDialog(null);
                                                                if (activeSample && engine && activeSample.buffer) {
                                                                    try {
                                                                        const processedBuffer = await engine.applyEffectsAndResample(activeSample.buffer);
                                                                        if (processedBuffer) {
                                                                            const blob = audioBufferToWav(processedBuffer);
                                                                            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                                                                            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                                                                            const newName = `${originalName}_EQ.${extension}`;

                                                                            const newSample: Sample = {
                                                                                ...activeSample,
                                                                                id: Date.now().toString(),
                                                                                name: newName,
                                                                                duration: formatDuration(processedBuffer.duration),
                                                                                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                                                                                buffer: processedBuffer,
                                                                                blob: blob,
                                                                                waveform: []
                                                                            };

                                                                            setSamples(prev => [newSample, ...prev]);
                                                                            setActiveSample(newSample.id);

                                                                            // Reset only EQ effect after baking (not all effects)
                                                                            // This prevents double application when the new sample is played
                                                                            setEQEnabled(false);
                                                                            setLowGain(0);
                                                                            setMidGain(0);
                                                                            setHighGain(0);
                                                                            setLowFreq(100);
                                                                            setMidFreq(1000);
                                                                            setHighFreq(8000);
                                                                            setMidQ(1.2);
                                                                        }
                                                                    } catch (error) {
                                                                        console.error('Error applying EQ:', error);
                                                                    }
                                                                }
                                                            }
                                                        });
                                                    }
                                                }}
                                                className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded transition-colors shadow-lg shadow-indigo-500/20"
                                            >
                                                Apply EQ to Sample
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}


                            {activeTab === TabView.NOISE && (
                                <NoiseReductionTab
                                    enabled={noiseGateEnabled}
                                    sensitivity={liveNoiseSensitivity}
                                    amount={liveNoiseAmount}
                                    onChange={(newEnabled, newSens, newAmt) => {
                                        // Auto-enable if parameters change while disabled
                                        // This ensures moving controls automatically enables the effect
                                        const valuesChanged = newSens !== liveNoiseSensitivity || newAmt !== liveNoiseAmount;

                                        if (valuesChanged && !noiseGateEnabled) {
                                            // Auto-enable when controls are moved
                                            setNoiseGateEnabled(true);
                                            setLiveNoiseSensitivity(newSens);
                                            setLiveNoiseAmount(newAmt);
                                        } else {
                                            // Manual toggle or no change
                                            setNoiseGateEnabled(newEnabled);
                                            setLiveNoiseSensitivity(newSens);
                                            setLiveNoiseAmount(newAmt);
                                        }
                                    }}
                                    onReset={() => {
                                        // Reset parameters to defaults but preserve enabled state
                                        setLiveNoiseSensitivity(0.5);
                                        setLiveNoiseAmount(0.5);
                                    }}
                                    onApply={handleApplyNoiseReduction}
                                />
                            )}

                            {activeTab === TabView.TIME_STRETCH && activeSample && (
                                <div className="flex flex-col h-full overflow-auto p-4 gap-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Time Stretching</h4>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => {
                                                        // Reset ratio to default but preserve enabled state
                                                        setTimeStretchRatio(1.0);
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                                                    title="Reset Time Stretch ratio to default"
                                                >
                                                    Reset
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setTimeStretchEnabled(!timeStretchEnabled);
                                                        // Restart playback immediately if currently playing
                                                        if (isPlaying) {
                                                            restartPlaybackIfPlaying();
                                                        }
                                                    }}
                                                    className={`px-4 py-2 text-xs font-bold transition-all border rounded ${timeStretchEnabled
                                                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)] hover:bg-emerald-500'
                                                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:border-zinc-600 hover:text-zinc-300'
                                                        }`}
                                                    title={timeStretchEnabled ? "Disable Time-Stretch" : "Enable Time-Stretch"}
                                                >
                                                    {timeStretchEnabled ? 'ON' : 'OFF'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            {/* Sample Tempo */}
                                            <div className="flex flex-col gap-2">
                                                <label className="text-xs text-zinc-400">Sample Tempo</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="300"
                                                        step="1"
                                                        value={typeof activeSample.bpm === 'number' ? activeSample.bpm : (activeSample.detectedBPM || '')}
                                                        onChange={(e) => {
                                                            const newBPM = parseFloat(e.target.value);
                                                            if (!isNaN(newBPM) && newBPM > 0) {
                                                                setSamples(prevSamples =>
                                                                    prevSamples.map(s =>
                                                                        s.id === activeSample.id ? { ...s, bpm: newBPM } : s
                                                                    )
                                                                );
                                                            }
                                                        }}
                                                        className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-indigo-500"
                                                        placeholder="BPM"
                                                    />
                                                    <span className="text-xs text-zinc-500">BPM</span>
                                                    <button
                                                        onClick={async () => {
                                                            if (!activeSample?.buffer || !engine || isDetectingBPM) return;
                                                            setIsDetectingBPM(true);
                                                            try {
                                                                const bpmResult = await engine.detectBPM(activeSample.buffer);
                                                                if (bpmResult && bpmResult.bpm) {
                                                                    setSamples(prevSamples =>
                                                                        prevSamples.map(s =>
                                                                            s.id === activeSample.id
                                                                                ? { ...s, detectedBPM: bpmResult.bpm, bpm: bpmResult.bpm }
                                                                                : s
                                                                        )
                                                                    );
                                                                }
                                                            } catch (error) {
                                                                console.error('BPM detection failed:', error);
                                                            } finally {
                                                                setIsDetectingBPM(false);
                                                            }
                                                        }}
                                                        disabled={isDetectingBPM || !activeSample?.buffer}
                                                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-xs text-zinc-300 rounded border border-zinc-600 transition-colors"
                                                    >
                                                        {isDetectingBPM ? 'Detecting...' : 'Detect'}
                                                    </button>
                                                </div>
                                                {activeSample.detectedBPM && typeof activeSample.bpm === 'number' && activeSample.detectedBPM !== activeSample.bpm && (
                                                    <span className="text-[10px] text-zinc-500">
                                                        Detected: {activeSample.detectedBPM} BPM
                                                    </span>
                                                )}
                                            </div>

                                            {/* Target Tempo */}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs text-zinc-400">Target Tempo</label>
                                                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={syncToTempo}
                                                            onChange={(e) => setSyncToTempo(e.target.checked)}
                                                            className="w-3 h-3 accent-indigo-500"
                                                        />
                                                        Sync to Tempo
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="300"
                                                        step="1"
                                                        value={targetTempo || ''}
                                                        onChange={(e) => {
                                                            const value = e.target.value;
                                                            setTargetTempo(value === '' ? null : parseFloat(value));
                                                        }}
                                                        disabled={!activeSample || (!activeSample.bpm && !activeSample.detectedBPM)}
                                                        className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        placeholder="BPM"
                                                    />
                                                    <span className="text-xs text-zinc-500">BPM</span>
                                                </div>
                                                {syncToTempo && targetTempo && activeSample && (activeSample.bpm || activeSample.detectedBPM) && (
                                                    <span className="text-[10px] text-zinc-500">
                                                        Stretch: {(((typeof activeSample.bpm === 'number' ? activeSample.bpm : activeSample.detectedBPM || 1) / targetTempo)).toFixed(2)}x
                                                    </span>
                                                )}
                                                {(!activeSample?.bpm && !activeSample?.detectedBPM) && (
                                                    <span className="text-[10px] text-zinc-400">
                                                        Set sample tempo first
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs text-zinc-400">Stretch Ratio</label>
                                                    {syncToTempo && (
                                                        <span className="text-[10px] text-zinc-500">(Synced to tempo)</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min="0.25"
                                                        max="4.0"
                                                        step="0.01"
                                                        value={timeStretchRatio}
                                                        onChange={(e) => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(parseFloat(e.target.value));
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    />
                                                    <span className="text-xs text-zinc-300 font-mono w-16 text-right">
                                                        {timeStretchRatio.toFixed(2)}x
                                                    </span>
                                                </div>
                                                <div className="flex gap-2 text-[10px] text-zinc-500">
                                                    <button
                                                        onClick={() => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(0.5);
                                                                if (timeStretchEnabled) restartPlaybackIfPlaying();
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        0.5x
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(0.75);
                                                                if (timeStretchEnabled) restartPlaybackIfPlaying();
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        0.75x
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(1.0);
                                                                if (timeStretchEnabled) restartPlaybackIfPlaying();
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        1.0x
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(1.25);
                                                                if (timeStretchEnabled) restartPlaybackIfPlaying();
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        1.25x
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(1.5);
                                                                if (timeStretchEnabled) restartPlaybackIfPlaying();
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        1.5x
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (!syncToTempo) {
                                                                setTimeStretchRatio(2.0);
                                                                if (timeStretchEnabled) restartPlaybackIfPlaying();
                                                            }
                                                        }}
                                                        disabled={syncToTempo}
                                                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        2.0x
                                                    </button>
                                                </div>
                                            </div>
                                            {activeSample.isTimeStretching && timeStretchProgress > 0 && (
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                                                        <span>Processing...</span>
                                                        <span>{Math.round(timeStretchProgress * 100)}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-indigo-500 transition-all duration-300"
                                                            style={{ width: `${timeStretchProgress * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        // Preview button now works like regular play button
                                                        // When time-stretch is enabled, both buttons do the same thing
                                                        handlePlayToggle();
                                                    }}
                                                    disabled={activeSample.isTimeStretching || !activeSample.buffer}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white text-xs font-bold rounded border border-zinc-600 transition-colors"
                                                >
                                                    <MonitorPlay className="w-4 h-4" />
                                                    Preview
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (!activeSample?.buffer || !engine) {
                                                            console.error('Cannot time stretch: missing buffer or engine');
                                                            alert('Cannot time stretch: Please select a sample with audio data');
                                                            return;
                                                        }

                                                        // Check if there's a pending crop
                                                        if (hasPendingCrop()) {
                                                            setProcessingDialog({
                                                                isOpen: true,
                                                                type: 'timeStretch-with-crop',
                                                                onConfirm: async () => {
                                                                    setProcessingDialog(null);
                                                                    await applyTimeStretch(false); // Time stretch only (no crop)
                                                                },
                                                                onApplyWithCrop: async () => {
                                                                    setProcessingDialog(null);
                                                                    await applyTimeStretch(true); // Apply crop then time stretch
                                                                }
                                                            });
                                                        } else {
                                                            // No pending crop, apply time stretch normally
                                                            await applyTimeStretch(false);
                                                        }
                                                    }}
                                                    disabled={activeSample.isTimeStretching || !activeSample.buffer}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white text-xs font-bold rounded border border-indigo-500 transition-colors"
                                                >
                                                    {activeSample.isTimeStretching ? (
                                                        <>
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                            Stretching...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles className="w-4 h-4" />
                                                            Apply Time Stretch
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === TabView.TIME_STRETCH && !activeSample && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700">
                                            <Gauge className="w-6 h-6 text-zinc-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">Time Stretching</h3>
                                        <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                                            Select a sample to stretch its duration without changing pitch.
                                        </p>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </main>

                {/* RIGHT: Control Column */}
                <aside className="w-52 bg-zinc-950 border-l border-zinc-800 flex flex-col shrink-0 z-10 shadow-2xl">
                    <div className="h-6 w-full border-b border-zinc-900/50 bg-black/20" />
                    <div className="flex-1 flex items-stretch py-4 bg-zinc-950/80 min-h-0">
                        <UnifiedControl
                            isPlaying={isPlaying}
                            isRecording={isRecording}
                            isArmed={isArmed}
                            gain={gain}
                            threshold={recThreshold}
                            onGainChange={setGain}
                            onThresholdChange={setRecThreshold}
                            onStartRecording={handleStartRecording}
                            isSourceConnected={isSourceConnected}
                        />
                    </div>
                    <div className="h-16 border-t border-zinc-800 bg-zinc-950 p-2 flex flex-col items-center justify-center">
                        <button
                            onClick={() => setIsMuted(!isMuted)}
                            className={`w-full py-2 text-[10px] font-bold tracking-widest uppercase rounded border transition-all ${isMuted
                                ? 'bg-red-500/20 text-red-500 border-red-500/50'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                                }`}
                        >
                            Mute Output
                        </button>
                    </div>
                    <div className="h-4 border-t border-zinc-900/50" />
                </aside>
            </div>

            {/* Processing Dialog */}
            {processingDialog && (
                <ProcessingDialog
                    isOpen={processingDialog.isOpen}
                    title={processingDialog.title || (
                        processingDialog.type === 'crop' ? 'Crop Selection' :
                            processingDialog.type === 'normalize' ? 'Normalize Audio' :
                                processingDialog.type === 'noise-reduction' ? 'Reduce Noise' :
                                    processingDialog.type === 'filter' ? 'Apply Multiband Filter' :
                                        processingDialog.type === 'adsr' ? 'Apply ADSR Processing' :
                                            processingDialog.type === 'chop-with-processing' ? 'Chop Sample with Pending Changes' :
                                                processingDialog.type === 'filter-with-crop' ? 'Apply EQ with Pending Crop' :
                                                    processingDialog.type === 'timeStretch-with-crop' ? 'Time Stretch with Pending Crop' :
                                                        'Process Chops'
                    )}
                    description={processingDialog.description || (
                        processingDialog.type === 'crop' ? 'Create a new sample from the selected region' :
                            processingDialog.type === 'normalize' ? 'Normalize audio levels to maximum without clipping' :
                                processingDialog.type === 'noise-reduction' ? 'Reduce background noise and hiss using spectral gating or RNNoise' :
                                    processingDialog.type === 'filter' ? 'Apply multiband filtering to the sample' :
                                        processingDialog.type === 'adsr' ? 'Apply ADSR envelope shaping to the sample' :
                                            processingDialog.type === 'chop-with-processing' ? 'You have region adjustments or EQ settings active. Apply them before chopping?' :
                                                processingDialog.type === 'filter-with-crop' ? 'You have region adjustments active. Apply the crop as well?' :
                                                    processingDialog.type === 'timeStretch-with-crop' ? 'You have region adjustments active. Apply the crop as well?' :
                                                        'Create individual samples from chops'
                    )}
                    processingType={processingDialog.type}
                    onConfirm={processingDialog.onConfirm}
                    onApplyAndChop={processingDialog.onApplyAndChop}
                    onApplyWithCrop={processingDialog.onApplyWithCrop}
                    noiseReductionOptions={{ sensitivity: noiseSensitivity, amount: noiseAmount }}
                    onNoiseReductionChange={(options) => {
                        setNoiseSensitivity(options.sensitivity);
                        setNoiseAmount(options.amount);
                    }}
                    onCancel={() => setProcessingDialog(null)}
                />
            )}


            {/* Session Dialog */}
            <SessionDialog
                isOpen={sessionDialogMode !== null}
                mode={sessionDialogMode || 'save'}
                samples={samples}
                audioContext={engine?.context || null}
                onClose={() => setSessionDialogMode(null)}
                onLoadSession={(loadedSamples) => {
                    setSamples(loadedSamples);
                    if (loadedSamples.length > 0) {
                        setActiveSample(loadedSamples[0].id);
                    }
                }}
            />

            {/* Export Dialog */}
            {exportDialog && (
                <ExportDialog
                    isOpen={exportDialog.isOpen}
                    mode={exportDialog.mode}
                    samples={samples}
                    selectedSampleIds={selectedSampleIds}
                    activeSampleId={exportDialog.mode === 'save-selected' ? (exportDialog.sampleId || activeSampleId) : activeSampleId}
                    onClose={() => setExportDialog(null)}
                    onConfirm={async (options) => {
                        setExportDialog(null);
                        if (exportDialog.mode === 'save-selected' && exportDialog.sampleId) {
                            await performSaveAs(exportDialog.sampleId, options.format, options.sampleRate, options.bitrate);
                        } else if (exportDialog.mode === 'export-all') {
                            await performExportAll(options.format, options.sampleRate, options.bitrate, options.exportAsZip);
                        }
                    }}
                />
            )}
        </div>
    );
}
