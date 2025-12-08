import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAudio } from '../src/context/AudioContext';

interface UnifiedControlProps {
    isPlaying: boolean;
    isRecording: boolean;
    isArmed: boolean;
    gain: number;
    threshold: number;
    onGainChange: (val: number) => void;
    onThresholdChange: (val: number) => void;
    onStartRecording?: () => void;
    isSourceConnected: boolean;
}

// Helper function for className merging
const cn = (...classes: (string | undefined | null | false)[]): string => {
    return classes.filter(Boolean).join(' ');
};

// VU Meter Component (from design)
interface VUMeterProps {
    level: number; // 0 to 1 linear amplitude
    peakLevel: number; // Peak hold level
    channel: 'Left' | 'Right';
    className?: string;
    onResetPeak?: () => void;
}

const VUMeter: React.FC<VUMeterProps> = ({ level, peakLevel, channel, className, onResetPeak }) => {
    const dbValue = useMemo(() => {
        if (level <= 0.0001) return -Infinity;
        return 20 * Math.log10(level) + 3;
    }, [level]);

    const peakDbValue = useMemo(() => {
        if (peakLevel <= 0.0001) return -Infinity;
        return 20 * Math.log10(peakLevel);
    }, [peakLevel]);

    const segments = useMemo(() => {
        const minDb = -30;
        const maxDb = 6;
        const range = maxDb - minDb;
        const segmentCount = 40;

        return Array.from({ length: segmentCount }).map((_, i) => {
            const percent = i / (segmentCount - 1);
            const segDb = minDb + (percent * range);

            let colorClass = "bg-[#22c55e]"; // Standard Green
            let glowClass = "shadow-[0_0_4px_#22c55e]";

            if (segDb >= 0) {
                colorClass = "bg-[#ef4444]"; // Red
                glowClass = "shadow-[0_0_8px_#ef4444]";
            } else if (segDb >= -6) {
                colorClass = "bg-[#fab005]"; // Yellow/Amber
                glowClass = "shadow-[0_0_6px_#fab005]";
            }

            return {
                db: segDb,
                colorClass,
                glowClass
            };
        });
    }, []);

    const peakDisplayValue = peakDbValue <= -90 ? '-∞' : peakDbValue.toFixed(1);

    return (
        <div className={cn("flex flex-col items-center gap-2 w-full h-full", className)}>

            {/* Meter Housing - Dark Industrial */}
            <div className="relative w-full flex-1 bg-zinc-900 rounded border border-zinc-700 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] p-[2px] flex flex-row">

                {/* Scale Markers (Left) */}
                <div className="flex flex-col justify-between py-1 pr-1 text-[9px] font-bold text-zinc-500 font-mono text-right w-[16px] select-none leading-none z-10">
                    <span className="text-red-500">+6</span>
                    <span className="text-yellow-500">0</span>
                    <span>-6</span>
                    <span>-12</span>
                    <span>-24</span>
                </div>

                {/* LED Column */}
                <div className="relative flex-1 bg-black rounded-[1px] overflow-hidden flex flex-col-reverse gap-[1px] px-[1px] py-[1px]">

                    {/* Glass Reflection Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none z-20"></div>

                    {/* Peak Hold Line */}
                    {peakDbValue !== -Infinity && peakDbValue > dbValue && (
                        <div
                            className="absolute w-full h-[2px] bg-yellow-400 z-30 shadow-[0_0_4px_#facc15] transition-all duration-300 ease-out"
                            style={{ bottom: `${Math.min(100, Math.max(0, ((peakDbValue + 3 - (-30)) / (6 - (-30))) * 100))}%` }}
                        />
                    )}

                    {/* Segments */}
                    {segments.map((seg, i) => {
                        const isActive = dbValue >= seg.db;
                        return (
                            <div
                                key={i}
                                className={`w-full flex-1 rounded-[0.5px] transition-opacity duration-[15ms] ${isActive ? `${seg.colorClass} ${seg.glowClass} opacity-100` : 'bg-zinc-800 opacity-20'}`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Digital Readout - Large, Clickable */}
            <div
                onClick={onResetPeak}
                className="w-full bg-[#111] border border-zinc-700 rounded p-1 cursor-pointer hover:bg-zinc-800 hover:border-zinc-500 transition-all group active:scale-95"
                title="Click to Reset Peak"
            >
                <div className={`text-center font-mono font-bold text-lg leading-none tracking-tighter ${peakDbValue >= 0 ? 'text-red-500 animate-pulse' : 'text-[#4ade80]'}`}>
                    {peakDisplayValue}
                </div>
                <div className="text-[9px] text-zinc-500 text-center font-bold uppercase tracking-widest mt-0.5 group-hover:text-zinc-400">
                    {channel}
                </div>
            </div>
        </div>
    );
};

// Volume Paddle Component (from design)
interface VolumePaddleProps {
    volume: number; // 0 to 1
    onChange: (val: number) => void;
    className?: string;
    label?: string;
    color?: 'orange' | 'indigo';
}

const VolumePaddle: React.FC<VolumePaddleProps> = ({ volume, onChange, className, label = "Main", color = 'indigo' }) => {
    const colorClasses = color === 'orange'
        ? { track: 'bg-orange-500/20', fill: 'from-orange-600 to-orange-400', handle: 'bg-orange-500 border-orange-400', text: 'text-orange-400' }
        : { track: 'bg-indigo-500/20', fill: 'from-indigo-600 to-indigo-400', handle: 'bg-indigo-500 border-indigo-400', text: 'text-indigo-400' };

    return (
        <div className={cn("flex flex-col items-stretch w-full h-full", className)}>
            {/* Functional Control Container - Fixed structure, overlays positioned absolutely */}
            <div
                className="relative bg-[#111] w-full rounded-md border border-[#222] shadow-[inset_0_2px_10px_rgba(0,0,0,1)] flex justify-center touch-none select-none flex-1 min-h-0"
            >
                {/* Track Line */}
                <div className="absolute top-2 bottom-2 w-[10%] min-w-[4px] bg-black rounded-full shadow-[inset_0_0_5px_rgba(0,0,0,1)] z-0"></div>

                {/* Ticks */}
                <div className="absolute top-0 bottom-0 w-full pointer-events-none h-full opacity-60">
                    {[...Array(11)].map((_, i) => (
                        <React.Fragment key={i}>
                            <div
                                className="absolute w-[15%] h-px bg-neutral-500 left-1"
                                style={{ top: `${10 + i * 8}%`, opacity: (i % 5 === 0) ? 1 : 0.5 }}
                            />
                            <div
                                className="absolute w-[15%] h-px bg-neutral-500 right-1"
                                style={{ top: `${10 + i * 8}%`, opacity: (i % 5 === 0) ? 1 : 0.5 }}
                            />
                        </React.Fragment>
                    ))}
                </div>

                {/* Interaction Overlay */}
                <div
                    className="absolute inset-0 z-30 cursor-ns-resize"
                    onPointerMove={(e) => {
                        if (e.buttons !== 1) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                        const val = 1 - (y / rect.height);
                        onChange(Math.max(0, Math.min(1, val)));
                    }}
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                        const val = 1 - (y / rect.height);
                        onChange(Math.max(0, Math.min(1, val)));
                    }}
                    onPointerUp={(e) => {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                ></div>

                {/* Visual Paddle Handle */}
                <div
                    className="absolute w-[80%] max-w-[48px] h-[25%] max-h-[60px] z-10 pointer-events-none transition-none left-1/2"
                    style={{
                        top: `${(1 - volume) * 100}%`,
                        transform: `translate(-50%, -50%)`,
                    }}
                >
                    {/* Inner Render */}
                    <div className="w-full h-full bg-gradient-to-b from-[#333] to-[#1a1a1a] rounded-sm border-t border-white/10 border-b border-black shadow-[0_4px_10px_rgba(0,0,0,0.8)] relative flex flex-col items-center justify-center gap-1">
                        {/* Grip */}
                        <div className="w-[60%] h-0.5 bg-black/60 border-b border-white/5"></div>
                        <div className="w-[60%] h-0.5 bg-black/60 border-b border-white/5"></div>
                        <div className="w-[60%] h-0.5 bg-black/60 border-b border-white/5"></div>

                        {/* Center Line */}
                        <div className="absolute w-full h-[1px] bg-white/50 top-1/2 -translate-y-1/2"></div>
                    </div>
                </div>
            </div>

            <div className={cn("text-[8px] sm:text-[9px] text-neutral-500 font-bold tracking-widest uppercase mt-2 bg-black/40 px-2 py-1 rounded border border-white/5 whitespace-nowrap select-none", colorClasses.text)}>
                {label}
            </div>
        </div>
    );
};

export const UnifiedControl: React.FC<UnifiedControlProps> = ({
    isPlaying,
    isRecording,
    isArmed,
    gain,
    threshold,
    onGainChange,
    onThresholdChange,
    onStartRecording,
    isSourceConnected
}) => {
    const { engine } = useAudio();
    const rafRef = useRef<number>();
    const [meter, setMeter] = useState({ l: 0, r: 0, peakL: 0, peakR: 0 });
    const [localGain, setLocalGain] = useState(gain / 100);
    const [localThreshold, setLocalThreshold] = useState(threshold / 100);


    // Sync props to local state
    useEffect(() => {
        setLocalGain(gain / 100);
    }, [gain]);

    useEffect(() => {
        setLocalThreshold(threshold / 100);
    }, [threshold]);



    // Metering Loop - Show input when armed/monitoring, output when playing
    useEffect(() => {
        const updateMeter = () => {
            if (!engine) return;

            let l = 0;
            let r = 0;

            if (typeof engine.getStereoLevels === 'function') {
                const levels = engine.getStereoLevels();
                l = levels.left;
                r = levels.right;
            }

            setMeter(prev => {
                // Attack/Release smoothing
                const attack = 0.3;
                const release = 0.05;

                let newL = l > prev.l ? prev.l + (l - prev.l) * attack : prev.l + (l - prev.l) * release;
                let newR = r > prev.r ? prev.r + (r - prev.r) * attack : prev.r + (r - prev.r) * release;

                // Clamp
                newL = Math.max(0, Math.min(1, newL));
                newR = Math.max(0, Math.min(1, newR));

                return {
                    l: newL,
                    r: newR,
                    peakL: Math.max(prev.peakL, l),
                    peakR: Math.max(prev.peakR, r)
                };
            });

            rafRef.current = requestAnimationFrame(updateMeter);
        };

        // Show meters when: playing, recording, armed, or when source is connected
        const shouldShowMeters = isPlaying || isRecording || isArmed || isSourceConnected || (engine?.sourceNode !== null);

        if (shouldShowMeters && engine?.context?.state === 'running') {
            rafRef.current = requestAnimationFrame(updateMeter);
        } else {
            setMeter(prev => ({ ...prev, l: 0, r: 0 }));
        }

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [engine, isPlaying, isRecording, isArmed, isSourceConnected]);

    // Auto-record on threshold exceeded when armed
    useEffect(() => {
        if (!engine || !isArmed || isRecording) return;

        const checkAutoRecord = () => {
            if (!engine.isMonitoringThreshold) return;

            const levels = engine.getStereoLevels();
            const maxLevel = Math.max(levels.left, levels.right);
            const thresholdLevel = threshold / 100;

            // Auto-start recording when threshold exceeded
            if (maxLevel > thresholdLevel && onStartRecording) {
                onStartRecording();
            }
        };

        const interval = setInterval(checkAutoRecord, 50); // Check every 50ms
        return () => clearInterval(interval);
    }, [engine, isArmed, isRecording, threshold, onStartRecording]);

    const handleVolumeChange = (val: number) => {
        setLocalGain(val);
        const gainPercent = Math.round(val * 100);
        onGainChange(gainPercent);
        if (engine && typeof engine.setVolume === 'function') {
            engine.setVolume(val);
        }
    };

    const resetPeakL = () => {
        setMeter(prev => ({ ...prev, peakL: prev.l }));
    };

    const resetPeakR = () => {
        setMeter(prev => ({ ...prev, peakR: prev.r }));
    };

    const handleThresholdChange = (val: number) => {
        setLocalThreshold(val);
        const thresholdPercent = Math.round(val * 100);
        onThresholdChange(thresholdPercent);
        if (engine) {
            engine.threshold = thresholdPercent;
        }
    };

    return (
        <div className="flex flex-col w-full h-full bg-zinc-950 p-2 gap-2 select-none overflow-hidden">
            {/* Main Meter Section - Full height layout with padding */}
            {/* Main Meter Section - Grid Layout for stability */}
            <div className="grid grid-cols-[1fr_1fr_40px] gap-2 flex-1 min-h-0 w-full max-w-[400px] mx-auto px-2">

                {/* Left Meter */}
                <div className="min-w-0 h-full">
                    <VUMeter
                        level={meter.l}
                        peakLevel={meter.peakL}
                        channel="Left"
                        className="w-full h-full"
                        onResetPeak={resetPeakL}
                    />
                </div>

                {/* Right Meter */}
                <div className="min-w-0 h-full">
                    <VUMeter
                        level={meter.r}
                        peakLevel={meter.peakR}
                        channel="Right"
                        className="w-full h-full"
                        onResetPeak={resetPeakR}
                    />
                </div>

                {/* Output Volume Paddle */}
                <div className="flex flex-col items-center gap-1 h-full min-w-0">
                    <div className="text-[7px] text-indigo-500 uppercase font-bold tracking-tight h-[16px] flex items-center shrink-0 leading-tight text-center">
                        {isPlaying ? 'GAIN' : 'OUT'}
                    </div>
                    <div className="flex-1 w-full min-h-0">
                        <VolumePaddle
                            volume={localGain}
                            onChange={handleVolumeChange}
                            label=""
                            color="indigo"
                            className="w-full h-full"
                        />
                    </div>
                    <div className="text-[8px] font-mono font-bold text-indigo-400 h-[16px] flex items-center shrink-0 leading-tight">
                        {Math.round(localGain * 100)}%
                    </div>
                </div>
            </div>
        </div>
    );
};
