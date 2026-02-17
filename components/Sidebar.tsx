import React, { useState } from 'react';
import { Sample } from '../types';
import { Trash2, Copy, Edit2, Download, FolderOpen, Check, X, Save, FilePlus } from 'lucide-react';
import { Button } from './Button';

interface SidebarProps {
    samples: Sample[];
    activeSampleId: string;
    selectedSampleIds?: Set<string>;
    onSelectSample: (id: string, multiSelectType?: 'ctrl' | 'shift' | null) => void;
    onDeleteSample: (id: string) => void;
    onDuplicateSample: (id: string) => void;
    onRenameSample: (id: string, newName: string) => void;
    onSaveAs: (id: string) => void;
    onExportAll: () => void;
    onNewSession?: () => void;
    onSaveSession?: () => void;
    onLoadSession?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    samples,
    activeSampleId,
    selectedSampleIds = new Set(),
    onSelectSample,
    onDeleteSample,
    onDuplicateSample,
    onRenameSample,
    onSaveAs,
    onExportAll,
    onNewSession,
    onSaveSession,
    onLoadSession
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
        <div className="w-[180px] flex flex-col h-full shrink-0 z-40" style={{ background: 'var(--surface)' }}>
            {/* Header */}
            <div className="px-1.5 py-1 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="text-[8px] font-mono truncate" style={{ color: 'var(--text-faint)' }}>{sessionName}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                    {onNewSession && (
                        <button
                            onClick={onNewSession}
                            className="p-0.5 rounded transition-opacity hover:opacity-80"
                            style={{ color: 'var(--text-muted)' }}
                            title="New Session"
                        >
                            <FilePlus className="w-3 h-3" />
                        </button>
                    )}
                    {onSaveSession && (
                        <button
                            onClick={onSaveSession}
                            className="p-0.5 rounded transition-opacity hover:opacity-80"
                            style={{ color: 'var(--success)' }}
                            title="Save Session"
                        >
                            <Save className="w-3 h-3" />
                        </button>
                    )}
                    {onLoadSession && (
                        <button
                            onClick={onLoadSession}
                            className="p-0.5 rounded transition-opacity hover:opacity-80"
                            style={{ color: 'var(--accent-blue)' }}
                            title="Load Session"
                        >
                            <FolderOpen className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-1.5 py-1 space-y-0.5">
                    {samples.map((sample) => {
                        const isActive = activeSampleId === sample.id;
                        const isSelected = selectedSampleIds.has(sample.id);

                        return (
                            <div key={sample.id}>
                                <div
                                    onClick={(e) => {
                                        const type = e.shiftKey ? 'shift' : e.ctrlKey || e.metaKey ? 'ctrl' : null;
                                        onSelectSample(sample.id, type);
                                    }}
                                    className="relative w-full text-left px-1.5 py-1 rounded transition-all group cursor-pointer"
                                    style={{
                                        background: isActive ? 'var(--overlay)' : isSelected ? 'color-mix(in srgb, var(--overlay) 40%, transparent)' : 'transparent',
                                        border: `1px solid ${isActive ? 'var(--overlay-hover)' : isSelected ? 'color-mix(in srgb, var(--overlay-hover) 40%, transparent)' : 'transparent'}`,
                                    }}
                                >
                                    {editingId === sample.id ? (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="text-[11px] px-1 py-0.5 rounded flex-1 min-w-0 focus:outline-none"
                                                style={{ background: 'var(--deep)', color: 'var(--text-primary)', border: '1px solid var(--accent-indigo)' }}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEdit(e as any);
                                                    if (e.key === 'Escape') cancelEdit(e as any);
                                                }}
                                            />
                                            <button onClick={saveEdit} className="p-0.5 transition-opacity hover:opacity-80" style={{ color: 'var(--success)' }}><Check className="w-3 h-3" /></button>
                                            <button onClick={cancelEdit} className="p-0.5 transition-opacity hover:opacity-80" style={{ color: 'var(--danger)' }}><X className="w-3 h-3" /></button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[11px] font-medium truncate flex-1 min-w-0" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                {sample.name}
                                            </span>
                                            <span className="text-[9px] shrink-0 tabular-nums" style={{ color: 'var(--text-faint)' }}>
                                                {sample.duration}
                                            </span>
                                        </div>
                                    )}

                                    {/* Hover Actions (Absolute) */}
                                    {editingId !== sample.id && (
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 backdrop-blur-sm" style={{ background: 'color-mix(in srgb, var(--overlay) 90%, transparent)' }}>
                                            <button
                                                onClick={(e) => startEditing(e, sample)}
                                                className="p-0.5 rounded transition-opacity hover:opacity-80"
                                                style={{ color: 'var(--text-muted)' }}
                                                title="Rename"
                                            >
                                                <Edit2 className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDuplicateSample(sample.id); }}
                                                className="p-0.5 rounded transition-opacity hover:opacity-80"
                                                style={{ color: 'var(--text-muted)' }}
                                                title="Duplicate"
                                            >
                                                <Copy className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDeleteSample(sample.id); }}
                                                className="p-0.5 rounded transition-opacity hover:opacity-80"
                                                style={{ color: 'var(--danger)' }}
                                                title="Delete"
                                            >
                                                <Trash2 className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer / Global Actions */}
            <div className="px-2 py-1.5 flex flex-col gap-1" style={{ borderTop: '1px solid var(--overlay-hover)', background: 'color-mix(in srgb, var(--overlay) 30%, transparent)' }}>
                <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--text-faint)' }}>
                    <span>{samples.length} Recordings</span>
                    <span>Total: {(() => {
                        const totalBytes = samples.reduce((sum, s) => sum + (s.blob?.size || 0), 0);
                        if (totalBytes === 0) return '0 KB';
                        const mb = totalBytes / (1024 * 1024);
                        return mb < 1 ? `${(totalBytes / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
                    })()}</span>
                </div>

                <div className="flex gap-1">
                    <Button size="xs" variant="default" icon={<Save />} onClick={() => onSaveAs(activeSampleId)} style={{ border: '1px solid var(--border-strong)' }}>
                        Save
                    </Button>
                    <Button size="xs" variant="primary" icon={<Download />} onClick={onExportAll} className="flex-1">
                        Export All
                    </Button>
                </div>
            </div>
        </div>
    );
};
