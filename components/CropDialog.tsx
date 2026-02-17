import React, { useState } from 'react';
import { X, Scissors, Download } from 'lucide-react';
import { Button } from './Button';
import type { Sample, Region } from '../types';
import type { ExportFormat } from '../src/utils/audioUtils';

export type WavBitDepth = 16 | 24 | 32;
export type ExportSampleRate = 'original' | 22050 | 44100 | 48000 | 88200 | 96000;
export type MP3Bitrate = 128 | 192 | 256 | 320;

interface CropDialogProps {
    isOpen: boolean;
    sample: Sample | null;
    region: Region;
    onCancel: () => void;
    onCrop: () => void;
    onCropAndExport: (options: {
        format: ExportFormat;
        sampleRate: ExportSampleRate;
        bitDepth: WavBitDepth;
        bitrate?: MP3Bitrate;
    }) => void;
}

export const CropDialog: React.FC<CropDialogProps> = ({
    isOpen, sample, region, onCancel, onCrop, onCropAndExport,
}) => {
    const [format, setFormat] = useState<ExportFormat>('wav');
    const [sampleRate, setSampleRate] = useState<ExportSampleRate>('original');
    const [bitDepth, setBitDepth] = useState<WavBitDepth>(24);
    const [bitrate, setBitrate] = useState<MP3Bitrate>(320);

    if (!isOpen || !sample) return null;

    const buffer = sample.buffer;
    const duration = buffer?.duration || 0;
    const regionStart = region.start * duration;
    const regionEnd = region.end * duration;
    const croppedDuration = regionEnd - regionStart;
    const originalRate = buffer?.sampleRate || 48000;

    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
    };

    const selectStyle: React.CSSProperties = {
        background: 'var(--deep)',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-secondary)',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-sm rounded-lg shadow-2xl p-5" style={{ background: 'var(--surface)', border: '2px solid var(--accent-indigo)' }}>
                <button
                    onClick={onCancel}
                    className="absolute top-3 right-3 p-1.5 rounded-full transition-opacity hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Title */}
                <div className="flex items-center gap-2 mb-3">
                    <Scissors className="w-5 h-5" style={{ color: 'var(--accent-indigo)' }} />
                    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Crop Sample</h3>
                </div>

                {/* Region info */}
                <div className="rounded-md p-2.5 mb-3 text-xs space-y-0.5" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                    <div className="font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{sample.name}</div>
                    <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                        <span>Region: {fmtTime(regionStart)} → {fmtTime(regionEnd)}</span>
                        <span className="font-mono font-bold" style={{ color: 'var(--accent-indigo)' }}>{croppedDuration.toFixed(2)}s</span>
                    </div>
                    <div style={{ color: 'var(--text-faint)' }}>Original: {fmtTime(duration)}</div>
                </div>

                {/* Export settings */}
                <div className="rounded-md p-2.5 mb-4 space-y-2" style={{ background: 'var(--input-bg)', border: '1px solid var(--border-subtle)' }}>
                    <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Export Settings</div>

                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Format</label>
                            <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none"
                                style={selectStyle}
                            >
                                <option value="wav">WAV</option>
                                <option value="mp3">MP3</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Sample Rate</label>
                            <select
                                value={sampleRate}
                                onChange={(e) => setSampleRate(e.target.value === 'original' ? 'original' : Number(e.target.value) as any)}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none"
                                style={selectStyle}
                            >
                                <option value="original">Original ({(originalRate / 1000).toFixed(1)}k)</option>
                                <option value="22050">22.05 kHz</option>
                                <option value="44100">44.1 kHz</option>
                                <option value="48000">48 kHz</option>
                                <option value="88200">88.2 kHz</option>
                                <option value="96000">96 kHz</option>
                            </select>
                        </div>
                    </div>

                    {format === 'wav' && (
                        <div>
                            <label className="block text-[10px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Bit Depth</label>
                            <select
                                value={bitDepth}
                                onChange={(e) => setBitDepth(Number(e.target.value) as WavBitDepth)}
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none"
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
                                className="w-full rounded px-2 py-1 text-xs focus:outline-none"
                                style={selectStyle}
                            >
                                <option value="128">128 kbps</option>
                                <option value="192">192 kbps</option>
                                <option value="256">256 kbps</option>
                                <option value="320">320 kbps</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={onCancel} className="flex-1" style={{ background: 'var(--elevated)', border: '1px solid var(--border)' }}>
                        Cancel
                    </Button>
                    <Button size="sm" icon={<Scissors />} onClick={onCrop} className="flex-1" style={{ background: 'var(--accent-indigo)', color: '#fff', border: 'none' }}>
                        Crop
                    </Button>
                    <Button
                        size="sm"
                        icon={<Download />}
                        onClick={() => onCropAndExport({ format, sampleRate, bitDepth, bitrate: format === 'mp3' ? bitrate : undefined })}
                        className="flex-1"
                        style={{ background: 'var(--success)', color: '#fff', border: 'none' }}
                    >
                        Crop & Export
                    </Button>
                </div>
            </div>
        </div>
    );
};
