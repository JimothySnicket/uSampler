import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAudio } from '../src/context/AudioContext';

interface CompactVUMeterProps {
    isPlaying: boolean;
    isRecording: boolean;
    isArmed: boolean;
    isSourceConnected: boolean;
    gain: number;
    threshold: number;
    onGainChange: (val: number) => void;
    onThresholdChange: (val: number) => void;
}

const toDB = (level: number): number => {
    if (level <= 0.0001) return -Infinity;
    return 20 * Math.log10(level) + 3;
};

const MeterBar: React.FC<{
    level: number;
    peakLevel: number;
    label: string;
    threshold: number;
    onResetPeak: () => void;
}> = ({ level, peakLevel, label, threshold, onResetPeak }) => {
    const dbValue = toDB(level);
    const peakDb = toDB(peakLevel);
    const peakDisplay = peakDb <= -90 ? '-∞' : peakDb.toFixed(1);

    const segments = useMemo(() => {
        const minDb = -30;
        const maxDb = 6;
        const range = maxDb - minDb;
        const count = 32;
        return Array.from({ length: count }).map((_, i) => {
            const percent = i / (count - 1);
            const segDb = minDb + percent * range;
            let color = 'var(--vu-green)';
            if (segDb >= 0) color = 'var(--vu-red)';
            else if (segDb >= -6) color = 'var(--vu-yellow)';
            return { db: segDb, color };
        });
    }, []);

    return (
        <div className="flex flex-col items-center gap-0.5 flex-1 h-full min-w-0">
            <span className="text-[7px] font-mono font-semibold shrink-0" style={{ color: 'var(--text-muted)' }}>
                {label}
            </span>

            <div
                className="relative flex-1 w-3 rounded-sm overflow-hidden flex flex-col-reverse gap-px p-px"
                style={{ background: 'var(--input-bg)' }}
            >
                {/* Peak hold line */}
                {peakDb > -90 && peakDb > dbValue && (
                    <div
                        className="absolute w-full h-[2px] z-10 transition-all duration-300"
                        style={{
                            background: 'var(--vu-yellow)',
                            bottom: `${Math.min(100, Math.max(0, ((peakDb + 3 - (-30)) / 36) * 100))}%`,
                        }}
                    />
                )}

                {/* Threshold indicator */}
                {threshold > 0 && (
                    <div
                        className="absolute w-full h-[1px] z-10"
                        style={{
                            background: 'var(--vu-red)',
                            opacity: 0.5,
                            bottom: `${threshold}%`,
                        }}
                    />
                )}

                {segments.map((seg, i) => {
                    const isActive = dbValue >= seg.db;
                    return (
                        <div
                            key={i}
                            className="w-full flex-1 rounded-[0.5px] transition-opacity duration-[15ms]"
                            style={{
                                background: isActive ? seg.color : 'var(--elevated)',
                                opacity: isActive ? 1 : 0.15,
                            }}
                        />
                    );
                })}
            </div>

            <button
                onClick={onResetPeak}
                className="text-[5px] font-mono shrink-0 cursor-pointer hover:opacity-80"
                style={{ color: peakDb >= 0 ? 'var(--vu-red)' : 'var(--text-secondary)' }}
            >
                {peakDisplay}
            </button>
        </div>
    );
};

const GainFader: React.FC<{
    value: number;
    onChange: (val: number) => void;
}> = ({ value, onChange }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    const dbDisplay = value <= 0.001 ? '-∞' : `${(20 * Math.log10(value)).toFixed(0)}`;

    const handleDrag = useCallback((clientY: number) => {
        const track = trackRef.current;
        if (!track) return;
        const rect = track.getBoundingClientRect();
        const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
        onChange(y);
    }, [onChange]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => { if (dragging.current) handleDrag(e.clientY); };
        const onUp = () => { dragging.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [handleDrag]);

    return (
        <div className="flex flex-col items-center gap-0.5 h-full w-2.5 shrink-0">
            <span className="text-[6px] font-mono shrink-0" style={{ color: 'var(--text-faint)' }}>V</span>
            <div
                ref={trackRef}
                className="relative flex-1 w-[3px] rounded-full cursor-ns-resize"
                style={{ background: 'var(--border-strong)' }}
                onMouseDown={(e) => { dragging.current = true; handleDrag(e.clientY); }}
            >
                {/* Fill from bottom */}
                <div
                    className="absolute bottom-0 w-full rounded-full"
                    style={{
                        height: `${value * 100}%`,
                        background: 'var(--accent-indigo)',
                        opacity: 0.5,
                    }}
                />
                {/* Thumb */}
                <div
                    className="absolute left-1/2 -translate-x-1/2 w-[7px] h-[4px] rounded-sm"
                    style={{
                        bottom: `calc(${value * 100}% - 2px)`,
                        background: 'var(--accent-indigo)',
                    }}
                />
            </div>
            <span className="text-[5px] font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>
                {dbDisplay}
            </span>
        </div>
    );
};

export const CompactVUMeter: React.FC<CompactVUMeterProps> = ({
    isPlaying, isRecording, isArmed, isSourceConnected,
    gain, threshold, onGainChange, onThresholdChange,
}) => {
    const { engine } = useAudio();
    const [leftLevel, setLeftLevel] = useState(0);
    const [rightLevel, setRightLevel] = useState(0);
    const [leftPeak, setLeftPeak] = useState(0);
    const [rightPeak, setRightPeak] = useState(0);
    const animFrameRef = useRef<number>(0);

    // Peak decay
    useEffect(() => {
        const decayInterval = setInterval(() => {
            setLeftPeak(p => p * 0.995);
            setRightPeak(p => p * 0.995);
        }, 50);
        return () => clearInterval(decayInterval);
    }, []);

    // RAF metering loop
    useEffect(() => {
        const update = () => {
            if (engine?.analyserNode) {
                const analyser = engine.analyserNode;
                const dataArray = new Float32Array(analyser.fftSize);
                analyser.getFloatTimeDomainData(dataArray);

                let sumL = 0;
                let sumR = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const val = dataArray[i];
                    sumL += val * val;
                    sumR += val * val;
                }
                const rmsL = Math.sqrt(sumL / dataArray.length);
                const rmsR = Math.sqrt(sumR / dataArray.length);

                setLeftLevel(rmsL);
                setRightLevel(rmsR);
                setLeftPeak(p => Math.max(p, rmsL));
                setRightPeak(p => Math.max(p, rmsR));
            }
            animFrameRef.current = requestAnimationFrame(update);
        };

        if (isPlaying || isRecording || isArmed || isSourceConnected) {
            animFrameRef.current = requestAnimationFrame(update);
        } else {
            setLeftLevel(0);
            setRightLevel(0);
        }

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [engine, isPlaying, isRecording, isArmed, isSourceConnected]);

    const resetPeaks = useCallback(() => {
        setLeftPeak(0);
        setRightPeak(0);
    }, []);

    // Scroll wheel on meter area adjusts threshold
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -2 : 2;
        onThresholdChange(Math.max(0, Math.min(100, threshold + delta)));
    }, [threshold, onThresholdChange]);

    return (
        <div
            className="w-12 shrink-0 flex flex-row gap-0.5 px-0.5 py-1.5"
            style={{
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border-subtle)',
            }}
            onWheel={handleWheel}
            title={`Threshold: ${threshold}% (scroll to adjust)`}
        >
            <MeterBar level={leftLevel} peakLevel={leftPeak} label="L" threshold={threshold} onResetPeak={resetPeaks} />
            <MeterBar level={rightLevel} peakLevel={rightPeak} label="R" threshold={threshold} onResetPeak={resetPeaks} />
            <GainFader value={gain} onChange={onGainChange} />
        </div>
    );
};
