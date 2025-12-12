import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, X, Check, Trash2, Clock, FileAudio } from 'lucide-react';
import { saveSession, loadSession, listSessions, deleteSession } from '../src/utils/storageUtils';
import { Sample } from '../types';

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
            console.error('Failed to load sessions:', error);
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
            console.error('Failed to save session:', error);
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
            console.error('Failed to load session:', error);
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
            console.error('Failed to delete session:', error);
            setMessage({ type: 'error', text: 'Failed to delete session' });
        }
    };

    if (!isOpen) return null;

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        {mode === 'save' ? (
                            <Save className="w-5 h-5 text-indigo-400" />
                        ) : (
                            <FolderOpen className="w-5 h-5 text-indigo-400" />
                        )}
                        <h2 className="text-lg font-bold text-zinc-200">
                            {mode === 'save' ? 'Save Session' : 'Load Session'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
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
                                <label className="block text-sm font-medium text-zinc-300">
                                    Session Name
                                </label>
                                <input
                                    type="text"
                                    value={sessionName}
                                    onChange={(e) => setSessionName(e.target.value)}
                                    placeholder="My Session"
                                    disabled={isSaving}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                                    autoFocus
                                />
                                <p className="text-xs text-zinc-500">
                                    {samples.length} sample{samples.length !== 1 ? 's' : ''} will be saved
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                </div>
                            ) : savedSessions.length === 0 ? (
                                <div className="text-center py-8 text-zinc-500">
                                    <FileAudio className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No saved sessions</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {savedSessions.map((session) => (
                                        <div
                                            key={session.id}
                                            onClick={() => handleLoad(session.id)}
                                            className="p-3 bg-zinc-950 border border-zinc-800 rounded-md hover:border-indigo-500/50 hover:bg-zinc-900 transition-colors cursor-pointer group"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-medium text-zinc-200 truncate">
                                                        {session.name}
                                                    </h3>
                                                    <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
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
                                                        <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={(e) => handleDelete(session.id, e)}
                                                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
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
                        <div className={`p-3 rounded-md ${
                            message.type === 'success' 
                                ? 'bg-green-500/10 border border-green-500/50 text-green-400' 
                                : 'bg-red-500/10 border border-red-500/50 text-red-400'
                        }`}>
                            <p className="text-sm">{message.text}</p>
                        </div>
                    )}

                    {/* Actions */}
                    {mode === 'save' && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                            <button
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !sessionName.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Save Session
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

