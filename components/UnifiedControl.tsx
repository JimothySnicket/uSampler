import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
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
    threshold?: number; // 0 to 1 linear amplitude - threshold level to display
    showThreshold?: boolean; // Whether to show threshold line
}

const VUMeter: React.FC<VUMeterProps> = ({ level, peakLevel, channel, className, onResetPeak, threshold, showThreshold }) => {
    const dbValue = useMemo(() => {
        if (level <= 0.0001) return -Infinity;
        return 20 * Math.log10(level) + 3;
    }, [level]);

    const peakDbValue = useMemo(() => {
        if (peakLevel <= 0.0001) return -Infinity;
        return 20 * Math.log10(peakLevel);
    }, [peakLevel]);

    // Convert threshold (0-1 linear amplitude) to dB and then to position percentage
    const thresholdDbValue = useMemo(() => {
        if (!threshold || threshold <= 0.0001) return -Infinity;
        return 20 * Math.log10(threshold) + 3;
    }, [threshold]);

    // Calculate threshold line position (bottom percentage, matching meter segments)
    const thresholdPositionPercent = useMemo(() => {
        if (thresholdDbValue === -Infinity) return null;
        const minDb = -30;
        const maxDb = 6;
        const position = ((thresholdDbValue - minDb) / (maxDb - minDb)) * 100;
        return Math.min(100, Math.max(0, position));
    }, [thresholdDbValue]);

    const segments = useMemo(() => {
        const minDb = -30;
        const maxDb = 6;
        const range = maxDb - minDb;
        const segmentCount = 40;

        return Array.from({ length: segmentCount }).map((_, i) => {
            const percent = i / (segmentCount - 1);
            const segDb = minDb + (percent * range);

            let color = 'var(--vu-green-bright)';
            let glow = '0 0 4px var(--vu-green-bright)';

            if (segDb >= 0) {
                color = 'var(--vu-red-bright)';
                glow = '0 0 8px var(--vu-red-bright)';
            } else if (segDb >= -6) {
                color = 'var(--vu-yellow-bright)';
                glow = '0 0 6px var(--vu-yellow-bright)';
            }

            return {
                db: segDb,
                color,
                glow
            };
        });
    }, []);

    const peakDisplayValue = peakDbValue <= -90 ? '-∞' : peakDbValue.toFixed(1);

    return (
        <div className={cn("flex flex-col items-center gap-2 w-full h-full", className)}>

            {/* Meter Housing - Dark Industrial */}
            <div className="meter-housing relative w-full flex-1 rounded shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] p-[2px] flex flex-row" style={{ background: 'var(--overlay)', border: '1px solid var(--border-strong)' }}>

                {/* Scale Markers (Left) */}
                <div className="flex flex-col justify-between py-1 pr-1 text-[9px] font-bold font-mono text-right w-[16px] select-none leading-none z-10" style={{ color: 'var(--text-faint)' }}>
                    <span style={{ color: 'var(--danger)' }}>+6</span>
                    <span style={{ color: 'var(--warning)' }}>0</span>
                    <span>-6</span>
                    <span>-12</span>
                    <span>-24</span>
                </div>

                {/* LED Column */}
                <div className="relative flex-1 rounded-[1px] overflow-hidden flex flex-col-reverse gap-[1px] px-[1px] py-[1px]" style={{ background: 'var(--deep)' }}>

                    {/* Glass Reflection Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none z-20"></div>

                    {/* Peak Hold Line */}
                    {peakDbValue !== -Infinity && peakDbValue > dbValue && (
                        <div
                            className="absolute w-full h-[2px] z-30 transition-all duration-300 ease-out"
                            style={{ bottom: `${Math.min(100, Math.max(0, ((peakDbValue + 3 - (-30)) / (6 - (-30))) * 100))}%`, background: 'var(--warning)', boxShadow: '0 0 4px var(--warning)' }}
                        />
                    )}

                    {/* Threshold Line - Only show on left meter when armed */}
                    {showThreshold && thresholdPositionPercent !== null && (
                        <div
                            className="absolute w-full h-[2px] z-35 transition-all duration-150 ease-out"
                            style={{ bottom: `${thresholdPositionPercent}%`, background: 'color-mix(in srgb, var(--warning) 90%, transparent)', boxShadow: '0 0 6px color-mix(in srgb, var(--warning) 80%, transparent)', borderTop: '1px solid color-mix(in srgb, var(--warning) 50%, transparent)' }}
                        />
                    )}

                    {/* Segments */}
                    {segments.map((seg, i) => {
                        const isActive = dbValue >= seg.db;
                        return (
                            <div
                                key={i}
                                className="w-full flex-1 rounded-[0.5px] transition-opacity duration-[15ms]"
                                style={isActive
                                    ? { background: seg.color, boxShadow: seg.glow, opacity: 1 }
                                    : { background: 'var(--overlay-hover)', opacity: 0.2 }
                                }
                            />
                        );
                    })}
                </div>
            </div>

            {/* Digital Readout - Large, Clickable */}
            <div
                onClick={onResetPeak}
                className="w-full rounded p-1 cursor-pointer transition-all group active:scale-95 hover:opacity-80"
                style={{ background: 'var(--inset)', border: '1px solid var(--border-strong)' }}
                title="Click to Reset Peak"
            >
                <div className={`text-center font-mono font-bold text-lg leading-none tracking-tighter ${peakDbValue >= 0 ? 'animate-pulse' : ''}`}
                    style={{ color: peakDbValue >= 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {peakDisplayValue}
                </div>
                <div className="text-[9px] text-center font-bold uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {channel}
                </div>
            </div>
        </div>
    );
};

// Threshold Control Component
interface ThresholdControlProps {
    threshold: number; // 0 to 1 linear amplitude
    onChange: (val: number) => void;
    className?: string;
    meterHeight: number; // Height of the meter in pixels for positioning
}

const ThresholdControl: React.FC<ThresholdControlProps> = ({ threshold, onChange, className, meterHeight }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Convert threshold (0-1 linear amplitude) to dB using same formula as VU meter
    const thresholdDbValue = useMemo(() => {
        if (!threshold || threshold <= 0.0001) return -Infinity;
        return 20 * Math.log10(threshold) + 3;
    }, [threshold]);

    // Calculate position percentage using same scale as VU meter (-30dB to +6dB)
    // positionPercent represents bottom percentage: 0% = bottom (lowest dB), 100% = top (highest dB)
    const positionPercent = useMemo(() => {
        if (thresholdDbValue === -Infinity) return 0; // Bottom if no threshold
        const minDb = -30;
        const maxDb = 6;
        const position = ((thresholdDbValue - minDb) / (maxDb - minDb)) * 100;
        return Math.min(100, Math.max(0, position));
    }, [thresholdDbValue]);

    // Calculate the actual pixel position relative to the meter housing
    const calculateChevronPosition = (): number => {
        if (!containerRef.current) return 0;

        // Find the actual meter housing element using the new class
        const container = containerRef.current;
        // Search in parent for the meter housing
        const meterHousing = container.parentElement?.querySelector('.meter-housing') as HTMLElement;

        if (!meterHousing) return 0;

        const containerRect = container.getBoundingClientRect();
        const housingRect = meterHousing.getBoundingClientRect();

        // Calculate geometric relationships
        const containerHeight = containerRect.height;

        // Distance from top of container to bottom of meter housing
        const housingBottomRelativeToContainer = housingRect.bottom - containerRect.top;

        // Space below the meter housing (distance from container bottom to housing bottom)
        const spaceBelowHousing = containerHeight - housingBottomRelativeToContainer;

        // Calculate offset based on threshold percentage (0% = bottom of meter, 100% = top of meter)
        const housingHeight = housingRect.height;
        const visualOffset = (positionPercent / 100) * housingHeight;

        // Final bottom position: Start from bottom of housing (spaceBelowHousing) and add visual offset up
        return spaceBelowHousing + visualOffset;
    };

    const [chevronBottom, setChevronBottom] = useState<number>(() => {
        // Initialize with calculated position if possible
        return 0; // Will be updated in useLayoutEffect
    });

    // Use useLayoutEffect to calculate position synchronously before paint
    useLayoutEffect(() => {
        const position = calculateChevronPosition();
        setChevronBottom(position);
    }, [positionPercent, threshold]);

    // Add resize observer to recalculate on layout changes
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => {
            const position = calculateChevronPosition();
            setChevronBottom(position);
        });

        // Observe the container and its parent for size changes
        resizeObserver.observe(containerRef.current);
        if (containerRef.current.parentElement) {
            resizeObserver.observe(containerRef.current.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [positionPercent, threshold]);

    // Convert vertical position to threshold value (matching VU meter dB scale)
    // Fixed: drag down (y increases) should decrease threshold, drag up (y decreases) should increase threshold
    const positionToThreshold = (y: number, height: number): number => {
        if (!containerRef.current) {
            // Fallback: use container height
            const bottomPercent = (1 - (y / height)) * 100;
            const minDb = -30;
            const maxDb = 6;
            const dbValue = minDb + (bottomPercent / 100) * (maxDb - minDb);
            const amplitude = Math.pow(10, (dbValue - 3) / 20);
            return Math.max(0, Math.min(1, amplitude));
        }

        // Find meter housing to calculate relative position
        const container = containerRef.current;
        const meterHousing = container.parentElement?.querySelector('.meter-housing') as HTMLElement;

        if (!meterHousing) {
            // Fallback
            const bottomPercent = (1 - (y / height)) * 100;
            const minDb = -30;
            const maxDb = 6;
            const dbValue = minDb + (bottomPercent / 100) * (maxDb - minDb);
            const amplitude = Math.pow(10, (dbValue - 3) / 20);
            return Math.max(0, Math.min(1, amplitude));
        }

        // Calculate relative to meter housing
        const containerRect = container.getBoundingClientRect();
        const meterHousingRect = meterHousing.getBoundingClientRect();
        const meterHousingTop = meterHousingRect.top - containerRect.top;
        const meterHousingHeight = meterHousingRect.height;

        // Convert y (relative to container) to position relative to meter housing
        // y=0 is top of container, y=height is bottom of container
        // We need: dragging down (y increases) -> threshold decreases -> bottomPercent decreases
        let relativeY = y - meterHousingTop;

        // Clamp relativeY to meter housing bounds
        relativeY = Math.max(0, Math.min(meterHousingHeight, relativeY));

        // Calculate bottomPercent: 100% at top (relativeY=0), 0% at bottom (relativeY=meterHousingHeight)
        const bottomPercent = (1 - (relativeY / meterHousingHeight)) * 100;

        const minDb = -30;
        const maxDb = 6;
        const dbValue = minDb + (bottomPercent / 100) * (maxDb - minDb);
        const amplitude = Math.pow(10, (dbValue - 3) / 20);
        return Math.max(0, Math.min(1, amplitude));
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (e.buttons !== 1 || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const val = positionToThreshold(y, rect.height);
        onChange(val);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!containerRef.current) return;
        containerRef.current.setPointerCapture(e.pointerId);
        const rect = containerRef.current.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const val = positionToThreshold(y, rect.height);
        onChange(val);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (containerRef.current) {
            containerRef.current.releasePointerCapture(e.pointerId);
        }
    };

    return (
        <div
            ref={containerRef}
            className={cn("absolute inset-0 z-40 cursor-ns-resize", className)}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ pointerEvents: 'auto' }}
        >
            {/* Full-height draggable area - covers entire meter for easy interaction */}
            <div className="absolute inset-0 pointer-events-auto" />

            {/* Threshold control indicator - positioned on left side, aligned with threshold line */}
            <div
                className="absolute left-0 w-4 h-4 flex items-center justify-center z-50 pointer-events-auto cursor-ns-resize"
                style={{
                    bottom: `${chevronBottom}px`,
                    transform: 'translate(-100%, 50%)'
                }}
            >
                {/* Connecting line to meter */}
                <div
                    className="absolute right-0 top-1/2 w-[10px] h-[1px]"
                    style={{ transform: 'translateY(-50%)', background: 'color-mix(in srgb, var(--warning) 90%, transparent)' }}
                />

                {/* Small chevron indicator */}
                <div className="relative w-3 h-3 flex items-center justify-center">
                    {/* Background for visibility */}
                    <div className="absolute inset-0 rounded-sm" style={{ background: 'rgba(0,0,0,0.9)' }} />
                    <div className="absolute inset-0 rounded-sm" style={{ background: 'color-mix(in srgb, var(--warning) 30%, transparent)' }} />

                    {/* Chevron pointing right toward meter */}
                    <div className="relative text-[10px] font-black font-mono leading-none" style={{ color: 'var(--warning)', filter: 'drop-shadow(0 0 4px var(--warning))' }}>
                        &gt;
                    </div>
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
    const colorStyles = color === 'orange'
        ? { text: 'var(--accent)' }
        : { text: 'var(--accent-indigo)' };

    return (
        <div className={cn("flex flex-col items-stretch w-full h-full", className)}>
            {/* Functional Control Container - Fixed structure, overlays positioned absolutely */}
            <div
                className="relative w-full rounded-md shadow-[inset_0_2px_10px_rgba(0,0,0,1)] flex justify-center touch-none select-none flex-1 min-h-0"
                style={{ background: 'var(--inset)', border: '1px solid var(--overlay)' }}
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

            <div className="text-[8px] sm:text-[9px] font-bold tracking-widest uppercase mt-2 bg-black/40 px-2 py-1 rounded border border-white/5 whitespace-nowrap select-none"
                style={{ color: colorStyles.text }}>
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
        <div className="flex flex-col w-full h-full p-2 gap-2 select-none overflow-hidden" style={{ background: 'var(--deep)' }}>
            {/* Main Meter Section - Full height layout with padding */}
            {/* Main Meter Section - Grid Layout for stability */}
            <div className="grid grid-cols-[1fr_1fr_40px] gap-2 flex-1 min-h-0 w-full max-w-[400px] mx-auto px-2 overflow-visible">

                {/* Left Meter with Threshold Control */}
                <div className="min-w-0 h-full relative overflow-visible">
                    <VUMeter
                        level={meter.l}
                        peakLevel={meter.peakL}
                        channel="Left"
                        className="w-full h-full"
                        onResetPeak={resetPeakL}
                        threshold={isArmed ? localThreshold : undefined}
                        showThreshold={isArmed}
                    />
                    {/* Threshold Control Overlay - Only visible when armed, positioned as absolute overlay */}
                    {isArmed && (
                        <ThresholdControl
                            threshold={localThreshold}
                            onChange={handleThresholdChange}
                            meterHeight={0} // Not needed, using percentage positioning
                            className="pointer-events-auto"
                        />
                    )}
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
                    <div className="text-[7px] uppercase font-bold tracking-tight h-[16px] flex items-center shrink-0 leading-tight text-center" style={{ color: 'var(--accent-indigo)' }}>
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
                    <div className="text-[8px] font-mono font-bold h-[16px] flex items-center shrink-0 leading-tight" style={{ color: 'var(--accent-indigo)' }}>
                        {Math.round(localGain * 100)}%
                    </div>
                </div>
            </div>
        </div>
    );
};
