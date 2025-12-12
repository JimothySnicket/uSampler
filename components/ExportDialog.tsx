import React, { useState, useEffect } from 'react';
import { X, Check, Download, FileAudio, Sparkles, Lock, AlertCircle } from 'lucide-react';
import { Sample } from '../types';
import { DEV_MODE } from '../constants';
import { useAudio } from '../src/context/AudioContext';

export type ExportFormat = 'wav' | 'mp3';
export type ExportSampleRate = 'original' | 44100 | 48000;
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
        bitrate?: MP3Bitrate;
        exportAsZip?: boolean;
    }) => void;
}

// Placeholder function for premium check (structure only, not implemented)
const isPremiumFeatureAvailable = (feature: string): boolean => {
    // In dev mode, all features are available
    if (DEV_MODE) {
        return true;
    }
    // TODO: Implement premium check logic for production
    // This would check user subscription status, license, etc.
    return false;
};

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
    const [bitrate, setBitrate] = useState<MP3Bitrate>(128);
    const [exportAsZip, setExportAsZip] = useState<boolean>(false);

    // Get samples that will be exported
    const samplesToExport = mode === 'export-all'
        ? samples
        : selectedSampleIds.size > 0
            ? samples.filter(s => selectedSampleIds.has(s.id))
            : activeSampleId
                ? samples.filter(s => s.id === activeSampleId)
                : [];

    // Get reference sample for sample rate display
    const referenceSample = samplesToExport.length > 0 ? samplesToExport[0] : null;
    const originalSampleRate = referenceSample?.buffer?.sampleRate || 44100;
    const browserSampleRate = engine?.context?.sampleRate || engine?.getSampleRate() || 44100;

    useEffect(() => {
        if (isOpen && referenceSample?.buffer) {
            // Reset to defaults when dialog opens
            setFormat('wav');
            setSampleRate('original');
            setBitrate(128);
            setExportAsZip(false);
        }
    }, [isOpen, referenceSample]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        // Check premium requirements based on pricing model
        const effectiveSampleRate = getEffectiveSampleRate();
        const requiresResampling = sampleRate !== 'original' && effectiveSampleRate !== originalSampleRate;
        const isOriginalAbove44_1 = originalSampleRate > 44100;
        const is48kHzSelected = effectiveSampleRate === 48000;
        const isHighBitrate = bitrate > 128;

        // Free tier allows:
        // - WAV: 44.1 kHz, 16-bit PCM
        // - MP3: 44.1 kHz, 128 kbps CBR
        // - Original sample rate if ≤ 44.1 kHz (no resampling)
        
        // Premium required for:
        // - 48 kHz sample rate
        // - MP3 bitrates > 128 kbps
        // - Any resampling operations
        // - Original sample rate if > 44.1 kHz (requires resampling to export)
        
        const needsPremium = 
            (is48kHzSelected && !DEV_MODE) ||
            (isHighBitrate && !DEV_MODE) ||
            (requiresResampling && !DEV_MODE) ||
            (isOriginalAbove44_1 && sampleRate === 'original' && !DEV_MODE);

        if (needsPremium && !isPremiumFeatureAvailable('export')) {
            alert('This feature requires a premium subscription. Please upgrade to access higher quality exports.\n\nFree tier includes:\n- WAV: 44.1 kHz, 16-bit\n- MP3: 44.1 kHz, 128 kbps\n- Original sample rate (if ≤ 44.1 kHz)');
            return;
        }

        onConfirm({ 
            format, 
            sampleRate, 
            bitrate: format === 'mp3' ? bitrate : undefined,
            exportAsZip: mode === 'export-all' ? exportAsZip : undefined
        });
    };

    const formatSampleRate = (rate: number | 'original'): string => {
        if (rate === 'original') {
            return 'Original';
        }
        if (rate % 1000 === 0) {
            return `${(rate / 1000).toFixed(0)}.0 kHz`;
        }
        return `${(rate / 1000).toFixed(1)} kHz`;
    };

    const getEffectiveSampleRate = (): number => {
        if (sampleRate === 'original') {
            return originalSampleRate;
        }
        return sampleRate;
    };

    const totalDuration = samplesToExport.reduce((sum, s) => {
        return sum + (s.buffer?.duration || 0);
    }, 0);

    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Premium feature checks
    const effectiveSampleRate = getEffectiveSampleRate();
    const requiresResampling = sampleRate !== 'original' && effectiveSampleRate !== originalSampleRate;
    const isOriginalAbove44_1 = originalSampleRate > 44100;
    const is48kHzSelected = effectiveSampleRate === 48000;
    const isHighBitrate = bitrate > 128;
    const isPremium = isPremiumFeatureAvailable('export');

    // Calculate estimated file size
    const calculateEstimatedSize = (): string => {
        const duration = totalDuration;
        const channels = referenceSample?.buffer?.numberOfChannels || 2;
        const effectiveRate = effectiveSampleRate;

        if (format === 'wav') {
            // WAV: sampleRate * channels * 2 bytes * duration
            const bytes = effectiveRate * channels * 2 * duration;
            const mb = bytes / (1024 * 1024);
            return mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(2)} MB`;
        } else {
            // MP3: bitrate * duration / 8
            const bytes = (bitrate * 1000 / 8) * duration;
            const kb = bytes / 1024;
            return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(2)} MB`;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-zinc-900 rounded-lg border-2 border-indigo-500/50 shadow-2xl p-5">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Title */}
                <div className="mb-4">
                    <h3 className="text-lg font-bold text-white">
                        {mode === 'export-all' ? 'Export All Samples' : 'Save Selected Sample(s)'}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                        {samplesToExport.length} sample{samplesToExport.length !== 1 ? 's' : ''} • {formatDuration(totalDuration)}
                    </p>
                </div>

                {/* Format Selection - Dropdown */}
                <div className="mb-3">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Format
                    </label>
                    <select
                        value={format}
                        onChange={(e) => setFormat(e.target.value as ExportFormat)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="wav">WAV (16-bit PCM, Lossless)</option>
                        <option value="mp3">MP3 (Compressed)</option>
                    </select>
                </div>

                {/* Sample Rate Selection */}
                <div className="mb-3">
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-2">
                        Sample Rate
                        {is48kHzSelected && !isPremium && (
                            <span className="text-xs text-yellow-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                Premium
                            </span>
                        )}
                        {isOriginalAbove44_1 && sampleRate === 'original' && !isPremium && (
                            <span className="text-xs text-yellow-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                Premium
                            </span>
                        )}
                    </label>
                    <select
                        value={sampleRate === 'original' ? 'original' : sampleRate}
                        onChange={(e) => {
                            const value = e.target.value;
                            const newRate = value === 'original' ? 'original' : Number(value) as 44100 | 48000;
                            const willBe48kHz = newRate === 48000 || (newRate === 'original' && originalSampleRate === 48000);
                            
                            // Check premium requirement
                            if (willBe48kHz && !isPremium && !DEV_MODE) {
                                alert('48 kHz sample rate requires a premium subscription.');
                                return;
                            }
                            
                            setSampleRate(newRate);
                        }}
                        className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 ${
                            (is48kHzSelected || (isOriginalAbove44_1 && sampleRate === 'original')) && !isPremium && !DEV_MODE
                                ? 'border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500'
                                : 'border-zinc-700 focus:border-indigo-500 focus:ring-indigo-500'
                        }`}
                        disabled={(is48kHzSelected || (isOriginalAbove44_1 && sampleRate === 'original')) && !isPremium && !DEV_MODE}
                    >
                        <option value="original">
                            Original ({formatSampleRate(originalSampleRate)})
                            {isOriginalAbove44_1 && !isPremium && !DEV_MODE && ' 🔒'}
                        </option>
                        <option value="44100">44.1 kHz (CD Quality)</option>
                        <option value="48000">
                            48 kHz (Professional)
                            {!isPremium && !DEV_MODE && ' 🔒'}
                        </option>
                    </select>
                </div>

                {/* MP3 Bitrate Selection - Dropdown */}
                {format === 'mp3' && (
                    <div className="mb-3">
                        <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-2">
                            MP3 Bitrate
                            {isHighBitrate && !isPremium && (
                                <span className="text-xs text-yellow-400 flex items-center gap-1">
                                    <Lock className="w-3 h-3" />
                                    Premium
                                </span>
                            )}
                        </label>
                        <select
                            value={bitrate}
                            onChange={(e) => {
                                const newBitrate = Number(e.target.value) as MP3Bitrate;
                                const isPremiumRate = newBitrate > 128;
                                
                                if (isPremiumRate && !isPremium && !DEV_MODE) {
                                    alert(`MP3 bitrate ${newBitrate} kbps requires a premium subscription.`);
                                    return;
                                }
                                
                                setBitrate(newBitrate);
                            }}
                            className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 ${
                                isHighBitrate && !isPremium && !DEV_MODE
                                    ? 'border-yellow-500/50 focus:border-yellow-500 focus:ring-yellow-500'
                                    : 'border-zinc-700 focus:border-indigo-500 focus:ring-indigo-500'
                            }`}
                            disabled={isHighBitrate && !isPremium && !DEV_MODE}
                        >
                            <option value="128">128 kbps CBR</option>
                            <option value="192">192 kbps CBR 🔒</option>
                            <option value="256">256 kbps CBR 🔒</option>
                            <option value="320">320 kbps CBR 🔒</option>
                        </select>
                    </div>
                )}

                {/* Export as ZIP Checkbox - Only for Export All */}
                {mode === 'export-all' && (
                    <div className="mb-3">
                        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={exportAsZip}
                                onChange={(e) => setExportAsZip(e.target.checked)}
                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-500 focus:ring-2"
                            />
                            <span>Export as ZIP archive</span>
                        </label>
                    </div>
                )}

                {/* Compact Export Summary */}
                <div className="bg-zinc-800/50 rounded-md p-2.5 mb-4 border border-zinc-700">
                    <div className="text-xs text-zinc-400 space-y-1">
                        <div className="flex justify-between">
                            <span>Export:</span>
                            <span className="text-zinc-200 font-mono">
                                {format.toUpperCase()} • {formatSampleRate(effectiveSampleRate)}
                                {format === 'mp3' && ` • ${bitrate}kbps`}
                                {requiresResampling && <span className="text-yellow-400 ml-1">(resampled)</span>}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>Estimated Size:</span>
                            <span className="text-indigo-300 font-semibold">{calculateEstimatedSize()}</span>
                        </div>
                    </div>
                    {requiresResampling && (
                        <div className="mt-2 flex items-start gap-1.5 text-xs text-yellow-400">
                            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>Resampling from {formatSampleRate(originalSampleRate)} to {formatSampleRate(effectiveSampleRate)}</span>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm font-medium transition-colors border border-zinc-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors border border-indigo-500 flex items-center justify-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        {mode === 'export-all' ? 'Export All' : 'Save Selected'}
                    </button>
                </div>
            </div>
        </div>
    );
};

