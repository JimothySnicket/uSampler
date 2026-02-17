import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, X, Check, Trash2, Clock, FileAudio } from 'lucide-react';
import { Button } from './Button';
import { saveSession, loadSession, listSessions, deleteSession } from '../src/utils/storageUtils';
import { Sample } from '../types';
import { debugError } from '../src/utils/logger';

interface SessionDialogProps {
    isOpen: boolean;
    mode: 'save' | 'load';
    samples: Sample[];
    audioContext: AudioContext | null;
    onClose: () => void;
    onLoadSession: (samples: Sample[]) => void;
}

export const SessionDialog: React.FC<SessionDialogProps> = ({
    isOpen,
    mode,
    samples,
    audioContext,
    onClose,
    onLoadSession
}) => {
    const [sessionName, setSessionName] = useState('');
    const [savedSessions, setSavedSessions] = useState<Array<{ id: string; name: string; createdAt: number; updatedAt: number; sampleCount: number }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingSession, setIsLoadingSession] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (isOpen && mode === 'load') {
            loadSessionsList();
        } else if (isOpen && mode === 'save') {
            // Auto-generate session name
            const date = new Date();
            const defaultName = `Session ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            setSessionName(defaultName);
        }
    }, [isOpen, mode]);

    const loadSessionsList = async () => {
        setIsLoading(true);
        try {
            const sessions = await listSessions();
            setSavedSessions(sessions);
        } catch (error) {
            debugError('Failed to load sessions:', error);
            setMessage({ type: 'error', text: 'Failed to load sessions' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!sessionName.trim()) {
            setMessage({ type: 'error', text: 'Please enter a session name' });
            return;
        }

        if (samples.length === 0) {
            setMessage({ type: 'error', text: 'No samples to save' });
            return;
        }

        setIsSaving(true);
        setMessage(null);

        try {
            await saveSession(sessionName.trim(), samples);
            setMessage({ type: 'success', text: 'Session saved successfully!' });
            setTimeout(() => {
                onClose();
                setMessage(null);
            }, 1500);
        } catch (error) {
            debugError('Failed to save session:', error);
            setMessage({ type: 'error', text: 'Failed to save session' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoad = async (sessionId: string) => {
        if (!audioContext) {
            setMessage({ type: 'error', text: 'Audio context not available' });
            return;
        }

        setIsLoadingSession(sessionId);
        setMessage(null);

        try {
            const loadedSamples = await loadSession(sessionId, audioContext);
            onLoadSession(loadedSamples);
            setMessage({ type: 'success', text: 'Session loaded successfully!' });
            setTimeout(() => {
                onClose();
                setMessage(null);
            }, 1500);
        } catch (error) {
            debugError('Failed to load session:', error);
            setMessage({ type: 'error', text: 'Failed to load session' });
        } finally {
            setIsLoadingSession(null);
        }
    };

    const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this session?')) {
            return;
        }

        try {
            await deleteSession(sessionId);
            await loadSessionsList();
            setMessage({ type: 'success', text: 'Session deleted' });
            setTimeout(() => setMessage(null), 2000);
        } catch (error) {
            debugError('Failed to delete session:', error);
            setMessage({ type: 'error', text: 'Failed to delete session' });
        }
    };

    if (!isOpen) return null;

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'var(--overlay)', border: '1px solid var(--overlay-hover)' }}>
                {/* Header */}
                <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--overlay-hover)' }}>
                    <div className="flex items-center gap-2">
                        {mode === 'save' ? (
                            <Save className="w-5 h-5" style={{ color: 'var(--accent-indigo)' }} />
                        ) : (
                            <FolderOpen className="w-5 h-5" style={{ color: 'var(--accent-indigo)' }} />
                        )}
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                            {mode === 'save' ? 'Save Session' : 'Load Session'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded transition-opacity hover:opacity-80"
                        style={{ color: 'var(--text-muted)' }}
                        title="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {mode === 'save' ? (
                        <>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                                    Session Name
                                </label>
                                <input
                                    type="text"
                                    value={sessionName}
                                    onChange={(e) => setSessionName(e.target.value)}
                                    placeholder="My Session"
                                    disabled={isSaving}
                                    className="w-full rounded-md px-3 py-2 text-sm focus:outline-none disabled:opacity-50"
                                    style={{ background: 'var(--deep)', border: '1px solid var(--overlay-hover)', color: 'var(--text-primary)', outlineColor: 'var(--accent-indigo)' }}
                                    autoFocus
                                />
                                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                                    {samples.length} sample{samples.length !== 1 ? 's' : ''} will be saved
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-6 h-6 rounded-full animate-spin" style={{ border: '2px solid color-mix(in srgb, var(--accent-indigo) 30%, transparent)', borderTopColor: 'var(--accent-indigo)' }} />
                                </div>
                            ) : savedSessions.length === 0 ? (
                                <div className="text-center py-8" style={{ color: 'var(--text-faint)' }}>
                                    <FileAudio className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No saved sessions</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {savedSessions.map((session) => (
                                        <div
                                            key={session.id}
                                            onClick={() => handleLoad(session.id)}
                                            className="p-3 rounded-md transition-colors cursor-pointer group"
                                            style={{ background: 'var(--deep)', border: '1px solid var(--overlay-hover)' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent-indigo) 50%, transparent)'; e.currentTarget.style.background = 'var(--overlay)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--overlay-hover)'; e.currentTarget.style.background = 'var(--deep)'; }}
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                                        {session.name}
                                                    </h3>
                                                    <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                                                        <span className="flex items-center gap-1">
                                                            <FileAudio className="w-3 h-3" />
                                                            {session.sampleCount} sample{session.sampleCount !== 1 ? 's' : ''}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {formatDate(session.updatedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 ml-2">
                                                    {isLoadingSession === session.id ? (
                                                        <div className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid color-mix(in srgb, var(--accent-indigo) 30%, transparent)', borderTopColor: 'var(--accent-indigo)' }} />
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={(e) => handleDelete(session.id, e)}
                                                                className="p-1.5 opacity-0 group-hover:opacity-100 rounded transition-all"
                                                                style={{ color: 'var(--text-muted)' }}
                                                                onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--danger) 20%, transparent)'; e.currentTarget.style.color = 'var(--danger)'; }}
                                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                                                title="Delete session"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Message */}
                    {message && (
                        <div
                            className="p-3 rounded-md"
                            style={message.type === 'success'
                                ? { background: 'var(--success-muted)', border: '1px solid color-mix(in srgb, var(--success) 50%, transparent)', color: 'var(--success)' }
                                : { background: 'var(--danger-muted)', border: '1px solid color-mix(in srgb, var(--danger) 50%, transparent)', color: 'var(--danger)' }
                            }
                        >
                            <p className="text-sm">{message.text}</p>
                        </div>
                    )}

                    {/* Actions */}
                    {mode === 'save' && (
                        <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: '1px solid var(--overlay-hover)' }}>
                            <Button size="lg" variant="ghost" onClick={onClose} disabled={isSaving}>
                                Cancel
                            </Button>
                            <Button
                                size="lg"
                                variant="primary"
                                icon={isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check />}
                                onClick={handleSave}
                                disabled={isSaving || !sessionName.trim()}
                            >
                                {isSaving ? 'Saving...' : 'Save Session'}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

