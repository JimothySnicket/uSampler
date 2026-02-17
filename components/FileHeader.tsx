import React from 'react';
import type { Sample } from '../types';

interface FileHeaderProps {
    sample: Sample | null;
}

export const FileHeader: React.FC<FileHeaderProps> = ({ sample }) => {
    if (!sample) {
        return (
            <div
                className="h-[22px] shrink-0 flex items-center px-2.5"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
                <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>
                    No sample selected
                </span>
            </div>
        );
    }

    const buffer = sample.buffer;
    const sampleRate = buffer ? `${(buffer.sampleRate / 1000).toFixed(0)}kHz` : null;
    const channels = buffer ? (buffer.numberOfChannels === 1 ? 'Mono' : 'Stereo') : null;
    const size = sample.size || null;

    return (
        <div
            className="h-[22px] shrink-0 flex items-center justify-between px-2.5"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
            <span className="text-[10px] font-medium truncate min-w-0" style={{ color: 'var(--text-primary)' }}>
                {sample.name}
            </span>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {sampleRate && <span className="text-[8px] font-mono" style={{ color: 'var(--text-faint)' }}>{sampleRate}</span>}
                {channels && <span className="text-[8px] font-mono" style={{ color: 'var(--text-faint)' }}>{channels}</span>}
                {size && <span className="text-[8px] font-mono" style={{ color: 'var(--text-faint)' }}>{size}</span>}
            </div>
        </div>
    );
};
