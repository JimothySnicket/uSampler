import React from 'react';
import type { Sample } from '../../types';

interface StretchSectionProps {
    activeSample: Sample | null;
    timeStretchEnabled: boolean;
    setTimeStretchEnabled: (v: boolean) => void;
    timeStretchRatio: number;
    setTimeStretchRatio: (v: number) => void;
    timeStretchProgress: number;
    applyTimeStretch: (withCrop: boolean) => Promise<void>;
}

export const StretchSection: React.FC<StretchSectionProps> = ({
    activeSample, timeStretchEnabled, setTimeStretchEnabled,
    timeStretchRatio, setTimeStretchRatio,
    timeStretchProgress, applyTimeStretch,
}) => {
    if (!activeSample) return null;

    const presets = [0.5, 0.75, 1.0, 1.5, 2.0];
    const isStretching = activeSample.isTimeStretching;

    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
                <span className="text-[8px] font-bold tracking-wide shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    Stretch
                </span>
                <button
                    onClick={() => setTimeStretchEnabled(!timeStretchEnabled)}
                    className="px-1.5 py-0.5 text-[7px] font-bold rounded cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                    style={{
                        background: timeStretchEnabled ? 'var(--vu-green)' : 'var(--elevated)',
                        color: timeStretchEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                >
                    {timeStretchEnabled ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Ratio slider */}
            <input
                type="range"
                min="0.25"
                max="4.0"
                step="0.01"
                value={timeStretchRatio}
                onChange={(e) => setTimeStretchRatio(parseFloat(e.target.value))}
                className="w-16 h-1 rounded appearance-none cursor-pointer shrink-0"
                style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((timeStretchRatio - 0.25) / 3.75) * 100}%, var(--input-bg) ${((timeStretchRatio - 0.25) / 3.75) * 100}%, var(--input-bg) 100%)`,
                    accentColor: 'var(--accent)',
                }}
            />
            <span className="text-[8px] font-mono font-bold shrink-0 w-7 text-right" style={{ color: 'var(--accent)' }}>
                {timeStretchRatio.toFixed(2)}x
            </span>

            {/* Presets */}
            <div className="flex gap-0.5 shrink-0">
                {presets.map(p => (
                    <button
                        key={p}
                        onClick={() => setTimeStretchRatio(p)}
                        className="px-1 py-0.5 rounded text-[6px] font-mono cursor-pointer hover:opacity-80"
                        style={{
                            background: timeStretchRatio === p ? 'var(--accent)' : 'var(--elevated)',
                            color: timeStretchRatio === p ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                    >
                        {p}x
                    </button>
                ))}
            </div>

            {/* Apply */}
            <button
                onClick={() => applyTimeStretch(false)}
                disabled={isStretching || !activeSample.buffer}
                className="px-2 py-0.5 text-[7px] font-bold rounded cursor-pointer hover:opacity-80 transition-opacity shrink-0 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--text-primary)' }}
            >
                {isStretching ? `${Math.round(timeStretchProgress * 100)}%` : 'Apply'}
            </button>
        </div>
    );
};
