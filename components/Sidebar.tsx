import React, { useState } from 'react';
import { Sample } from '../types';
import { AudioWaveform, Clock, HardDrive, Search, Trash2, Copy, Edit2, Download, Share2, FolderOpen, Check, X, Save, ChevronRight, ChevronDown } from 'lucide-react';
import { formatDuration } from '../src/utils/audioUtils';

interface SidebarProps {
    samples: Sample[];
    activeSampleId: string;
    selectedSampleIds?: Set<string>;
    activeChopId?: string | null;
    expandedSamples?: Set<string>;
    onSelectSample: (id: string, multiSelectType?: 'ctrl' | 'shift' | null) => void;
    onSelectChop?: (sampleId: string, chopId: string) => void;
    onToggleExpand?: (id: string) => void;
    onDeleteSample: (id: string) => void;
    onDuplicateSample: (id: string) => void;
    onRenameSample: (id: string, newName: string) => void;
    onSaveAs: (id: string) => void;
    onExportAll: () => void;
    onShare: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    samples,
    activeSampleId,
    selectedSampleIds = new Set(),
    activeChopId = null,
    expandedSamples = new Set(),
    onSelectSample,
    onSelectChop,
    onToggleExpand,
    onDeleteSample,
    onDuplicateSample,
    onRenameSample,
    onSaveAs,
    onExportAll,
    onShare
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Mock Session Folder Name
    const sessionName = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const startEditing = (e: React.MouseEvent, sample: Sample) => {
        e.stopPropagation();
        setEditingId(sample.id);
        setEditName(sample.name.replace('.wav', '')); // Strip extension for editing
    };

    const saveEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editingId && editName.trim()) {
            onRenameSample(editingId, `${editName}.wav`);
        }
        setEditingId(null);
    };

    const cancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
    };

    return (
        <div className="w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full shrink-0 z-40">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800">
                <div className="relative">
                    <Search className="absolute left-2 top-2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search session..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 pl-8 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>

            {/* Folder Breadcrumb */}
            <div className="px-4 py-2 bg-zinc-900/30 border-b border-zinc-800 flex items-center justify-between text-[10px] text-zinc-500 font-bold tracking-wider">
                <div className="flex items-center gap-2 uppercase">
                    <FolderOpen className="w-3 h-3 text-zinc-600" />
                    <span>/ Recordings / {sessionName}</span>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={() => {
                            if (onToggleExpand) {
                                samples.forEach(s => {
                                    if (!expandedSamples.has(s.id) && s.chops && s.chops.length > 0) onToggleExpand(s.id);
                                });
                            }
                        }}
                        className="hover:text-zinc-300"
                        title="Expand All"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                    <button
                        onClick={() => {
                            if (onToggleExpand) {
                                samples.forEach(s => {
                                    if (expandedSamples.has(s.id)) onToggleExpand(s.id);
                                });
                            }
                        }}
                        className="hover:text-zinc-300"
                        title="Collapse All"
                    >
                        <ChevronDown className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                    {samples.map((sample) => {
                        const hasChops = sample.chops && sample.chops.length > 0;
                        const isExpanded = expandedSamples.has(sample.id);

                        return (
                            <div key={sample.id}>
                                <div
                                    onClick={(e) => {
                                        const type = e.shiftKey ? 'shift' : e.ctrlKey || e.metaKey ? 'ctrl' : null;
                                        onSelectSample(sample.id, type);
                                    }}
                                    className={`relative w-full text-left p-2 rounded-md transition-all group border border-transparent ${activeSampleId === sample.id
                                        ? 'bg-zinc-900 border-zinc-800 shadow-sm'
                                        : selectedSampleIds.has(sample.id)
                                            ? 'bg-zinc-900/40 border-zinc-800/40' // Selected but not active
                                            : 'hover:bg-zinc-900/50 hover:border-zinc-800/50'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1 flex-1 min-w-0">
                                            {hasChops && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onToggleExpand) onToggleExpand(sample.id);
                                                    }}
                                                    className="p-1.5 hover:bg-zinc-800 rounded transition-all text-zinc-400 hover:text-indigo-400 border border-transparent hover:border-zinc-700"
                                                    title={isExpanded ? "Collapse chops" : "Expand chops"}
                                                >
                                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                </button>
                                            )}
                                            {editingId === sample.id ? (
                                                <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="bg-black text-white text-xs px-1 py-0.5 border border-indigo-500 rounded w-full focus:outline-none"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') saveEdit(e as any);
                                                            if (e.key === 'Escape') cancelEdit(e as any);
                                                        }}
                                                    />
                                                    <button onClick={saveEdit} className="p-1 hover:text-green-400 text-zinc-400"><Check className="w-3 h-3" /></button>
                                                    <button onClick={cancelEdit} className="p-1 hover:text-red-400 text-zinc-400"><X className="w-3 h-3" /></button>
                                                </div>
                                            ) : (
                                                <span className={`text-sm font-medium truncate pr-16 ${activeSampleId === sample.id ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                                                    {sample.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> {sample.duration}
                                        </span>
                                        <span className="bg-zinc-800 px-1 rounded text-zinc-500">{sample.bpm} BPM</span>
                                    </div>

                                    {/* Hover Actions (Absolute) */}
                                    {editingId !== sample.id && (
                                        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900/80 rounded-md p-0.5 backdrop-blur-sm">
                                            <button
                                                onClick={(e) => startEditing(e, sample)}
                                                className="p-1 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-800 rounded"
                                                title="Rename"
                                            >
                                                <Edit2 className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDuplicateSample(sample.id); }}
                                                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
                                                title="Duplicate"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteSample(sample.id); }}
                                                className="p-1 text-zinc-400 hover:text-red-500 hover:bg-zinc-800 rounded"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Chops as children */}
                                {hasChops && isExpanded && sample.chops && (
                                    <div className="ml-4 pl-2 border-l border-zinc-800 space-y-1">
                                        {sample.chops.map((chop, idx) => {
                                            const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                                            const note = chop.keyboardNote !== undefined ? noteNames[chop.keyboardNote % 12] + Math.floor(chop.keyboardNote / 12) : '';
                                            const chopDuration = sample.buffer ? formatDuration((chop.end - chop.start) * sample.buffer.duration) : '0:00';

                                            return (
                                                <div
                                                    key={chop.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onSelectChop) onSelectChop(sample.id, chop.id);
                                                    }}
                                                    className={`p-1.5 rounded text-xs cursor-pointer transition-colors ${activeChopId === chop.id
                                                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50'
                                                        : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span>Chop {idx + 1}</span>
                                                        {chop.keyboardNote !== undefined && (
                                                            <span className="text-[10px] text-zinc-600 font-mono">{note}</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-zinc-600 mt-0.5">{chopDuration}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer / Global Actions */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
                    <span>{samples.length} Recordings</span>
                    <span>Total: 12.5 MB</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => onSaveAs(activeSampleId)}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs font-medium transition-colors border border-zinc-700"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Copy
                    </button>
                    <button
                        onClick={onShare}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-xs font-medium transition-colors border border-zinc-700"
                    >
                        <Share2 className="w-3.5 h-3.5" /> Share
                    </button>
                    <button
                        onClick={onExportAll}
                        className="col-span-2 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold transition-colors shadow-lg shadow-indigo-500/20"
                    >
                        <Download className="w-3.5 h-3.5" /> Export All
                    </button>
                </div>
            </div>
        </div>
    );
};