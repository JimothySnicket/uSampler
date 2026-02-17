import React from 'react';
import {
    Play, Pause, Square, SkipBack, MonitorPlay, ChevronDown, RefreshCcw,
    Volume2, VolumeX, Repeat
} from 'lucide-react';
import { Logo } from './Logo';

interface TransportBarProps {
    // Source
    activeSourceTitle: string;
    isSourceConnected: boolean;
    muteSourceDuringRecording: boolean;
    onSourceSelect: () => void;
    onReconnectSource: () => void;
    onToggleMuteSource: () => void;
    // Transport
    isPlaying: boolean;
    isLooping: boolean;
    isRecording: boolean;
    isArmed: boolean;
    onPlay: () => void;
    onStop: () => void;
    onSkipBack: () => void;
    onLoopToggle: () => void;
    onRecord: () => void;
    onArm: () => void;
    // Time
    currentTime: string;
    totalTime: string;
}

export const TransportBar: React.FC<TransportBarProps> = ({
    activeSourceTitle, isSourceConnected, muteSourceDuringRecording,
    onSourceSelect, onReconnectSource, onToggleMuteSource,
    isPlaying, isLooping, isRecording, isArmed,
    onPlay, onStop, onSkipBack, onLoopToggle, onRecord, onArm,
    currentTime, totalTime,
}) => {
    return (
        <div
            className="h-8 shrink-0 flex items-center justify-between px-2.5 gap-2"
            style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
            {/* Left: Logo + Source */}
            <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-1.5">
                    <Logo size={16} />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Sampler</span>
                </div>

                <div className="w-px h-3 shrink-0" style={{ background: 'var(--border)' }} />

                {/* Source selector — prominent */}
                <button
                    onClick={onSourceSelect}
                    className={`flex items-center gap-1.5 rounded px-2 py-1 text-[9px] font-semibold cursor-pointer ${isSourceConnected ? 'hover:opacity-90 transition-all' : 'animate-pulse'}`}
                    style={{
                        background: isSourceConnected
                            ? 'color-mix(in srgb, var(--vu-green) 15%, var(--surface))'
                            : 'color-mix(in srgb, var(--accent) 20%, var(--surface))',
                        border: `1px solid ${isSourceConnected ? 'var(--vu-green)' : 'var(--accent)'}`,
                        color: isSourceConnected ? 'var(--vu-green)' : 'var(--accent)',
                    }}
                >
                    <MonitorPlay className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[100px]">
                        {isSourceConnected ? activeSourceTitle : 'Select Source'}
                    </span>
                    <ChevronDown className="w-2.5 h-2.5 shrink-0" style={{ opacity: 0.6 }} />
                </button>

                {!isSourceConnected && (
                    <button
                        onClick={onReconnectSource}
                        className="p-0.5 rounded-full hover:opacity-80 transition-opacity cursor-pointer"
                    >
                        <RefreshCcw className="w-2.5 h-2.5 animate-pulse" style={{ color: 'var(--vu-red)' }} />
                    </button>
                )}

                {isSourceConnected && (
                    <button
                        onClick={onToggleMuteSource}
                        className="p-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                        title={muteSourceDuringRecording ? 'Source muted during recording' : 'Source audible'}
                    >
                        {muteSourceDuringRecording ? (
                            <VolumeX className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        ) : (
                            <Volume2 className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        )}
                    </button>
                )}
            </div>

            {/* Center: Transport Controls */}
            <div className="flex items-center gap-0.5">
                {/* Arm */}
                <button
                    onClick={onArm}
                    className="w-6 h-[22px] flex items-center justify-center rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                        background: isArmed ? 'color-mix(in srgb, var(--record) 25%, transparent)' : 'transparent',
                    }}
                    title="Arm for recording"
                >
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{
                            background: isArmed ? 'var(--vu-red)' : 'var(--text-muted)',
                            opacity: isArmed ? 0.85 : 0.5,
                        }}
                    />
                </button>

                {/* Skip Back */}
                <button
                    onClick={onSkipBack}
                    className="w-6 h-[22px] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                >
                    <SkipBack className="w-[11px] h-[11px]" style={{ color: 'var(--text-faint)' }} />
                </button>

                {/* Stop */}
                <button
                    onClick={onStop}
                    className="w-6 h-[22px] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                >
                    <Square className="w-[10px] h-[10px]" style={{ color: 'var(--text-faint)' }} />
                </button>

                {/* Play/Pause */}
                <button
                    onClick={onPlay}
                    className="w-[26px] h-[22px] flex items-center justify-center rounded-sm cursor-pointer hover:opacity-90 transition-opacity"
                    style={{
                        background: isPlaying ? 'var(--accent-indigo-strong)' : 'var(--accent-indigo)',
                        border: '1px solid var(--accent-indigo)',
                    }}
                >
                    {isPlaying ? (
                        <Pause className="w-[11px] h-[11px]" style={{ color: '#fff' }} />
                    ) : (
                        <Play className="w-[11px] h-[11px]" style={{ color: '#fff' }} />
                    )}
                </button>

                {/* Loop */}
                <button
                    onClick={onLoopToggle}
                    className="w-6 h-[22px] flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                >
                    <Repeat
                        className="w-[11px] h-[11px]"
                        style={{ color: isLooping ? 'var(--vu-green)' : 'var(--text-muted)', opacity: isLooping ? 0.75 : 1 }}
                    />
                </button>

                {/* Record */}
                <button
                    onClick={onRecord}
                    className="w-6 h-[22px] flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
                >
                    <div
                        className={`w-[11px] h-[11px] rounded-full ${isRecording ? 'animate-pulse' : ''}`}
                        style={{ background: 'var(--vu-red-bright)' }}
                    />
                </button>
            </div>

            {/* Right: Time */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {currentTime} / {totalTime}
                </span>
            </div>
        </div>
    );
};
