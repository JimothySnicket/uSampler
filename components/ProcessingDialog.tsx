import React from 'react';
import { X, Check, AlertCircle } from 'lucide-react';

interface ProcessingDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    processingType: 'crop' | 'normalize' | 'filter' | 'adsr' | 'chop' | 'chop-with-processing' | 'filter-with-crop' | 'timeStretch-with-crop';
    onConfirm: () => void;
    onCancel: () => void;
    onApplyAndChop?: () => void; // For chop-with-processing dialog
    onApplyWithCrop?: () => void; // For filter/timeStretch-with-crop dialog
    estimatedTime?: string;
}

export const ProcessingDialog: React.FC<ProcessingDialogProps> = ({
    isOpen,
    title,
    description,
    processingType,
    onConfirm,
    onCancel,
    onApplyAndChop,
    onApplyWithCrop,
    estimatedTime
}) => {
    if (!isOpen) return null;

    const getIcon = () => {
        switch (processingType) {
            case 'crop':
                return '✂️';
            case 'normalize':
                return '📊';
            case 'filter':
                return '🎛️';
            case 'adsr':
                return '🎚️';
            case 'chop':
                return '🔪';
            case 'chop-with-processing':
                return '🔪';
            case 'filter-with-crop':
                return '🎛️';
            case 'timeStretch-with-crop':
                return '⏱️';
            default:
                return '⚙️';
        }
    };

    const getColor = () => {
        switch (processingType) {
            case 'crop':
                return 'indigo';
            case 'normalize':
                return 'green';
            case 'filter':
                return 'yellow';
            case 'adsr':
                return 'purple';
            case 'chop':
                return 'red';
            case 'chop-with-processing':
                return 'red';
            case 'filter-with-crop':
                return 'yellow';
            case 'timeStretch-with-crop':
                return 'indigo';
            default:
                return 'zinc';
        }
    };

    const colorClasses = {
        indigo: 'border-indigo-500 bg-indigo-500/10',
        green: 'border-green-500 bg-green-500/10',
        yellow: 'border-yellow-500 bg-yellow-500/10',
        purple: 'border-purple-500 bg-purple-500/10',
        red: 'border-red-500 bg-red-500/10',
        zinc: 'border-zinc-500 bg-zinc-500/10'
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={`relative w-full max-w-md bg-zinc-900 rounded-lg border-2 ${colorClasses[getColor()]} shadow-2xl p-6`}>
                {/* Close Button */}
                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Icon and Title */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="text-4xl">{getIcon()}</div>
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
                        <p className="text-sm text-zinc-400">{description}</p>
                    </div>
                </div>

                {/* Info Box */}
                <div className="bg-zinc-800/50 rounded-md p-4 mb-6 border border-zinc-700">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-zinc-300 mb-2">
                                This will create a new sample file with the processing applied. The original sample will remain unchanged.
                            </p>
                            {estimatedTime && (
                                <p className="text-xs text-zinc-500">
                                    Estimated processing time: <span className="font-mono text-zinc-400">{estimatedTime}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                {(processingType === 'chop-with-processing' && onApplyAndChop) || 
                 ((processingType === 'filter-with-crop' || processingType === 'timeStretch-with-crop') && onApplyWithCrop) ? (
                    <div className="flex flex-col gap-3">
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 mb-2">
                            <p className="text-sm text-yellow-400 font-semibold mb-1">Pending Crop Detected</p>
                            <p className="text-xs text-zinc-400">
                                {processingType === 'chop-with-processing' 
                                    ? 'You have region adjustments or EQ settings active. Choose how to proceed:'
                                    : 'You have region adjustments active. Apply the crop as well?'}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onCancel}
                                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md font-semibold transition-colors border border-zinc-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onConfirm}
                                className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md font-semibold transition-colors border border-zinc-600 flex items-center justify-center gap-2"
                            >
                                {processingType === 'chop-with-processing' ? 'Chop Only' : 
                                 processingType === 'filter-with-crop' ? 'Apply EQ Only' : 'Time Stretch Only'}
                            </button>
                            <button
                                onClick={processingType === 'chop-with-processing' ? onApplyAndChop : onApplyWithCrop}
                                className={`flex-1 px-4 py-2.5 border text-white rounded-md font-semibold transition-colors flex items-center justify-center gap-2 ${
                                    processingType === 'chop-with-processing' ? 'bg-red-600 hover:bg-red-500 border-red-500' :
                                    processingType === 'filter-with-crop' ? 'bg-yellow-600 hover:bg-yellow-500 border-yellow-500' :
                                    'bg-indigo-600 hover:bg-indigo-500 border-indigo-500'
                                }`}
                            >
                                <Check className="w-4 h-4" />
                                {processingType === 'chop-with-processing' ? 'Apply & Chop' : 
                                 processingType === 'filter-with-crop' ? 'Apply Crop & EQ' : 'Apply Crop & Stretch'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md font-semibold transition-colors border border-zinc-700"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 px-4 py-2.5 rounded-md font-semibold transition-colors border ${
                                getColor() === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white' :
                                getColor() === 'green' ? 'bg-green-600 hover:bg-green-500 border-green-500 text-white' :
                                getColor() === 'yellow' ? 'bg-yellow-600 hover:bg-yellow-500 border-yellow-500 text-white' :
                                getColor() === 'purple' ? 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white' :
                                getColor() === 'red' ? 'bg-red-600 hover:bg-red-500 border-red-500 text-white' :
                                'bg-zinc-600 hover:bg-zinc-500 border-zinc-500 text-white'
                            } flex items-center justify-center gap-2`}
                        >
                            <Check className="w-4 h-4" />
                            Apply Processing
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

