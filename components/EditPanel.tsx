import React, { useState } from 'react';
import { Activity, ArrowLeftRight, TrendingDown, Zap } from 'lucide-react';
import { Button } from './Button';
import { ProcessButton } from './ProcessButton';

interface EditPanelProps {
    onNormalize: () => void;
    onReverse: () => void;
    onDownsample: (targetRate: number) => void;
    onRender: () => void;
    hasPendingChanges: boolean;
    isRendering: boolean;
    children: React.ReactNode;
}

const DOWNSAMPLE_RATES = [
    { value: 22050, label: '22k' },
    { value: 16000, label: '16k' },
    { value: 11025, label: '11k' },
    { value: 8000, label: '8k' },
];

export const EditPanel: React.FC<EditPanelProps> = ({
    onNormalize, onReverse, onDownsample,
    onRender, hasPendingChanges, isRendering,
    children,
}) => {
    const [downsampleRate, setDownsampleRate] = useState(22050);

    return (
        <div
            className="h-9 shrink-0 flex items-center px-2"
            style={{
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            {/* Segment 1 + 2: EQ and Stretch (passed as children) */}
            <div className="flex items-center gap-3">
                {children}
            </div>

            <div className="w-px h-5 mx-2 shrink-0" style={{ background: 'var(--border)' }} />

            {/* Segment 3: Process (Norm/Rev/Down) */}
            <div className="flex items-center gap-1">
                <ProcessButton label="Norm" icon={<Activity />} onClick={onNormalize} />
                <ProcessButton label="Rev" icon={<ArrowLeftRight />} onClick={onReverse} />
                <div className="flex items-center gap-0.5">
                    <ProcessButton label="Down" icon={<TrendingDown />} onClick={() => onDownsample(downsampleRate)} />
                    <select
                        value={downsampleRate}
                        onChange={(e) => setDownsampleRate(Number(e.target.value))}
                        className="text-[7px] font-mono rounded px-1 py-0.5 cursor-pointer focus:outline-none"
                        style={{
                            background: 'var(--elevated)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        {DOWNSAMPLE_RATES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="w-px h-5 mx-2 shrink-0" style={{ background: 'var(--border)' }} />

            {/* Segment 4: Render (pushed right) */}
            <div className="flex items-center ml-auto">
                <Button
                    size="xs"
                    icon={<Zap />}
                    onClick={onRender}
                    disabled={!hasPendingChanges || isRendering}
                    style={{ background: 'var(--accent)', color: 'var(--text-primary)', border: 'none' }}
                >
                    {isRendering ? 'Rendering...' : 'Render'}
                </Button>
            </div>
        </div>
    );
};
