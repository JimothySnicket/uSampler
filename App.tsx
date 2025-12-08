import { useState, useEffect } from 'react';
import { useAudio } from './src/context/AudioContext';
import {
    Play, Pause, Square, SkipBack, Scissors,
    Sliders, Wand2, Lock, MonitorPlay, ChevronDown, RefreshCcw, Crop, Volume2, AudioWaveform, Keyboard, ChevronRight
} from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { WaveformDisplay } from './components/WaveformDisplay';
import { UnifiedControl } from './components/UnifiedControl';
import { PaddleControl } from './components/PaddleControl';
import { ProcessingDialog } from './components/ProcessingDialog';
import { formatDuration, audioBufferToWav } from './src/utils/audioUtils';
import { Sample, Region, TabView, Chop } from './types';
import { AudioState } from './src/core/AudioEngine';
import JSZip from 'jszip';

// Dev version - increment this number with each update
const DEV_VERSION = '2.1';

export default function App() {
    const { engine, state, startRecording, stopRecording, toggleArm, isArmed, selectSource, setRecordingCallback } = useAudio();

    const isRecording = state === AudioState.RECORDING;
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeTab, setActiveTab] = useState<TabView>(TabView.MAIN);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [activeSampleId, setActiveSampleId] = useState<string>('');
    const [selectedSampleIds, setSelectedSampleIds] = useState<Set<string>>(new Set());

    const [region, setRegion] = useState<Region>({ start: 0, end: 1 });
    const [gain, setGain] = useState(100);
    const [recThreshold, setRecThreshold] = useState(75);
    const [isMuted, setIsMuted] = useState(false);
    const [activeSourceTitle, setActiveSourceTitle] = useState('Select Source');
    const [isSourceConnected, setIsSourceConnected] = useState(false);

    // Multiband filtering state
    const [filterMode, setFilterMode] = useState<'2band' | '3band'>('2band');
    const [lowFreq, setLowFreq] = useState(200); // Hz
    const [highFreq, setHighFreq] = useState(8000); // Hz
    const [lowGain, setLowGain] = useState(0); // dB
    const [highGain, setHighGain] = useState(0); // dB
    const [midFreq, setMidFreq] = useState(2000); // Hz (for 3-band)
    const [midGain, setMidGain] = useState(0); // dB (for 3-band)
    const [midQ, setMidQ] = useState(1); // Q factor (for 3-band)

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

    // Chopping state
    const [chopThreshold, setChopThreshold] = useState(10); // %
    const [chopSliceCount, setChopSliceCount] = useState(8);
    const [chops, setChops] = useState<Chop[]>([]);
    const [activeChopId, setActiveChopId] = useState<string | null>(null);
    const [chopsLinked, setChopsLinked] = useState(true); // Default linked
    const [keyboardMappingEnabled, setKeyboardMappingEnabled] = useState(false);
    const [expandedSamples, setExpandedSamples] = useState<Set<string>>(new Set());
    const [thresholdChoppingEnabled, setThresholdChoppingEnabled] = useState(false);
    const [chopSubTab, setChopSubTab] = useState<'threshold' | 'equal' | 'manual'>('threshold');

    // Sample rate selector
    const [exportSampleRate, setExportSampleRate] = useState<number | null>(null);

    // Processing dialog state
    const [processingDialog, setProcessingDialog] = useState<{
        isOpen: boolean;
        type: 'crop' | 'normalize' | 'filter' | 'adsr' | 'chop';
        onConfirm: () => void;
    } | null>(null);

    // Edit mode (individual vs all)
    const [editMode, setEditMode] = useState<'individual' | 'all'>('individual');

    // Manual chopping state
    const [manualChoppingEnabled, setManualChoppingEnabled] = useState(false);
    const [manualChopPoints, setManualChopPoints] = useState<number[]>([]);

    // Resizable splitter state (0.4 = 40% waveform, 60% controls)
    const [splitRatio, setSplitRatio] = useState(0.4);
    const [isResizing, setIsResizing] = useState(false);

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
            setActiveSampleId(newSample.id);
        });
    }, [setRecordingCallback]);

    // Auto-initialize on mount (only once)
    useEffect(() => {
        const init = async () => {
            try {
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

    // Sync playback end and volume, and check source connection status
    useEffect(() => {
        if (engine) {
            engine.onPlaybackEnded = () => setIsPlaying(false);
            engine.setVolume(isMuted ? 0 : gain / 100);
            // Check if source is connected
            setIsSourceConnected(!!engine.sourceNode);
        }
    }, [engine, gain, isMuted, state]); // Include state to detect when recording starts/stops

    // Update threshold
    useEffect(() => {
        if (engine) {
            engine.threshold = recThreshold;
        }
    }, [recThreshold, engine]);

    const toggleRecord = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handlePlayToggle = () => {
        if (!activeSample) return;

        if (isPlaying) {
            setIsPlaying(false);
            if (engine) engine.stop();
        } else {
            setIsPlaying(true);
            if (engine && activeSample.buffer) {
                engine.play(activeSample.buffer, region.start, region.end, false);
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
                setActiveSampleId(id);
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
                setActiveSampleId(id);
            }
        } else {
            setSelectedSampleIds(new Set([id]));
            setActiveSampleId(id);
        }
    };

    const handleDeleteSample = (id: string) => {
        const newSamples = samples.filter(s => s.id !== id);
        setSamples(newSamples);
        if (activeSampleId === id && newSamples.length > 0) {
            setActiveSampleId(newSamples[0].id);
        } else if (activeSampleId === id) {
            setActiveSampleId('');
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

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleSaveAs = async (id: string) => {
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
                const newBuffer = await engine.crop(tempStub);
                if (newBuffer) {
                    const blob = audioBufferToWav(newBuffer);
                    const originalName = sample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                    const chopIndex = chops.findIndex(c => c.id === activeChopId) + 1;
                    downloadBlob(blob, `${originalName}_Slice_${chopIndex}.wav`);
                    return;
                }
            }
        }

        const targets = new Set(selectedSampleIds);
        let idsToSave = (targets.size > 0 && targets.has(id)) ? Array.from(targets) : [id];

        if (idsToSave.length === 1) {
            const sample = samples.find(s => s.id === idsToSave[0]);
            if (sample && sample.buffer) {
                const blob = audioBufferToWav(sample.buffer);
                downloadBlob(blob, sample.name);
            }
        } else {
            const zip = new JSZip();
            const folder = zip.folder("uSampler_Selection");

            for (const tid of idsToSave) {
                const sample = samples.find(s => s.id === tid);
                if (sample && sample.buffer) {
                    const blob = audioBufferToWav(sample.buffer);
                    folder?.file(sample.name, blob);
                }
            }

            const content = await zip.generateAsync({ type: "blob" });
            downloadBlob(content, "uSampler_Selection.zip");
        }
    };

    const handleExportAll = async () => {
        if (samples.length === 0) return;

        const zip = new JSZip();
        const dateStr = new Date().toISOString().slice(0, 10);
        const folder = zip.folder(`uSampler_Session_${dateStr}`);

        samples.forEach(sample => {
            if (sample.buffer) {
                const blob = audioBufferToWav(sample.buffer);
                folder?.file(sample.name, blob);
            }
        });

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
        downloadBlob(content, `uSampler_Session_${dateStr}.zip`);
    };

    const handleShare = async () => {
        const idsToShare = selectedSampleIds.size > 0 ? Array.from(selectedSampleIds) : activeSampleId ? [activeSampleId] : samples.map(s => s.id);
        if (idsToShare.length === 0) return;

        const files: File[] = [];
        for (const tid of idsToShare) {
            const sample = samples.find(s => s.id === tid);
            if (sample && sample.buffer) {
                const blob = audioBufferToWav(sample.buffer);
                files.push(new File([blob], sample.name, { type: 'audio/wav' }));
            }
        }

        if (files.length === 0) return;

        if (navigator.canShare && navigator.canShare({ files })) {
            try {
                await navigator.share({
                    files,
                    title: 'uSampler Export',
                    text: `Sharing ${files.length} samples from uSampler`
                });
                return;
            } catch (err) {
                console.log('Share failed', err);
            }
        }

        if (idsToShare.length > 1) {
            const zip = new JSZip();
            const folder = zip.folder("uSampler_Share");
            files.forEach(f => folder?.file(f.name, f));
            const content = await zip.generateAsync({ type: "blob" });
            downloadBlob(content, "uSampler_Share.zip");
        } else {
            downloadBlob(files[0], files[0].name);
        }
    };

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
                    setActiveSampleId(newSample.id);
                    setRegion({ start: 0, end: 1 });
                }
            }
        });
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
                    setActiveSampleId(newSample.id);
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

            setChops(sortedChops);
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

    // Dynamic threshold adjustment with live preview
    useEffect(() => {
        if (activeSample && engine && activeTab === TabView.CHOP && thresholdChoppingEnabled && chopSubTab === 'threshold') {
            const chopPoints = engine.detectTransients(activeSample.buffer!, chopThreshold);
            const newChops = convertChopPointsToChops(chopPoints, activeSample.buffer!);
            setChops(newChops);

            // Update active sample with chops for sidebar display
            setSamples(prev => prev.map(s =>
                s.id === activeSampleId ? { ...s, chops: newChops } : s
            ));

            // Auto-expand sample in sidebar when chops are created
            if (newChops.length > 0) {
                setExpandedSamples(prev => new Set([...prev, activeSampleId]));
            }

            if (newChops.length > 0 && !activeChopId) {
                setActiveChopId(newChops[0].id);
            }
        } else if (!thresholdChoppingEnabled && chopSubTab === 'threshold') {
            setChops([]);
            setSamples(prev => prev.map(s =>
                s.id === activeSampleId ? { ...s, chops: undefined } : s
            ));
        }
    }, [chopThreshold, activeSample?.buffer, activeSample?.id, engine, activeTab, thresholdChoppingEnabled, chopSubTab]);

    // Dynamic equal chopping with live preview
    useEffect(() => {
        if (activeSample && engine && activeTab === TabView.CHOP && chopSubTab === 'equal' && chopSliceCount > 1) {
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

            setChops(newChops);
            setSamples(prev => prev.map(s =>
                s.id === activeSampleId ? { ...s, chops: newChops } : s
            ));

            // Auto-expand sample in sidebar when chops are created
            if (newChops.length > 0) {
                setExpandedSamples(prev => new Set([...prev, activeSampleId]));
            }

            if (newChops.length > 0 && !activeChopId) {
                setActiveChopId(newChops[0].id);
            }
        } else if (chopSubTab === 'equal' && chopSliceCount <= 1) {
            setChops([]);
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
                    setActiveChopId(chop.id);
                    // Play chop with pitch shifting if needed
                    const pitchShift = Math.pow(2, (note - 60) / 12); // C4 = 60 is base
                    engine.play(activeSample.buffer, chop.start, chop.end, false);
                    // Note: pitch shifting would require modifying play() method
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [keyboardMappingEnabled, engine, activeSample, chops]);

    // Consolidated Global Spacebar Handler
    useEffect(() => {
        const handleSpacebar = (e: KeyboardEvent) => {
            if (e.key !== ' ' && e.code !== 'Space') return;
            // Ignore if input focused
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            e.preventDefault();

            // 1. Empty Sampler -> Toggle Record
            if (!activeSample && samples.length === 0) {
                if (isRecording) {
                    stopRecording();
                } else {
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
                            setIsPlaying(true);

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

                            setChops(newChops);
                            setSamples(prev => prev.map(s =>
                                s.id === activeSampleId ? { ...s, chops: newChops } : s
                            ));

                            // Play from start
                            engine.play(activeSample.buffer, chop.start, 1, false);
                            return;
                        }
                    }

                    // Default Start
                    setIsPlaying(true);
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

                        setChops(newChops);
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
                            if (newChop) setActiveChopId(newChop.id);
                        }
                    }
                }
            }


            // 3. Standard Playback
            if (activeSample && engine) {
                if (isPlaying) {
                    setIsPlaying(false);
                    engine.stop();
                } else {
                    // Play Selection if Active (Consumer requirement #2)
                    if (activeChopId && !manualChoppingEnabled) {
                        const chop = chops.find(c => c.id === activeChopId);
                        if (chop && activeSample.buffer) {
                            setIsPlaying(true);
                            engine.play(activeSample.buffer, chop.start, chop.end, false);
                            return;
                        }
                    }

                    // Fallback: Play full sample region
                    setIsPlaying(true);
                    engine.play(activeSample.buffer!, region.start, region.end, false);
                }
            }

        };

        window.addEventListener('keydown', handleSpacebar);
        return () => window.removeEventListener('keydown', handleSpacebar);
    }, [manualChoppingEnabled, engine, activeSample, isPlaying, activeTab, chopSubTab, activeSampleId, manualChopPoints, region, activeChopId, chops]);

    // Reset Chop State on Sample Change
    useEffect(() => {
        // Stop playback when switching samples (Consumer requirement #5)
        if (isPlaying) {
            setIsPlaying(false);
            if (engine) engine.stop();
        }

        if (activeSample) {
            setChops(activeSample.chops || []);
            setActiveChopId(null);
            // Optional: Reset manual mode to avoid confusion?
            // The user report says "chop mode overlay doesnt disable", suggesting they expect it to clear.
            setManualChopPoints([]);
            // We usually want to keep the mode enabled if they are slicing multiple things, 
            // but we MUST clear the points so the old lines don't show up.
        }
    }, [activeSampleId, engine]);

    // Chopping handlers
    const handleCreateChopSamples = async () => {
        if (!activeSample || !engine || chops.length === 0) return;

        const newSamples: Sample[] = [];
        for (let i = 0; i < chops.length; i++) {
            const chop = chops[i];
            const tempSampleStub = {
                buffer: activeSample.buffer!,
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
        setChops([]); // Clear chops after creating samples
        setActiveChopId(null);
    };


    const handleClearChops = () => {
        // Clear all chops
        setChops([]);
        setActiveChopId(null);

        // Clear chops from all samples in the tree
        setSamples(prev => prev.map(s => ({ ...s, chops: undefined })));

        // Turn off all chop modes
        setThresholdChoppingEnabled(false);
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

        setProcessingDialog({
            isOpen: true,
            type: 'chop',
            onConfirm: async () => {
                setProcessingDialog(null);
                await handleCreateChopSamples();
            }
        });
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
            <header className="h-16 border-b border-zinc-800 flex items-center bg-zinc-950 shrink-0 z-50 relative">
                {/* LOGO AREA */}
                <div className="w-72 h-full border-r border-zinc-800 flex items-center justify-between px-6 gap-2 text-indigo-400 shrink-0">
                    <div className="flex items-center gap-2">
                        <AudioWaveform className="w-6 h-6" />
                        <div className="flex flex-col">
                            <h1 className="font-bold text-lg tracking-tight text-white">uSampler</h1>
                            <span className="text-[10px] font-bold text-orange-500">DEV v{DEV_VERSION}</span>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setActiveSampleId('');
                            setRegion({ start: 0, end: 1 });
                            setIsPlaying(false);
                            if (engine) engine.stop();
                            setActiveChopId(null);
                        }}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold tracking-wide uppercase border border-zinc-700 hover:border-indigo-500/50 transition-all"
                        title="Clear workspace for new sample"
                    >
                        New Sample
                    </button>
                </div>

                {/* CONTROLS AREA */}
                <div className="flex-1 flex items-center justify-between px-6 min-w-0 gap-4">
                    {/* LEFT: Target Source */}
                    <div className="flex items-center gap-3 shrink">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-0.5">Source</span>
                            <div className="flex items-center gap-2">
                                <div className="relative group">
                                    <button
                                        onClick={async () => {
                                            const success = await selectSource();
                                            if (success) {
                                                setActiveSourceTitle('Display Media');
                                                setIsSourceConnected(true);
                                            }
                                        }}
                                        className="flex items-center gap-2 text-sm text-zinc-200 hover:text-white font-medium transition-colors"
                                    >
                                        <MonitorPlay className={`w-4 h-4 ${isSourceConnected ? 'text-green-500' : 'text-red-500'}`} />
                                        <span className="truncate max-w-[120px]">{isSourceConnected ? activeSourceTitle : 'Select Source'}</span>
                                        <ChevronDown className="w-3 h-3 text-zinc-500" />
                                    </button>
                                </div>
                                <button
                                    onClick={async () => {
                                        // Disconnect existing source first
                                        if (engine && engine.sourceNode) {
                                            engine.sourceNode.disconnect();
                                            engine.sourceNode = null;
                                            setIsSourceConnected(false);
                                        }
                                        const success = await selectSource();
                                        if (success) {
                                            setActiveSourceTitle('Display Media');
                                            setIsSourceConnected(true);
                                        }
                                    }}
                                    className="p-1.5 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-indigo-400 transition-colors"
                                    title="Refresh Audio Connection"
                                >
                                    <RefreshCcw className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* CENTER: Classic Transport Controls */}
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={toggleArm}
                            className={`flex flex-col items-center justify-center px-4 py-1.5 rounded transition-all border ${isArmed
                                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400'
                                }`}
                            title={isArmed ? "Disarm threshold recording" : "Arm threshold recording"}
                        >
                            <span className="text-[9px] font-bold uppercase tracking-wider">ARM</span>
                            <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isArmed ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-700'}`} />
                        </button>

                        <button
                            onClick={() => setKeyboardMappingEnabled(!keyboardMappingEnabled)}
                            className={`flex flex-col items-center justify-center px-4 py-1.5 rounded transition-all border ${keyboardMappingEnabled
                                ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-400'
                                }`}
                            title={keyboardMappingEnabled ? "Disable keyboard mapping" : "Enable keyboard mapping (Ableton-style)"}
                        >
                            <Keyboard className="w-3 h-3 mb-0.5" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">KEY</span>
                        </button>

                        <div className="w-px h-8 bg-zinc-800 mx-1" />

                        <button
                            onClick={() => {
                                if (isRecording) stopRecording();
                                if (engine) engine.stop();
                                setIsPlaying(false);
                            }}
                            className="p-2.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            title="Stop Recording/Playback"
                        >
                            <SkipBack className="w-5 h-5 fill-current" />
                        </button>

                        <button
                            onClick={() => {
                                if (isRecording) stopRecording();
                                if (engine) engine.stop();
                                setIsPlaying(false);
                            }}
                            className="p-2.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                            title="Stop Recording/Playback"
                        >
                            <Square className="w-5 h-5 fill-current" />
                        </button>

                        <button
                            onClick={handlePlayToggle}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border ${isPlaying
                                ? 'bg-indigo-500 border-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700 hover:border-zinc-600 hover:text-white'
                                }`}
                        >
                            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                        </button>

                        <button
                            onClick={toggleRecord}
                            title={isRecording ? "Stop Recording" : "Start Recording"}
                            className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ml-1 ${isRecording
                                ? 'bg-red-600 border-red-500 text-white animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]'
                                : 'bg-zinc-900 border-red-900/40 text-red-600 hover:text-red-500 hover:border-red-500 hover:bg-red-950/20 shadow-[0_0_10px_rgba(220,38,38,0.1)]'
                                }`}
                        >
                            <div className={`rounded-full transition-all ${isRecording ? 'w-4 h-4 bg-white rounded-sm' : 'w-5 h-5 bg-current'}`} />
                        </button>
                    </div>

                    {/* RIGHT: Status Indicator */}
                    <div className="flex justify-end text-xs text-zinc-600 font-mono shrink-0 min-w-[120px]">
                        {isRecording ? (
                            <span className="flex items-center gap-2 text-red-500 animate-pulse font-bold tracking-widest">
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                RECORDING
                            </span>
                        ) : isArmed ? (
                            <span className="text-yellow-600 font-medium tracking-wide">READY TO RECORD</span>
                        ) : null}
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
                    onShare={handleShare}
                    onSelectChop={(sampleId, chopId) => {
                        handleSelectSample(sampleId);
                        setActiveSampleId(sampleId);
                        setActiveChopId(chopId);
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
                <main className="flex-1 flex flex-col bg-zinc-950/50 min-w-[400px] min-h-0 overflow-hidden">
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
                                        onRegionChange={setRegion}
                                        isPlaying={isPlaying}
                                        isRecording={isRecording}
                                        chops={activeTab === TabView.CHOP ? chops : []}
                                        activeChopId={activeChopId}
                                        chopsLinked={chopsLinked}
                                        previewMode={activeTab === TabView.CHOP}
                                        onChopClick={(chopId) => {
                                            setActiveChopId(chopId);
                                            const chop = chops.find(c => c.id === chopId);
                                            if (chop && engine && activeSample?.buffer) {
                                                engine.play(activeSample.buffer, chop.start, chop.end, false);
                                            }
                                        }}
                                        onChopUpdate={(updatedChops) => {
                                            setChops(updatedChops);
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
                        <div className="flex border-b border-zinc-800 bg-zinc-950 shrink-0 relative">
                            {/* Edit Toggle - Top Right */}
                            <div className="absolute top-0 right-0 h-full flex items-center px-4 gap-2 z-10">
                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Edit:</span>
                                <button
                                    onClick={() => setEditMode(editMode === 'individual' ? 'all' : 'individual')}
                                    className={`px-3 py-1.5 rounded text-[10px] font-bold tracking-wide transition-all border ${editMode === 'individual'
                                        ? 'bg-indigo-600 text-white border-indigo-500'
                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                                        }`}
                                    title={editMode === 'individual' ? 'Currently editing individual sample' : 'Currently editing all samples'}
                                >
                                    {editMode === 'individual' ? 'Individual' : 'All'}
                                </button>
                            </div>
                            <button
                                onClick={() => setActiveTab(TabView.MAIN)}
                                className={`px-6 py-3 text-xs font-bold tracking-wide transition-colors border-r border-zinc-800 ${activeTab === TabView.MAIN ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                INFO
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.CHOP)}
                                className={`px-6 py-3 text-xs font-bold tracking-wide transition-colors border-r border-zinc-800 flex items-center gap-2 ${activeTab === TabView.CHOP ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Scissors className="w-3 h-3" /> CHOP
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.EQ)}
                                className={`px-6 py-3 text-xs font-bold tracking-wide transition-colors border-r border-zinc-800 flex items-center gap-2 ${activeTab === TabView.EQ ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Sliders className="w-3 h-3" /> EQ & FX
                            </button>
                            <button
                                onClick={() => setActiveTab(TabView.AI)}
                                className={`px-6 py-3 text-xs font-bold tracking-wide transition-colors flex items-center gap-2 ${activeTab === TabView.AI ? 'text-indigo-400 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                    }`}
                            >
                                <Wand2 className="w-3 h-3" /> AI
                            </button>
                        </div>

                        <div className="flex-1 relative p-4 bg-zinc-900 overflow-hidden min-h-0">
                            {activeTab === TabView.MAIN && activeSample && (
                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <h4 className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-3">Sample Metadata</h4>
                                        <div className="space-y-3">
                                            {activeSample.buffer && (
                                                <>
                                                    <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                        <span className="text-zinc-500">Sample Rate</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-zinc-200 font-mono">
                                                                {activeSample.buffer.sampleRate % 1000 === 0
                                                                    ? `${(activeSample.buffer.sampleRate / 1000).toFixed(0)}.0 kHz`
                                                                    : `${(activeSample.buffer.sampleRate / 1000).toFixed(1)} kHz`}
                                                            </span>
                                                            <select
                                                                value={exportSampleRate || activeSample.buffer.sampleRate}
                                                                onChange={(e) => setExportSampleRate(Number(e.target.value))}
                                                                className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold tracking-wide uppercase border border-zinc-700 hover:border-zinc-600 transition-all"
                                                                title="Select export sample rate"
                                                            >
                                                                <option value={activeSample.buffer.sampleRate}>Original ({activeSample.buffer.sampleRate % 1000 === 0 ? `${(activeSample.buffer.sampleRate / 1000).toFixed(0)}.0` : `${(activeSample.buffer.sampleRate / 1000).toFixed(1)}`} kHz)</option>
                                                                <option value="44100">44.1 kHz</option>
                                                                <option value="48000">48 kHz</option>
                                                                <option value="96000">96 kHz</option>
                                                                <option value="192000">192 kHz</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                        <span className="text-zinc-500">Bit Depth</span>
                                                        <span className="text-zinc-200 font-mono">32-bit (Float)</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                        <span className="text-zinc-500">Channels</span>
                                                        <span className="text-zinc-200 font-mono">
                                                            {activeSample.buffer.numberOfChannels === 1 ? 'Mono' :
                                                                activeSample.buffer.numberOfChannels === 2 ? 'Stereo' :
                                                                    `${activeSample.buffer.numberOfChannels} Channels`}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                        <span className="text-zinc-500">Format</span>
                                                        <span className="text-zinc-200 font-mono">
                                                            {activeSample.blob?.type === 'audio/webm' ? 'WebM' :
                                                                activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1]?.toUpperCase() || 'WAV'}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                <span className="text-zinc-500">Duration</span>
                                                <span className="text-zinc-200 font-mono">{activeSample.duration}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                <span className="text-zinc-500">Size</span>
                                                <span className="text-zinc-200 font-mono">{activeSample.size}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                <span className="text-zinc-500">BPM</span>
                                                <span className="text-zinc-200 font-mono">{activeSample.bpm || '—'}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm border-b border-zinc-800 pb-2">
                                                <span className="text-zinc-500">Key</span>
                                                <span className="text-zinc-200 font-mono">—</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-3">Tags</h4>
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
                                                if (chopSubTab !== 'threshold') {
                                                    handleClearChops();
                                                }
                                                setChopSubTab('threshold');
                                            }}
                                            className={`px-6 py-3 text-sm font-bold tracking-wide transition-colors border-r border-zinc-800 ${chopSubTab === 'threshold' ? 'text-white bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
                                                }`}
                                        >
                                            Threshold
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
                                        {chopSubTab === 'threshold' && (
                                            <div className="h-full p-4 flex flex-col overflow-hidden relative">
                                                <div className="flex items-center justify-between mb-4 shrink-0">
                                                    <div>
                                                        <h4 className="text-zinc-200 text-base font-bold mb-1">Threshold-Based Chopping</h4>
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
                                                                if (thresholdChoppingEnabled) {
                                                                    // Turning off - clear chops
                                                                    handleClearChops();
                                                                }
                                                                setThresholdChoppingEnabled(!thresholdChoppingEnabled);
                                                            }}
                                                            className={`px-4 py-2 rounded text-xs font-bold transition-all shrink-0 ${thresholdChoppingEnabled
                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                                }`}
                                                        >
                                                            {thresholdChoppingEnabled ? 'ON' : 'OFF'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {thresholdChoppingEnabled && (
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

                                                {!thresholdChoppingEnabled && (
                                                    <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                                                        Enable threshold chopping to detect and create chops automatically
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
                                                                    setIsPlaying(false);
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
                                <div className="h-full p-4 overflow-y-auto">
                                    <div className="space-y-8">
                                        {/* Multiband Filtering */}
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h4 className="text-zinc-300 text-sm font-bold mb-1">Multiband Filtering</h4>
                                                    <p className="text-xs text-zinc-500">Adjust frequency bands</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setFilterMode('2band')}
                                                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${filterMode === '2band'
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        2-Band
                                                    </button>
                                                    <button
                                                        onClick={() => setFilterMode('3band')}
                                                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${filterMode === '3band'
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        3-Band
                                                    </button>
                                                </div>
                                            </div>

                                            {filterMode === '2band' ? (
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <h5 className="text-zinc-400 text-xs font-semibold">Low Band</h5>
                                                        <PaddleControl
                                                            label="Frequency"
                                                            value={lowFreq}
                                                            onChange={setLowFreq}
                                                            min={20}
                                                            max={2000}
                                                            unit="Hz"
                                                            color="indigo"
                                                            description="Low pass frequency"
                                                        />
                                                        <PaddleControl
                                                            label="Gain"
                                                            value={lowGain}
                                                            onChange={setLowGain}
                                                            min={-24}
                                                            max={24}
                                                            unit="dB"
                                                            color="indigo"
                                                            description="Low band gain"
                                                        />
                                                    </div>
                                                    <div className="space-y-4">
                                                        <h5 className="text-zinc-400 text-xs font-semibold">High Band</h5>
                                                        <PaddleControl
                                                            label="Frequency"
                                                            value={highFreq}
                                                            onChange={setHighFreq}
                                                            min={2000}
                                                            max={20000}
                                                            unit="Hz"
                                                            color="green"
                                                            description="High pass frequency"
                                                        />
                                                        <PaddleControl
                                                            label="Gain"
                                                            value={highGain}
                                                            onChange={setHighGain}
                                                            min={-24}
                                                            max={24}
                                                            unit="dB"
                                                            color="green"
                                                            description="High band gain"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 gap-4">
                                                    <div className="space-y-4">
                                                        <h5 className="text-zinc-400 text-xs font-semibold">Low</h5>
                                                        <PaddleControl
                                                            label="Freq"
                                                            value={lowFreq}
                                                            onChange={setLowFreq}
                                                            min={20}
                                                            max={1000}
                                                            unit="Hz"
                                                            color="indigo"
                                                        />
                                                        <PaddleControl
                                                            label="Gain"
                                                            value={lowGain}
                                                            onChange={setLowGain}
                                                            min={-24}
                                                            max={24}
                                                            unit="dB"
                                                            color="indigo"
                                                        />
                                                    </div>
                                                    <div className="space-y-4">
                                                        <h5 className="text-zinc-400 text-xs font-semibold">Mid</h5>
                                                        <PaddleControl
                                                            label="Freq"
                                                            value={midFreq}
                                                            onChange={setMidFreq}
                                                            min={200}
                                                            max={8000}
                                                            unit="Hz"
                                                            color="yellow"
                                                        />
                                                        <PaddleControl
                                                            label="Gain"
                                                            value={midGain}
                                                            onChange={setMidGain}
                                                            min={-24}
                                                            max={24}
                                                            unit="dB"
                                                            color="yellow"
                                                        />
                                                        <PaddleControl
                                                            label="Q"
                                                            value={midQ}
                                                            onChange={setMidQ}
                                                            min={0.1}
                                                            max={10}
                                                            unit=""
                                                            color="yellow"
                                                        />
                                                    </div>
                                                    <div className="space-y-4">
                                                        <h5 className="text-zinc-400 text-xs font-semibold">High</h5>
                                                        <PaddleControl
                                                            label="Freq"
                                                            value={highFreq}
                                                            onChange={setHighFreq}
                                                            min={2000}
                                                            max={20000}
                                                            unit="Hz"
                                                            color="green"
                                                        />
                                                        <PaddleControl
                                                            label="Gain"
                                                            value={highGain}
                                                            onChange={setHighGain}
                                                            min={-24}
                                                            max={24}
                                                            unit="dB"
                                                            color="green"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Apply Button */}
                                            <div className="mt-6 flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        setProcessingDialog({
                                                            isOpen: true,
                                                            type: 'filter',
                                                            onConfirm: async () => {
                                                                setProcessingDialog(null);
                                                                // TODO: Implement multiband filtering processing
                                                                // For now, just show that it would create a filtered sample
                                                                if (activeSample && engine) {
                                                                    // This would need to be implemented in AudioEngine
                                                                    const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                                                                    const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                                                                    const newName = `${originalName}_Filtered.${extension}`;
                                                                    // Placeholder - actual filtering would go here
                                                                    console.log('Multiband filtering would be applied:', { filterMode, lowFreq, highFreq, lowGain, highGain, midFreq, midGain, midQ });
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded transition-colors shadow-lg shadow-indigo-500/20"
                                                >
                                                    Apply Filtering
                                                </button>
                                            </div>
                                        </div>

                                        {/* ADSR Processing */}
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <h4 className="text-zinc-300 text-sm font-bold mb-1">ADSR Processing</h4>
                                                    <p className="text-xs text-zinc-500">Envelope shaping</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setAdsrMode('envelope')}
                                                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${adsrMode === 'envelope'
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        Envelope
                                                    </button>
                                                    <button
                                                        onClick={() => setAdsrMode('gate')}
                                                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${adsrMode === 'gate'
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                            }`}
                                                    >
                                                        Gate
                                                    </button>
                                                </div>
                                            </div>

                                            {adsrMode === 'envelope' ? (
                                                <div className="grid grid-cols-4 gap-4">
                                                    <PaddleControl
                                                        label="Attack"
                                                        value={attack * 1000}
                                                        onChange={(v) => setAttack(v / 1000)}
                                                        min={1}
                                                        max={1000}
                                                        unit="ms"
                                                        color="indigo"
                                                    />
                                                    <PaddleControl
                                                        label="Decay"
                                                        value={decay * 1000}
                                                        onChange={(v) => setDecay(v / 1000)}
                                                        min={1}
                                                        max={1000}
                                                        unit="ms"
                                                        color="yellow"
                                                    />
                                                    <PaddleControl
                                                        label="Sustain"
                                                        value={sustain * 100}
                                                        onChange={(v) => setSustain(v / 100)}
                                                        min={0}
                                                        max={100}
                                                        unit="%"
                                                        color="green"
                                                    />
                                                    <PaddleControl
                                                        label="Release"
                                                        value={release * 1000}
                                                        onChange={(v) => setRelease(v / 1000)}
                                                        min={1}
                                                        max={2000}
                                                        unit="ms"
                                                        color="red"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-4 gap-4">
                                                    <PaddleControl
                                                        label="Threshold"
                                                        value={gateThreshold}
                                                        onChange={setGateThreshold}
                                                        min={-60}
                                                        max={0}
                                                        unit="dB"
                                                        color="indigo"
                                                    />
                                                    <PaddleControl
                                                        label="Ratio"
                                                        value={gateRatio}
                                                        onChange={setGateRatio}
                                                        min={1}
                                                        max={20}
                                                        unit=":1"
                                                        color="yellow"
                                                    />
                                                    <PaddleControl
                                                        label="Attack"
                                                        value={gateAttack * 1000}
                                                        onChange={(v) => setGateAttack(v / 1000)}
                                                        min={0.1}
                                                        max={100}
                                                        unit="ms"
                                                        color="green"
                                                    />
                                                    <PaddleControl
                                                        label="Release"
                                                        value={gateRelease * 1000}
                                                        onChange={(v) => setGateRelease(v / 1000)}
                                                        min={1}
                                                        max={500}
                                                        unit="ms"
                                                        color="red"
                                                    />
                                                </div>
                                            )}

                                            {/* Apply Button */}
                                            <div className="mt-6 flex justify-end">
                                                <button
                                                    onClick={() => {
                                                        setProcessingDialog({
                                                            isOpen: true,
                                                            type: 'adsr',
                                                            onConfirm: async () => {
                                                                setProcessingDialog(null);
                                                                // TODO: Implement ADSR processing
                                                                // For now, just show that it would create an ADSR processed sample
                                                                if (activeSample && engine) {
                                                                    const originalName = activeSample.name.replace(/\.(wav|mp3|flac|ogg)$/i, '');
                                                                    const extension = activeSample.name.match(/\.(wav|mp3|flac|ogg)$/i)?.[1] || 'wav';
                                                                    const newName = `${originalName}_ADSR.${extension}`;
                                                                    // Placeholder - actual ADSR processing would go here
                                                                    console.log('ADSR processing would be applied:', { adsrMode, attack, decay, sustain, release, gateThreshold, gateRatio, gateAttack, gateRelease });
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold rounded transition-colors shadow-lg shadow-purple-500/20"
                                                >
                                                    Apply ADSR
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === TabView.AI && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-700">
                                            <Lock className="w-6 h-6 text-zinc-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">Feature Locked</h3>
                                        <p className="text-zinc-500 text-sm mb-6 max-w-xs mx-auto">
                                            Upgrade to access AI generation features.
                                        </p>
                                        <button className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-full transition-colors">
                                            Unlock Pro
                                        </button>
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
                            onStartRecording={startRecording}
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
                    title={
                        processingDialog.type === 'crop' ? 'Crop Selection' :
                            processingDialog.type === 'normalize' ? 'Normalize Audio' :
                                processingDialog.type === 'filter' ? 'Apply Multiband Filter' :
                                    processingDialog.type === 'adsr' ? 'Apply ADSR Processing' :
                                        'Process Chops'
                    }
                    description={
                        processingDialog.type === 'crop' ? 'Create a new sample from the selected region' :
                            processingDialog.type === 'normalize' ? 'Normalize audio levels to maximum without clipping' :
                                processingDialog.type === 'filter' ? 'Apply multiband filtering to the sample' :
                                    processingDialog.type === 'adsr' ? 'Apply ADSR envelope shaping to the sample' :
                                        'Create individual samples from chops'
                    }
                    processingType={processingDialog.type}
                    onConfirm={processingDialog.onConfirm}
                    onCancel={() => setProcessingDialog(null)}
                />
            )}
        </div>
    );
}
