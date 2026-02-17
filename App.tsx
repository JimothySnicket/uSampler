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

interface ChromeStorageAPI {
    local: {
        get: (keys: string[] | string | { [key: string]: any } | null, callback: (items: { [key: string]: any }) => void) => void;
        set: (items: { [key: string]: any }, callback?: () => void) => void;
    };
}

declare const chrome: {
    windows?: ChromeWindowsAPI;
    tabs?: ChromeTabsAPI;
    tabCapture?: ChromeTabCaptureAPI;
    runtime?: ChromeRuntimeAPI;
    storage?: ChromeStorageAPI;
} | undefined;
import {
    Play, Pause, Square, SkipBack, Scissors,
    Sliders, Lock, MonitorPlay, ChevronDown, RefreshCcw, Volume2, Keyboard, ChevronRight, Sparkles, Loader2, Gauge, Power, Repeat, Save, FolderOpen, VolumeX
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { WaveformDisplay } from './components/WaveformDisplay';
import { UnifiedControl } from './components/UnifiedControl';
import { PaddleControl } from './components/PaddleControl';
import { ProcessingDialog } from './components/ProcessingDialog';
import { SessionDialog } from './components/SessionDialog';
import { ExportDialog, ExportFormat as ExportDialogFormat, ExportSampleRate, WavBitDepth as ExportWavBitDepth, MP3Bitrate } from './components/ExportDialog';
import { CropDialog, WavBitDepth, ExportSampleRate as CropSampleRate, MP3Bitrate as CropMP3Bitrate } from './components/CropDialog';
import { EQKnob } from './components/EQKnob';
import { TransportBar } from './components/TransportBar';
import { FileHeader } from './components/FileHeader';
import { CompactVUMeter } from './components/CompactVUMeter';
import { EditPanel } from './components/EditPanel';
import { EQSection } from './components/edit-sections/EQSection';
import { StretchSection } from './components/edit-sections/StretchSection';
import { formatDuration, audioBufferToWav, audioBufferToFormat, ExportFormat } from './src/utils/audioUtils';
import { downloadBlobWithPreference } from './src/utils/downloadUtils';
import { Sample, Region, TabView } from './types';
import { AudioState } from './src/core/AudioEngine';
import JSZip from 'jszip';
import { debug, debugWarn, debugError } from './src/utils/logger';
import { saveAutosession, loadAutosession } from './src/utils/storageUtils';

// Version number
const DEV_VERSION = '1.0.0';

export default function App() {
    const { engine, state, startRecording, stopRecording, toggleArm, isArmed, selectSource, connectToTab, initialize, setRecordingCallback, statusMessage, connectionStatus } = useAudio();

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

    // Get current region for active sample
    // Subscribe to store state to get reactive updates
    const sampleStates = usePlaybackStore(state => state.sampleStates);
    const region = useMemo(() => {
        return activeSampleId && sampleStates[activeSampleId]
            ? sampleStates[activeSampleId].region
            : { start: 0, end: 1 };
    }, [activeSampleId, sampleStates]);

    // Loop is a global state - it affects what happens when playback reaches the end
    // The AudioEngine's play() method will use the current loop state when starting playback
    // When loop is ON: playback will automatically restart at the end
    // When loop is OFF: playback will stop at the end

    const [activeTab, setActiveTab] = useState<TabView>(TabView.MAIN);
    const [isRendering, setIsRendering] = useState(false);
    const [samples, setSamples] = useState<Sample[]>([]);
    const autosaveReady = useRef(false);
    const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());
    const [gain, setGain] = useState(100);
    const [recThreshold, setRecThreshold] = useState(75);
    const [isMuted, setIsMuted] = useState(false);
    const [activeSourceTitle, setActiveSourceTitle] = useState('Select Source');
    const [isSourceConnected, setIsSourceConnected] = useState(false);
    const [muteSourceDuringRecording, setMuteSourceDuringRecording] = useState(false);
    const [sourceTabId, setSourceTabId] = useState<number | null>(null);
    const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false);




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


    // Export dialog state
    const [exportDialog, setExportDialog] = useState<{
        isOpen: boolean;
        mode: 'save-selected' | 'export-all';
        sampleId?: string; // For save-selected mode
    } | null>(null);

    // Processing dialog state
    const [processingDialog, setProcessingDialog] = useState<{
        isOpen: boolean;
        type: 'crop' | 'normalize' | 'filter' | 'filter-with-crop' | 'timeStretch-with-crop';
        title?: string;
        description?: string;
        onConfirm: () => void;
        onApplyWithCrop?: () => void; // For filter/timeStretch-with-crop dialog
    } | null>(null);

    // Crop dialog state
    const [cropDialogOpen, setCropDialogOpen] = useState(false);


    // Session dialog state
    const [sessionDialogMode, setSessionDialogMode] = useState<'save' | 'load' | null>(null);





    // Edit mode (individual vs all)
    const [editMode, setEditMode] = useState<'individual' | 'all'>('individual');

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
    const prevStretchRatioRef = useRef<number>(1.0);
    const prevTimeStretchEnabledRef = useRef<boolean>(false);
    const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    const activeSample = samples.find(s => s.id === activeSampleId);

    // Set up recording callback
    useEffect(() => {
        debug('[App] Setting up recording callback');
        setRecordingCallback((blob: Blob, audioBuffer: AudioBuffer | null) => {
            debug('[App] Recording callback fired! Blob size:', blob.size);

            if (!audioBuffer) {
                debugError('[App] No audio buffer provided');
                return;
            }

            const newSample: Sample = {
                id: Date.now().toString(),
                name: `Rec_${new Date().toLocaleTimeString().replace(/:/g, '-')}.wav`,
                duration: formatDuration(audioBuffer.duration),
                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: ['New'],
                buffer: audioBuffer,
                blob: blob,
                trimStart: 0,
                trimEnd: 1
            };

            debug('[App] Creating new sample:', newSample.name);
            setSamples(prev => [newSample, ...prev]);
            setActiveSample(newSample.id);

            // Reset all effects when a new sample is recorded to ensure clean, unprocessed sample
            usePlaybackStore.getState().resetEffects();
        });
    }, [setRecordingCallback]);

    // Auto-initialize on mount (only once)
    useEffect(() => {
        const init = async () => {
            try {
                await initialize('');

                // Check for target tab ID from URL (set by background script)
                const params = new URLSearchParams(window.location.search);
                const targetTabIdStr = params.get('targetTabId');

                if (targetTabIdStr) {
                    const tabId = parseInt(targetTabIdStr, 10);
                    if (!isNaN(tabId)) {
                        setSourceTabId(tabId);
                        debug('[App] Found target tab ID:', tabId, 'Attempting silent capture...');

                        // Attempt to connect silently without popup
                        const connected = await connectToTab(tabId);
                        if (connected) {
                            setIsSourceDialogOpen(false);
                            setActiveSourceTitle('Tab Audio');
                            return; // Success! Skip fallback
                        }
                    }
                }

                // Fallback: If no tab ID or silent capture failed, check for existing source or wait for manual
                // We do NOT auto-trigger selectSource() here to avoid unprompted popups if silent fail occurs,
                // matching the "Silent" user preference. User can click "Source" manually if needed.

            } catch (err) {
                debugError("Initialization error:", err);
            }

            // Auto-restore last session from IndexedDB
            try {
                if (engine?.context) {
                    const restored = await loadAutosession(engine.context);
                    if (restored && restored.length > 0) {
                        debug('[App] Auto-restored', restored.length, 'samples');
                        setSamples(restored);
                        setActiveSample(restored[0].id);
                    }
                }
            } catch (err) {
                debugError('[App] Autosave restore failed:', err);
            }
            autosaveReady.current = true;
        };
        init();

        // Load UI mode preference
        chrome.storage.local.get(['uSampler-uiMode'], (result) => {
            // Background script handles initial size
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // Auto-save samples to IndexedDB (debounced)
    useEffect(() => {
        if (!autosaveReady.current) return;
        const timer = setTimeout(() => {
            saveAutosession(samples).catch((err) =>
                debugError('[App] Autosave failed:', err)
            );
        }, 2000);
        return () => clearTimeout(timer);
    }, [samples]);

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



    // Sync playback end and volume, and check source connection status
    useEffect(() => {
        if (engine) {
            engine.onPlaybackEnded = () => {
                const store = usePlaybackStore.getState();
                const currentLoopState = store.isLooping;

                const currentActiveSampleId = store.activeSampleId;
                const currentSampleStates = store.sampleStates;
                const currentRegion = currentActiveSampleId && currentSampleStates[currentActiveSampleId]
                    ? currentSampleStates[currentActiveSampleId].region
                    : { start: 0, end: 1 };

                if (currentLoopState && activeSample?.buffer) {
                    setTimeout(() => {
                        if (engine && activeSample?.buffer && !engine.activeSource) {
                            const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                            engine.play(activeSample.buffer, currentRegion.start, currentRegion.end, true, playbackRate);
                            setPlaying(true);
                        }
                    }, 10);
                } else {
                    setPlaying(false);
                    setPlaybackTime({ current: 0, total: 0 });
                }
            };
            engine.setVolume(isMuted ? 0 : gain / 100);
            setIsSourceConnected(!!engine.sourceNode);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine, gain, isMuted, state, activeSample, region]); // Include dependencies for loop restart

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

            const actualRegionDuration = duration * (region.end - region.start);
            const effectiveDuration = actualRegionDuration / playbackRate;

            if (engine.playbackStartTime > 0) {
                const elapsed = engine.context.currentTime - engine.playbackStartTime;
                const playbackRate = engine.currentPlaybackRate || 1.0;

                const actualRegionStart = duration * region.start;
                const actualRegionEnd = duration * region.end;
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
    }, [isPlaying, engine, activeSample, region, isLooping]);

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
        if (regionChanged && engine && engine.activeSource && isPlaying && activeSample?.buffer) {
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
            debugError('[App] chrome.tabs API not available');
            return false;
        }
        return new Promise((resolve) => {
            try {
                chrome.tabs!.update(tabId, { muted: true }, (tab) => {
                    if (chrome.runtime?.lastError) {
                        debugError('[App] Error muting tab:', chrome.runtime.lastError.message);
                        resolve(false);
                    } else {
                        debug(`[App] Tab ${tabId} muted successfully`, tab);
                        resolve(true);
                    }
                });
            } catch (err) {
                debugError('[App] Error muting tab:', err);
                resolve(false);
            }
        });
    };

    const unmuteSourceTab = async (tabId: number): Promise<boolean> => {
        if (!chrome?.tabs) {
            debugError('[App] chrome.tabs API not available');
            return false;
        }
        return new Promise((resolve) => {
            try {
                chrome.tabs!.update(tabId, { muted: false }, (tab) => {
                    if (chrome.runtime?.lastError) {
                        debugError('[App] Error unmuting tab:', chrome.runtime.lastError.message);
                        resolve(false);
                    } else {
                        debug(`[App] Tab ${tabId} unmuted successfully`, tab);
                        resolve(true);
                    }
                });
            } catch (err) {
                debugError('[App] Error unmuting tab:', err);
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
            debug(`[App] Muting tab ${tabIdToMute} before starting recording`);
            await muteSourceTab(tabIdToMute);
        } else {
            debugWarn('[App] Cannot mute: no tab ID available. Make sure to click extension icon on the tab you want to record.');
        }
    };

    // Unmute tab when recording stops (only if mute was enabled)
    useEffect(() => {
        if (!isRecording && sourceTabId !== null && muteSourceDuringRecording) {
            // Recording stopped - unmute the tab if it was muted
            debug(`[App] Recording stopped, unmuting tab ${sourceTabId}`);
            unmuteSourceTab(sourceTabId);
            // Don't clear sourceTabId - keep it for next recording
        }
    }, [isRecording, sourceTabId, muteSourceDuringRecording]);

    const toggleRecord = async () => {
        if (isRecording) {
            // Stop recording and unmute tab if it was muted
            stopRecording();
            if (sourceTabId !== null && muteSourceDuringRecording) {
                debug(`[App] Stopping recording, unmuting tab ${sourceTabId}`);
                await unmuteSourceTab(sourceTabId);
                // Don't clear sourceTabId - keep it for next recording
            }
        } else {
            // Start recording - mute source tab if mute is enabled
            await muteBeforeRecording();

            // Reset all effects before starting a new recording to ensure clean sample
            usePlaybackStore.getState().resetEffects();
            startRecording();
        }
    };

    // Wrapper for startRecording that resets effects to ensure clean recording
    const handleStartRecording = async () => {
        // Mute tab before starting recording if mute is enabled
        await muteBeforeRecording();

        // Reset all effects before starting a new recording to ensure clean sample
        usePlaybackStore.getState().resetEffects();
        startRecording();
    };

    const handlePlayToggle = () => {
        if (!activeSample) return;

        if (isPlaying) {
            setPlaying(false);
            if (engine) engine.stop();
        } else {
            if (engine && activeSample.buffer) {
                // Calculate playback rate based on time-stretch enabled state
                const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;

                engine.play(activeSample.buffer, region.start, region.end, isLooping, playbackRate);
                setPlaying(true);
            }
        }
    };

    const handleRestart = () => {
        if (!activeSample || !engine) return;

        // Stop current playback
        if (isPlaying) {
            engine.stop();
            setPlaying(false);
        }

        // Restart from region start
        setTimeout(() => {
            if (engine && activeSample.buffer) {
                const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                engine.play(activeSample.buffer, region.start, region.end, isLooping, playbackRate);
                setPlaying(true);
            }
        }, 10);
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

    // downloadBlob replaced with downloadBlobWithPreference from downloadUtils

    const handleSaveAs = (id: string) => {
        // Show export dialog instead of directly exporting
        setExportDialog({
            isOpen: true,
            mode: 'save-selected',
            sampleId: id
        });
    };

    const performSaveAs = async (id: string, format: ExportDialogFormat, sampleRate: ExportSampleRate, bitDepth?: ExportWavBitDepth, bitrate?: MP3Bitrate) => {
        if (!engine) {
            alert('Error: Audio engine is not available. Please refresh the page.');
            return;
        }

        try {
            // Get effective sample rate
            const targetSampleRate = sampleRate === 'original'
                ? null
                : sampleRate;

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
                        const blob = await audioBufferToFormat(buffer, format, { bitrate, bitDepth: format === 'wav' ? bitDepth : undefined });
                        const nameWithoutExt = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                        const filename = `${nameWithoutExt}.${format}`;
                        await downloadBlobWithPreference(blob, filename);
                        exportedFiles.push(filename);
                        exportedCount++;
                    } catch (error) {
                        debugError(`[App] Failed to export sample "${sample.name}":`, error);
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
            debugError('[App] Export error:', error);
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

    const handleNewSession = () => {
        if (samples.length > 0) {
            const confirmed = window.confirm('Start a new session? Any unsaved samples will be lost.');
            if (!confirmed) return;
        }
        setSamples([]);
        setActiveSample('');
        setSelectedSampleIds(new Set());
        setEqEnabled(false);
        setLowGain(0); setLowFreq(100);
        setMidGain(0); setMidFreq(1000); setMidQ(1.2);
        setHighGain(0); setHighFreq(8000);
        setTimeStretchEnabled(false);
        setTimeStretchRatio(1.0);
        if (engine) engine.stop();
        setPlaying(false);
    };

    const performExportAll = async (format: ExportDialogFormat, sampleRate: ExportSampleRate, bitDepth?: ExportWavBitDepth, bitrate?: MP3Bitrate, exportAsZip?: boolean) => {
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
                            const blob = await audioBufferToFormat(buffer, format, { bitrate, bitDepth: format === 'wav' ? bitDepth : undefined });
                            const nameWithoutExt = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                            folder?.file(`${nameWithoutExt}.${format}`, blob);
                            exportedCount++;
                        } catch (error) {
                            debugError(`[App] Failed to export sample "${sample.name}":`, error);
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
                            const blob = await audioBufferToFormat(buffer, format, { bitrate, bitDepth: format === 'wav' ? bitDepth : undefined });
                            const nameWithoutExt = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                            const filename = `${nameWithoutExt}.${format}`;
                            await downloadBlobWithPreference(blob, filename);
                            exportedFiles.push(filename);
                            exportedCount++;
                        } catch (error) {
                            debugError(`[App] Failed to export sample "${sample.name}":`, error);
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
            debugError('[App] Export All error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            alert(`Export All failed: ${errorMessage}\n\nPlease check the console for more details.`);
        }
    };


    const handleCrop = async () => {
        if (!activeSample || !engine) return;
        setCropDialogOpen(true);
    };

    const performCrop = async () => {
        if (!activeSample || !engine) return;
        setCropDialogOpen(false);

        const tempSampleStub = {
            buffer: activeSample.buffer!,
            trimStart: region.start,
            trimEnd: region.end
        };

        const newBuffer = await engine.crop(tempSampleStub);
        if (newBuffer) {
            const newBlob = audioBufferToWav(newBuffer);

            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
            const newName = `${originalName}_Cropped.${extension}`;

            const newSample: Sample = {
                id: Date.now().toString(),
                name: newName,
                duration: formatDuration(newBuffer.duration),
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
    };

    const handleCropAndExport = async (options: {
        format: ExportFormat;
        sampleRate: CropSampleRate;
        bitDepth: WavBitDepth;
        bitrate?: CropMP3Bitrate;
    }) => {
        if (!activeSample || !engine) return;
        setCropDialogOpen(false);

        const tempSampleStub = {
            buffer: activeSample.buffer!,
            trimStart: region.start,
            trimEnd: region.end
        };

        const newBuffer = await engine.crop(tempSampleStub);
        if (!newBuffer) return;

        try {
            // Resample if needed
            let exportBuffer = newBuffer;
            if (options.sampleRate !== 'original') {
                const targetRate = options.sampleRate as number;
                if (exportBuffer.sampleRate !== targetRate) {
                    exportBuffer = await engine.resampleBuffer(exportBuffer, targetRate);
                }
            }

            // Convert to chosen format
            const blob = await audioBufferToFormat(exportBuffer, options.format, {
                bitrate: options.bitrate,
                bitDepth: options.format === 'wav' ? options.bitDepth : undefined,
            });

            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
            const filename = `${originalName}_Cropped.${options.format}`;
            await downloadBlobWithPreference(blob, filename);
        } catch (error) {
            debugError('[App] Crop & Export error:', error);
            alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                    const newBlob = audioBufferToWav(newBuffer);

                    // Auto-rename with _Normalized suffix
                    const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                    const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                    const newName = `${originalName}_Normalized.${extension}`;

                    const newSample: Sample = {
                        id: Date.now().toString(),
                        name: newName,
                        duration: formatDuration(newBuffer.duration),

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
                    await muteBeforeRecording();
                    usePlaybackStore.getState().resetEffects();
                    startRecording();
                }
                return;
            }

            // 2. Standard Playback
            if (activeSample && engine) {
                if (isPlaying) {
                    setPlaying(false);
                    engine.stop();
                } else {
                    const playbackRate = timeStretchEnabled ? (1 / timeStretchRatio) : 1.0;
                    setPlaying(true);
                    engine.play(activeSample.buffer!, region.start, region.end, isLooping, playbackRate);
                }
            }

        };

        window.addEventListener('keydown', handleSpacebar);
        return () => window.removeEventListener('keydown', handleSpacebar);
    }, [engine, activeSample, isPlaying, activeSampleId, region]);

    // Sync store with AudioEngine and handle sample changes
    useEffect(() => {
        if (engine) {
            usePlaybackStore.getState().syncWithEngine(engine);
        }
    }, [engine, isPlaying, isLooping]);

    // Reset state on sample change
    useEffect(() => {
        if (isPlaying) {
            setPlaying(false);
            if (engine) engine.stop();
        }
        if (isPreviewingStretch) {
            setPreviewingStretch(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSampleId, engine]);

    // Note: Effects are reset explicitly when:
    // 1. Applying effects to create a new sample (in applyEffectsAndResample handler)
    // 2. Time stretching to create a new sample (in time stretch handler)
    // We don't automatically reset when switching samples to avoid breaking playback
    // when creating new samples via crop/normalize/etc.

    // Check if there are pending changes (region or effects)
    const hasPendingChanges = () => {
        const regionModified = region.start !== 0 || region.end !== 1;
        const eqActive = eqEnabled && (lowGain !== 0 || midGain !== 0 || highGain !== 0);
        const timeStretchActive = timeStretchEnabled && timeStretchRatio !== 1.0;
        return regionModified || eqActive || timeStretchActive;
    };

    // Check if there's a pending crop (region adjustment)
    const hasPendingCrop = () => {
        return region.start !== 0 || region.end !== 1;
    };

    // Helper function to apply time stretch (with optional crop)
    const applyTimeStretch = async (applyCrop: boolean = false) => {
        if (!activeSample?.buffer || !engine) {
            debugError('Cannot time stretch: missing buffer or engine');
            alert('Cannot time stretch: Please select a sample with audio data');
            return;
        }

        // Capture all needed data before async operations
        const currentSampleId = activeSample.id;
        let sourceBuffer = activeSample.buffer;
        const currentName = activeSample.name;
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

        debug('Starting time stretch...', {
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

            debug('Time stretch completed successfully', {
                originalLength: sourceBuffer.length,
                stretchedLength: stretched.length,
                originalDuration: sourceBuffer.duration,
                stretchedDuration: stretched.duration,
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
                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: [...currentTags, 'Time Stretched', ...(applyCrop ? ['Cropped'] : [])],
                buffer: stretched,
                blob: blob,
                trimStart: 0,
                trimEnd: 1,
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
            debug('Setting new sample as active:', newSample.id, newSample.name);
            setActiveSample(newSample.id);

            // Reset only time stretch effect after baking (not all effects)
            // This prevents double application when the new stretched sample is played
            setTimeStretchEnabled(false);
            setTimeStretchRatio(1.0);
            setPreviewingStretch(false);
            prevStretchRatioRef.current = 1.0;
        } catch (error) {
            debugError('Time stretch error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            debugError('Error details:', { error, errorMessage, stack: error instanceof Error ? error.stack : undefined });
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

    // === NEW V3 HANDLERS ===

    // Render: apply all pending changes (crop + EQ + noise + stretch) into a new sample
    const handleRender = async () => {
        if (!activeSample?.buffer || !engine || isRendering) return;
        setIsRendering(true);
        try {
            let sourceBuffer = activeSample.buffer;

            // 1. Apply crop if region is modified
            if (region.start !== 0 || region.end !== 1) {
                const tempStub = { buffer: sourceBuffer, trimStart: region.start, trimEnd: region.end };
                const cropped = await engine.crop(tempStub);
                if (cropped) {
                    sourceBuffer = cropped;
                    if (activeSampleId) setRegion(activeSampleId, { start: 0, end: 1 });
                }
            }

            // 2. Apply EQ + noise gate via engine (applyEffectsAndResample uses current engine EQ state)
            const eqActive = eqEnabled && (lowGain !== 0 || midGain !== 0 || highGain !== 0);
            if (eqActive) {
                const processed = await engine.applyEffectsAndResample(sourceBuffer);
                if (processed) sourceBuffer = processed;
            }

            // 3. Apply time stretch if enabled
            if (timeStretchEnabled && timeStretchRatio !== 1.0) {
                const stretched = await engine.timeStretch(sourceBuffer, timeStretchRatio, (p: number) => {});
                if (stretched) sourceBuffer = stretched;
            }

            // Create new sample
            const blob = audioBufferToWav(sourceBuffer);
            const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
            const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
            const newSample: Sample = {
                id: Date.now().toString(),
                name: `${originalName}_Rendered.${extension}`,
                duration: formatDuration(sourceBuffer.duration),

                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                waveform: [],
                tags: [...activeSample.tags, 'Rendered'],
                buffer: sourceBuffer,
                blob,
                trimStart: 0,
                trimEnd: 1,
            };
            setSamples(prev => [newSample, ...prev]);
            setActiveSample(newSample.id);

            // Reset effects
            setEqEnabled(false);
            setLowGain(0); setMidGain(0); setHighGain(0);
            setLowFreq(100); setMidFreq(1000); setHighFreq(8000); setMidQ(1.2);
            setTimeStretchEnabled(false);
            setTimeStretchRatio(1.0);
        } catch (error) {
            debugError('Render failed:', error);
        } finally {
            setIsRendering(false);
        }
    };

    // Reverse: flip the active sample's audio buffer
    const handleReverse = () => {
        if (!activeSample?.buffer) return;
        const buffer = activeSample.buffer;
        const ctx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const src = buffer.getChannelData(ch);
            const dst = reversed.getChannelData(ch);
            for (let i = 0; i < src.length; i++) {
                dst[i] = src[src.length - 1 - i];
            }
        }

        const blob = audioBufferToWav(reversed);
        const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
        const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
        const newSample: Sample = {
            id: Date.now().toString(),
            name: `${originalName}_Reversed.${extension}`,
            duration: formatDuration(reversed.duration),

            size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
            waveform: [],
            tags: [...activeSample.tags, 'Reversed'],
            buffer: reversed,
            blob,
            trimStart: 0,
            trimEnd: 1,
        };
        setSamples(prev => [newSample, ...prev]);
        setActiveSample(newSample.id);
    };

    // Downsample to a target sample rate via OfflineAudioContext
    const handleDownsample = async (targetRate: number) => {
        if (!activeSample?.buffer) return;
        const buffer = activeSample.buffer;
        if (targetRate >= buffer.sampleRate) return;
        const targetLength = Math.round(buffer.length * (targetRate / buffer.sampleRate));
        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, targetLength, targetRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0);
        const downsampled = await offlineCtx.startRendering();

        const blob = audioBufferToWav(downsampled);
        const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
        const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
        const newSample: Sample = {
            id: Date.now().toString(),
            name: `${originalName}_${(targetRate / 1000).toFixed(0)}kHz.${extension}`,
            duration: formatDuration(downsampled.duration),

            size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
            waveform: [],
            tags: [...activeSample.tags, 'Downsampled'],
            buffer: downsampled,
            blob,
            trimStart: 0,
            trimEnd: 1,
        };
        setSamples(prev => [newSample, ...prev]);
        setActiveSample(newSample.id);
    };

    // Source selection handler
    const handleSourceSelect = async () => {
        // Disconnect existing source first to allow selecting a new one
        if (engine && engine.sourceNode) {
            engine.sourceNode.disconnect();
            engine.sourceNode = null;
            setIsSourceConnected(false);
        }

        // Mark dialog as open
        setIsSourceDialogOpen(true);

        // Check window size - if compact (essential mode), resize for dialog
        // Using direct window check as uiMode state is removed
        if (typeof chrome !== 'undefined' && chrome.windows) {
            chrome.windows.getCurrent(async (currentWindow) => {
                if (currentWindow && currentWindow.id) {
                    const isSmall = currentWindow.width && currentWindow.width < 1000;

                    if (isSmall) {
                        const targetWidth = 1200;
                        const targetHeight = 800;

                        // Resize to a size that accommodates the dialog
                        await chrome.windows.update(currentWindow.id, {
                            width: targetWidth,
                            height: targetHeight
                        });

                        // Wait a bit for resize
                        await new Promise(r => setTimeout(r, 150));
                    }

                    // Open dialog
                    const success = await selectSource();
                    setIsSourceDialogOpen(false);

                    if (success) {
                        setActiveSourceTitle('Display Media');
                        setIsSourceConnected(true);
                        // Capture tab ID logic...
                        const urlParams = new URLSearchParams(window.location.search);
                        const targetTabIdParam = urlParams.get('targetTabId');
                        if (targetTabIdParam && chrome?.tabs) {
                            const tabId = parseInt(targetTabIdParam, 10);
                            if (!isNaN(tabId)) setSourceTabId(tabId);
                        } else if (chrome?.tabs && sourceTabId === null) {
                            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                                if (tabs[0]?.id) setSourceTabId(tabs[0].id);
                            });
                        }
                    } else {
                        setIsSourceConnected(false);
                    }
                }
            });
        } else {
            // Fallback for non-extension environment
            const success = await selectSource();
            setIsSourceDialogOpen(false);
            if (success) {
                setActiveSourceTitle('Display Media');
                setIsSourceConnected(true);
            } else {
                setIsSourceConnected(false);
            }
        }
    };

    // Source reconnect handler for TransportBar
    const handleReconnectSource = async () => {
        if (engine) {
            const isConnected = !!engine.sourceNode;
            setIsSourceConnected(isConnected);
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
    };

    // Mute source toggle for TransportBar
    const handleToggleMuteSource = async () => {
        const newValue = !muteSourceDuringRecording;
        setMuteSourceDuringRecording(newValue);
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
        if (isRecording && tabIdToUse !== null) {
            newValue ? await muteSourceTab(tabIdToUse) : await unmuteSourceTab(tabIdToUse);
        }
    };

    // Transport handlers for TransportBar
    const handleStop = () => {
        if (isRecording) stopRecording();
        if (engine) engine.stop();
        setPlaying(false);
    };
    const handleSkipBack = () => {
        handleStop();
    };
    const handleLoopToggle = () => {
        const newLoopState = !isLooping;
        if (engine) engine.isLooping = newLoopState;
        setLooping(newLoopState);
        if (isPlaying && !newLoopState && engine && activeSample?.buffer && engine.activeSource) {
            engine.stop(true);
            setTimeout(() => {
                if (engine && activeSample?.buffer) {
                    const rate = engine.currentPlaybackRate || 1.0;
                    engine.play(activeSample.buffer, region.start, region.end, false, rate);
                    setPlaying(true);
                }
            }, 10);
        }
    };
    const handleRecord = () => {
        if (isRecording) {
            stopRecording();
        } else {
            handleStartRecording();
        }
    };
    const handleArm = () => {
        toggleArm();
    };

    // Playback time formatting
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${mins}:${String(secs).padStart(2, '0')}.${ms}`;
    };
    const currentTime = formatTime(typeof playbackTime === 'object' ? playbackTime.current : 0);
    const totalTime = activeSample?.buffer ? formatTime(activeSample.buffer.duration) : '0:00.0';

    return (
        <div className="h-full w-full font-sans overflow-hidden flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
            <TransportBar
                activeSourceTitle={activeSourceTitle}
                isSourceConnected={isSourceConnected}
                muteSourceDuringRecording={muteSourceDuringRecording}
                onSourceSelect={handleSourceSelect}
                onReconnectSource={handleReconnectSource}
                onToggleMuteSource={handleToggleMuteSource}
                isPlaying={isPlaying}
                isLooping={isLooping}
                isRecording={isRecording}
                isArmed={isArmed}
                onPlay={handlePlayToggle}
                onStop={handleStop}
                onSkipBack={handleSkipBack}
                onLoopToggle={handleLoopToggle}
                onRecord={handleRecord}
                onArm={handleArm}
                currentTime={currentTime}
                totalTime={totalTime}
            />
            <FileHeader sample={activeSample || null} />

            {/* EDIT PANEL */}
            <EditPanel
                onNormalize={handleNormalize}
                onReverse={handleReverse}
                onDownsample={handleDownsample}
                onRender={handleRender}
                hasPendingChanges={hasPendingChanges()}
                isRendering={isRendering}
            >
                <EQSection
                    eqEnabled={eqEnabled}
                    setEqEnabled={setEqEnabled}
                    lowGain={lowGain}
                    setLowGain={setLowGain}
                    midGain={midGain}
                    setMidGain={setMidGain}
                    highGain={highGain}
                    setHighGain={setHighGain}
                    onReset={() => {
                        setLowGain(0); setLowFreq(100);
                        setMidGain(0); setMidFreq(1000); setMidQ(1.2);
                        setHighGain(0); setHighFreq(8000);
                    }}
                />
                <StretchSection
                    activeSample={activeSample || null}
                    timeStretchEnabled={timeStretchEnabled}
                    setTimeStretchEnabled={setTimeStretchEnabled}
                    timeStretchRatio={timeStretchRatio}
                    setTimeStretchRatio={setTimeStretchRatio}
                    timeStretchProgress={timeStretchProgress}
                    applyTimeStretch={applyTimeStretch}
                />
            </EditPanel>

            {/* MAIN WORKSPACE ROW */}
            <div className="flex-1 flex min-h-0">
                {/* LEFT: Compact Library Sidebar */}
                <div className="flex flex-col shrink-0" style={{ borderRight: '1px solid var(--border)' }}>
                    <Sidebar
                        samples={samples}
                        activeSampleId={activeSampleId}
                        selectedSampleIds={selectedSampleIds}
                        onSelectSample={handleSelectSample}
                        onSaveAs={handleSaveAs}
                        onExportAll={handleExportAll}
                        onNewSession={handleNewSession}
                        onSaveSession={() => setSessionDialogMode('save')}
                        onLoadSession={() => setSessionDialogMode('load')}
                        onDeleteSample={handleDeleteSample}
                        onDuplicateSample={handleDuplicateSample}
                        onRenameSample={handleRenameSample}
                    />
                </div>

                {/* CENTER: Waveform */}
                <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden" style={{ background: 'var(--waveform-bg)' }}>
                    {activeSample ? (
                        <div className="flex-1 relative min-h-0 overflow-hidden">
                            <WaveformDisplay
                                sample={activeSample}
                                region={region}
                                onRegionChange={(newRegion) => {
                                    if (activeSampleId) setRegion(activeSampleId, newRegion);
                                }}
                                isPlaying={isPlaying}
                                isRecording={isRecording}
                                isLooping={isLooping}
                                onCrop={handleCrop}
                                onNormalize={handleNormalize}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            {isRecording ? (
                                <div className="w-full h-full">
                                    <WaveformDisplay
                                        sample={null}
                                        region={{ start: 0, end: 1 }}
                                        onRegionChange={() => {}}
                                        isPlaying={false}
                                        isRecording={true}
                                    />
                                </div>
                            ) : (
                                <div className="text-center opacity-50">
                                    <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--elevated)' }}>
                                        <Volume2 className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                    <h3 className="font-bold mb-1 text-sm" style={{ color: 'var(--text-muted)' }}>Ready to Capture</h3>
                                    <p className="text-[10px] max-w-[180px]" style={{ color: 'var(--text-muted)' }}>Arm and record from the active tab.</p>
                                </div>
                            )}
                        </div>
                    )}
                </main>

                {/* RIGHT: VU Meters */}
                <CompactVUMeter
                    isPlaying={isPlaying}
                    isRecording={isRecording}
                    isArmed={isArmed}
                    isSourceConnected={isSourceConnected}
                    gain={gain / 100}
                    threshold={recThreshold}
                    onGainChange={(v) => setGain(Math.round(v * 100))}
                    onThresholdChange={setRecThreshold}
                />
            </div>

            {/* Footer */}
            <div
                className="shrink-0 flex items-center justify-between px-3 py-0.5"
                style={{ background: 'var(--deep)', borderTop: '1px solid var(--border-subtle)' }}
            >
                <span className="text-[7px]" style={{ color: 'var(--text-faint)' }}>
                    All processing happens locally. MP3 by <a href="https://lame.sourceforge.net" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>LAME</a> (LGPL-3.0)
                </span>
                <a
                    href="https://ko-fi.com/W7W51UG11V"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[7px] font-medium hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                >
                    Support on Ko-fi
                </a>
            </div>

            {/* Processing Dialog */}
            {processingDialog && (
                <ProcessingDialog
                    isOpen={processingDialog.isOpen}
                    title={processingDialog.title || (
                        processingDialog.type === 'crop' ? 'Crop Selection' :
                            processingDialog.type === 'normalize' ? 'Normalize Audio' :
                                processingDialog.type === 'filter' ? 'Apply Multiband Filter' :
                                    processingDialog.type === 'filter-with-crop' ? 'Apply EQ with Pending Crop' :
                                        processingDialog.type === 'timeStretch-with-crop' ? 'Time Stretch with Pending Crop' :
                                            'Processing'
                    )}
                    description={processingDialog.description || (
                        processingDialog.type === 'crop' ? 'Create a new sample from the selected region' :
                            processingDialog.type === 'normalize' ? 'Normalize audio levels to maximum without clipping' :
                                processingDialog.type === 'filter' ? 'Apply multiband filtering to the sample' :
                                    processingDialog.type === 'filter-with-crop' ? 'You have region adjustments active. Apply the crop as well?' :
                                        processingDialog.type === 'timeStretch-with-crop' ? 'You have region adjustments active. Apply the crop as well?' :
                                            'Process audio'
                    )}
                    processingType={processingDialog.type}
                    onConfirm={processingDialog.onConfirm}
                    onApplyWithCrop={processingDialog.onApplyWithCrop}
                    onCancel={() => setProcessingDialog(null)}
                />
            )}


            {/* Crop Dialog */}
            <CropDialog
                isOpen={cropDialogOpen}
                sample={activeSample || null}
                region={region}
                onCancel={() => setCropDialogOpen(false)}
                onCrop={performCrop}
                onCropAndExport={handleCropAndExport}
            />

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
                            await performSaveAs(exportDialog.sampleId, options.format, options.sampleRate, options.bitDepth, options.bitrate);
                        } else if (exportDialog.mode === 'export-all') {
                            await performExportAll(options.format, options.sampleRate, options.bitDepth, options.bitrate, options.exportAsZip);
                        }
                    }}
                />
            )}
        </div>
    );
}
