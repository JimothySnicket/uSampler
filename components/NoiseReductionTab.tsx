import React from 'react';
import { Power, Activity, Volume2 } from 'lucide-react';

interface NoiseReductionTabProps {
    enabled: boolean;
    sensitivity: number;
    amount: number;
    onChange: (enabled: boolean, sensitivity: number, amount: number) => void;
    onReset: () => void;
    onApply: () => void;
}

export const NoiseReductionTab: React.FC<NoiseReductionTabProps> = ({
    enabled,
    sensitivity,
    amount,
    onChange,
    onReset,
    onApply
}) => {
    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-bold text-white">
                        Noise Gate
                    </h3>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onReset}
                        className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                        title="Reset Noise Gate to defaults"
                    >
                        Reset
                    </button>
                    <button
                        onClick={() => onChange(!enabled, sensitivity, amount)}
                        className={`p-2 rounded-lg border transition-all ${enabled
                            ? 'bg-blue-500/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-400 hover:border-zinc-600'
                            }`}
                        title={enabled ? "Disable Noise Gate" : "Enable Noise Gate"}
                    >
                        <Power className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="space-y-8 flex-1">
                {/* Sensitivity Control */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-zinc-300">
                            Sensitivity (Threshold)
                        </label>
                        <span className="text-xs font-mono px-2 py-1 rounded bg-zinc-800 text-blue-400">
                            {Math.round(sensitivity * 100)}%
                        </span>
                    </div>
                    <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-100 bg-blue-500"
                            style={{ width: `${sensitivity * 100}%` }}
                        />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={sensitivity}
                            onChange={(e) => onChange(enabled, parseFloat(e.target.value), amount)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    <p className="text-xs text-zinc-500">
                        Higher sensitivity blocks more background noise (only louder sounds pass). Lower sensitivity allows quieter sounds to pass.
                    </p>
                </div>

                {/* Amount Control */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-medium text-zinc-300">
                            Reduction Amount
                        </label>
                        <span className="text-xs font-mono px-2 py-1 rounded bg-zinc-800 text-blue-400">
                            {Math.round(amount * 100)}%
                        </span>
                    </div>
                    <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-100 bg-blue-500"
                            style={{ width: `${amount * 100}%` }}
                        />
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={amount}
                            onChange={(e) => onChange(enabled, sensitivity, parseFloat(e.target.value))}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    <p className="text-xs text-zinc-500">
                        Controls how much silence is applied when the gate is closed. 100% is total silence.
                    </p>
                </div>
            </div>

            {/* Apply / Bake Button */}
            <div className="mt-6 pt-6 border-t border-zinc-800">
                <button
                    onClick={onApply}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                >
                    <Volume2 className="w-4 h-4" />
                    Apply & Save as New Sample
                </button>
                <p className="text-center text-xs text-zinc-600 mt-2">
                    Creates a new sample with the current noise gate settings permanently applied.
                </p>
            </div>
        </div>
    );
};
