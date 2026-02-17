import React, { useState, useEffect } from 'react';
import { X, Download, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { Sample } from '../types';
import { useAudio } from '../src/context/AudioContext';

export type ExportFormat = 'wav' | 'mp3';
export type ExportSampleRate = 'original' | 22050 | 44100 | 48000 | 88200 | 96000;
export type WavBitDepth = 16 | 24 | 32;
export type MP3Bitrate = 128 | 192 | 256 | 320;

interface ExportDialogProps {
    isOpen: boolean;
    mode: 'save-selected' | 'export-all';
    samples: Sample[];
    selectedSampleIds?: Set<string>;
    activeSampleId?: string | null;
    onClose: () => void;
    onConfirm: (options: {
        format: ExportFormat;
        sampleRate: ExportSampleRate;
        bitDepth?: WavBitDepth;
        bitrate?: MP3Bitrate;
        exportAsZip?: boolean;
    }) => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
    isOpen,
    mode,
    samples,
    selectedSampleIds = new Set(),
    activeSampleId = null,
    onClose,
    onConfirm
}) => {
    const { engine } = useAudio();
    const [format, setFormat] = useState<ExportFormat>('wav');
    const [sampleRate, setSampleRate] = useState<ExportSampleRate>('original');
    const [bitDepth, setBitDepth] = useState<WavBitDepth>(24);
    const [bitrate, setBitrate] = useState<MP3Bitrate>(128);
    const [exportAsZip, setExportAsZip] = useState<boolean>(false);

    const samplesToExport = mode === 'export-all'
        ? samples
        : selectedSampleIds.size > 0
            ? samples.filter(s => selectedSampleIds.has(s.id))
            : activeSampleId
                ? samples.filter(s => s.id === activeSampleId)
                : [];

    const referenceSample = samplesToExport.length > 0 ? samplesToExport[0] : null;
    const originalSampleRate = referenceSample?.buffer?.sampleRate || 44100;

    useEffect(() => {
        if (isOpen && referenceSample?.buffer) {
            setFormat('wav');
            setSampleRate('original');
            setBitDepth(24);
            setBitrate(128);
            setExportAsZip(false);
        }
    }, [isOpen, referenceSample]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm({
            format,
            sampleRate,
            bitDepth: format === 'wav' ? bitDepth : undefined,
            bitrate: format === 'mp3' ? bitrate : undefined,
            exportAsZip: mode === 'export-all' ? exportAsZip : undefined
        });
    };

    const fmtRate = (rate: number | 'original'): string => {
        if (rate === 'original') return 'Original';
        return rate % 1000 === 0 ? `${(rate / 1000).toFixed(0)}k` : `${(rate / 1000).toFixed(1)}k`;
    };

    const effectiveSampleRate = sampleRate === 'original' ? originalSampleRate : sampleRate;
    const requiresResampling = sampleRate !== 'original' && effectiveSampleRate !== originalSampleRate;

    const totalDuration = samplesToExport.reduce((sum, s) => sum + (s.buffer?.duration || 0), 0);
    const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

    const estimatedSize = (): string => {
        const channels = referenceSample?.buffer?.numberOfChannels || 2;
        if (format === 'wav') {
            const bps = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2;
            const bytes = effectiveSampleRate * channels * bps * totalDuration;
            const mb = bytes / (1024 * 1024);
            return mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(2)} MB`;
        }
        const bytes = (bitrate * 1000 / 8) * totalDuration;
        const kb = bytes / 1024;
        return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(2)} MB`;
    };

    const selectStyle: React.CSSProperties = {
        background: 'var(--deep)',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-secondary)',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-xs rounded-lg shadow-2xl p-4" style={{ background: 'var(--surface)', border: '2px solid var(--accent-indigo)' }}>
                <button
                    onClick={onClose}
                    className="absolute top-2.5 right-2.5 p-1 rounded-full transition-opacity hover:opacity-80 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <X className="w-3.5 h-3.5" />
                </button>

                {/* Title */}
                <div className="flex items-center gap-2 mb-3">
                    <Download className="w-4 h-4" style={{ color: 'var(--accent-indigo)' }} />
                    <div>
                        <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                            {mode === 'export-all' ? 'Export All' : 'Save Sample'}
                        </h3>
                        <p className="text-[9px]" style={{ color: 'var(--text-faint)' }}>
                            {samplesToExport.length} sample{samplesToExport.length !== 1 ? 's' : ''} • {fmtTime(totalDuration)}
                        </p>
                    </div>
                </div>

                {/* Settings */}
                <div className="rounded-md p-2.5 mb-3 space-y-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                    {/* Format + Sample Rate side by side */}
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Format</label>
                            <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                                style={selectStyle}
                            >
                                <option value="wav">WAV</option>
                                <option value="mp3">MP3</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Sample Rate</label>
                            <select
                                value={sampleRate === 'original' ? 'original' : sampleRate}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setSampleRate(v === 'original' ? 'original' : Number(v) as ExportSampleRate);
                                }}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                                style={selectStyle}
                            >
                                <option value="original">Original ({fmtRate(originalSampleRate)})</option>
                                <option value="22050">22.05 kHz</option>
                                <option value="44100">44.1 kHz</option>
                                <option value="48000">48 kHz</option>
                                <option value="88200">88.2 kHz</option>
                                <option value="96000">96 kHz</option>
                            </select>
                        </div>
                    </div>

                    {/* Bit Depth (WAV) or Bitrate (MP3) */}
                    {format === 'wav' && (
                        <div>
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Bit Depth</label>
                            <select
                                value={bitDepth}
                                onChange={(e) => setBitDepth(Number(e.target.value) as WavBitDepth)}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                                style={selectStyle}
                            >
                                <option value="16">16-bit (CD)</option>
                                <option value="24">24-bit (Studio)</option>
                                <option value="32">32-bit float (Max)</option>
                            </select>
                        </div>
                    )}

                    {format === 'mp3' && (
                        <div>
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Bitrate</label>
                            <select
                                value={bitrate}
                                onChange={(e) => setBitrate(Number(e.target.value) as MP3Bitrate)}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none cursor-pointer"
                                style={selectStyle}
                            >
                                <option value="128">128 kbps</option>
                                <option value="192">192 kbps</option>
                                <option value="256">256 kbps</option>
                                <option value="320">320 kbps</option>
                            </select>
                        </div>
                    )}

                    {/* ZIP toggle for export-all */}
                    {mode === 'export-all' && (
                        <label className="flex items-center gap-1.5 text-[10px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                            <input
                                type="checkbox"
                                checked={exportAsZip}
                                onChange={(e) => setExportAsZip(e.target.checked)}
                                className="w-3 h-3 rounded"
                                style={{ accentColor: 'var(--accent-indigo)' }}
                            />
                            <span>Export as ZIP archive</span>
                        </label>
                    )}
                </div>

                {/* Summary line */}
                <div className="flex items-center justify-between text-[10px] mb-3 px-1" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {format.toUpperCase()} • {fmtRate(effectiveSampleRate)}
                        {format === 'wav' ? ` • ${bitDepth}bit` : ` • ${bitrate}kbps`}
                    </span>
                    <span className="font-semibold" style={{ color: 'var(--accent-indigo)' }}>~{estimatedSize()}</span>
                </div>

                {requiresResampling && (
                    <div className="flex items-center gap-1 text-[9px] mb-3 px-1" style={{ color: 'var(--warning)' }}>
                        <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                        <span>Resampling {fmtRate(originalSampleRate)} → {fmtRate(effectiveSampleRate)}</span>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={onClose} className="flex-1" style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}>
                        Cancel
                    </Button>
                    <Button size="sm" variant="primary" icon={<Download />} onClick={handleConfirm} className="flex-1">
                        {mode === 'export-all' ? 'Export All' : 'Save'}
                    </Button>
                </div>
            </div>
        </div>
    );
};
