import React from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface ProcessingDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    processingType: 'crop' | 'normalize' | 'filter' | 'filter-with-crop' | 'timeStretch-with-crop';
    onConfirm: () => void;
    onCancel: () => void;
    onApplyWithCrop?: () => void;
    estimatedTime?: string;
}

export const ProcessingDialog: React.FC<ProcessingDialogProps> = ({
    isOpen,
    title,
    description,
    processingType,
    onConfirm,
    onCancel,
    onApplyWithCrop,
    estimatedTime,
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (processingType) {
            case 'crop':
                return '\u2702\uFE0F';
            case 'normalize':
                return '\uD83D\uDCCA';
            case 'filter':
                return '\uD83C\uDF9B\uFE0F';
            case 'filter-with-crop':
                return '\uD83C\uDF9B\uFE0F';
            case 'timeStretch-with-crop':
                return '\u23F1\uFE0F';
            default:
                return '\u2699\uFE0F';
        }
    };

    const getColorVar = (): string => {
        switch (processingType) {
            case 'crop':
            case 'timeStretch-with-crop':
                return 'var(--accent-indigo)';
            case 'normalize':
                return 'var(--success)';
            case 'filter':
            case 'filter-with-crop':
                return 'var(--warning)';
            default:
                return 'var(--text-faint)';
        }
    };

    const accentColor = getColorVar();

    const containerBorderStyle: React.CSSProperties = {
        borderColor: accentColor,
        background: `color-mix(in srgb, ${accentColor} 10%, var(--overlay))`,
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-lg shadow-2xl p-6" style={{ ...containerBorderStyle, border: `2px solid ${accentColor}` }}>
                {/* Close Button */}
                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 p-1.5 rounded-full transition-opacity hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Icon and Title */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="text-4xl">{getIcon()}</div>
                    <div>
                        <h3 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{description}</p>
                    </div>
                </div>

                {/* Info Box */}
                <div className="rounded-md p-4 mb-6" style={{ background: 'color-mix(in srgb, var(--overlay-hover) 50%, transparent)', border: '1px solid var(--border-strong)' }}>
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
                        <div className="flex-1">
                            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                                This will create a new sample file with the processing applied. The original sample will remain unchanged.
                            </p>
                            {estimatedTime && (
                                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                    Estimated processing time: <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{estimatedTime}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                {(processingType === 'filter-with-crop' || processingType === 'timeStretch-with-crop') && onApplyWithCrop ? (
                    <div className="flex flex-col gap-3">
                        <div className="rounded-md p-3 mb-2" style={{ background: 'color-mix(in srgb, var(--warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--warning)' }}>Pending Crop Detected</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                You have region adjustments active. Apply the crop as well?
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button size="lg" variant="default" onClick={onCancel} className="flex-1" style={{ background: 'var(--overlay-hover)', border: '1px solid var(--border-strong)' }}>
                                Cancel
                            </Button>
                            <Button size="lg" variant="default" onClick={onConfirm} className="flex-1" style={{ background: 'var(--border-strong)', border: '1px solid var(--overlay-hover)' }}>
                                {processingType === 'filter-with-crop' ? 'Apply EQ Only' : 'Time Stretch Only'}
                            </Button>
                            <Button
                                size="lg"
                                icon={<Check />}
                                onClick={onApplyWithCrop}
                                className="flex-1"
                                style={{ background: accentColor, color: 'var(--text-primary)', border: `1px solid ${accentColor}` }}
                            >
                                {processingType === 'filter-with-crop' ? 'Apply Crop & EQ' : 'Apply Crop & Stretch'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-3">
                        <Button size="lg" variant="default" onClick={onCancel} className="flex-1" style={{ background: 'var(--overlay-hover)', border: '1px solid var(--border-strong)' }}>
                            Cancel
                        </Button>
                        <Button
                            size="lg"
                            icon={<Check />}
                            onClick={onConfirm}
                            className="flex-1"
                            style={{ background: accentColor, color: 'var(--text-primary)', border: `1px solid ${accentColor}` }}
                        >
                            Apply Processing
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
