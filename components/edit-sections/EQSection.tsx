import React from 'react';
import { EQKnob } from '../EQKnob';

interface EQSectionProps {
    eqEnabled: boolean;
    setEqEnabled: (v: boolean) => void;
    lowGain: number;
    setLowGain: (v: number) => void;
    midGain: number;
    setMidGain: (v: number) => void;
    highGain: number;
    setHighGain: (v: number) => void;
    onReset: () => void;
}

export const EQSection: React.FC<EQSectionProps> = ({
    eqEnabled, setEqEnabled,
    lowGain, setLowGain,
    midGain, setMidGain,
    highGain, setHighGain,
    onReset,
}) => {
    const hasChanges = eqEnabled && (lowGain !== 0 || midGain !== 0 || highGain !== 0);

    return (
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
                <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: hasChanges ? 'var(--vu-green)' : 'var(--text-muted)' }}
                />
                <span className="text-[8px] font-bold tracking-wide shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    EQ
                </span>
                <button
                    onClick={() => setEqEnabled(!eqEnabled)}
                    className="px-1.5 py-0.5 text-[7px] font-bold rounded cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                    style={{
                        background: eqEnabled ? 'var(--vu-green)' : 'var(--elevated)',
                        color: eqEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                >
                    {eqEnabled ? 'ON' : 'OFF'}
                </button>
            </div>
            <div className="flex items-center gap-2">
                <EQKnob label="Lo" size="sm" value={lowGain} min={-12} max={12} color="var(--eq-low)" onChange={setLowGain} />
                <EQKnob label="Mid" size="sm" value={midGain} min={-12} max={12} color="var(--eq-mid)" onChange={setMidGain} />
                <EQKnob label="Hi" size="sm" value={highGain} min={-12} max={12} color="var(--eq-high)" onChange={setHighGain} />
            </div>
            <button
                onClick={onReset}
                className="text-[7px] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                style={{ background: 'var(--elevated)', color: 'var(--text-muted)' }}
            >
                Reset
            </button>
        </div>
    );
};
