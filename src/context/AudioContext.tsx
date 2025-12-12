import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine, AudioState } from '../core/AudioEngine.js';

interface AudioContextType {
    engine: AudioEngine | null;
    state: string;
    isArmed: boolean;
    initialize: (streamId: string) => Promise<void>;
    toggleArm: () => void;
    startRecording: () => void;
    stopRecording: () => void;
    playSample: (sample: any, loop: boolean) => void;
    stopPlayback: () => void;
    selectSource: () => Promise<boolean>;
    setRecordingCallback: (callback: (blob: Blob, audioBuffer: AudioBuffer | null) => void) => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) throw new Error('useAudio must be used within an AudioProvider');
    return context;
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const engineRef = useRef<AudioEngine>(new AudioEngine());
    const [state, setState] = useState<string>(AudioState.IDLE);
    const [isArmed, setIsArmed] = useState(false);

    // Initialize audio context immediately
    useEffect(() => {
        if (engineRef.current && !engineRef.current.context) {
            engineRef.current.initContext();
        }
    }, []);

    // Callback setup
    const setRecordingCallback = (callback: (blob: Blob, audioBuffer: AudioBuffer | null) => void) => {
        if (engineRef.current) {
            engineRef.current.onRecordingStopped = (blob: Blob, audioBuffer: AudioBuffer | null) => {
                console.log('[AudioContext] Recording stopped callback fired');
                setState(AudioState.IDLE);
                engineRef.current?.stopThresholdMonitoring();
                callback(blob, audioBuffer);
            };
        }
    };

    // Threshold monitoring callback
    useEffect(() => {
        const engine = engineRef.current;
        engine.onThresholdExceeded = () => {
            console.log('[AudioContext] Threshold exceeded');
            if (engine.state === AudioState.ARMED) {
                engine.stopThresholdMonitoring();
                engine.startRecording();
                setState(AudioState.RECORDING);
                // Disarm when recording starts automatically from threshold
                setIsArmed(false);
            }
        };
    }, []);

    // Threshold monitoring loop
    useEffect(() => {
        if (!isArmed || state === AudioState.RECORDING) return;

        let animId: number;
        const monitor = () => {
            if (engineRef.current && isArmed && state === AudioState.ARMED) {
                engineRef.current.checkThreshold();
            }
            animId = requestAnimationFrame(monitor);
        };
        animId = requestAnimationFrame(monitor);

        return () => cancelAnimationFrame(animId);
    }, [isArmed, state]);

    const initialize = async (streamId: string) => {
        if (engineRef.current) {
            engineRef.current.initContext();
            if (streamId) {
                const success = await engineRef.current.connectStream(streamId);
                if (success) {
                    console.log('[AudioContext] Audio Stream Connected');
                } else {
                    console.error('[AudioContext] Audio Stream Connection Failed');
                }
            }
        }
    };

    const selectSource = async (): Promise<boolean> => {
        if (engineRef.current) {
            try {
                const success = await engineRef.current.connectDisplayMedia();
                if (success) {
                    console.log('[AudioContext] Source connected, Auto-Arming...');
                    // Atomic State Transition: Auto-Arm immediately
                    if (state !== AudioState.RECORDING) {
                        setState(AudioState.ARMED);
                        engineRef.current.state = AudioState.ARMED;
                        setIsArmed(true);
                        engineRef.current.startThresholdMonitoring();
                    }
                    return true;
                }
            } catch (err) {
                console.error('[AudioContext] Error selecting source:', err);
            }
        }
        return false;
    };

    const toggleArm = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;

        // Atomic state update - update all states synchronously
        if (state === AudioState.IDLE) {
            // Arm: Update React state first for immediate visual feedback
            setIsArmed(true);
            setState(AudioState.ARMED);
            // Then update engine state and start monitoring
            engine.state = AudioState.ARMED;
            engine.startThresholdMonitoring();
        } else if (state === AudioState.ARMED) {
            // Disarm: Update React state first for immediate visual feedback
            setIsArmed(false);
            setState(AudioState.IDLE);
            // Then update engine state and stop monitoring
            engine.state = AudioState.IDLE;
            engine.stopThresholdMonitoring();
        }
    }, [state]);

    const startRecording = () => {
        if (engineRef.current) {
            engineRef.current.stopThresholdMonitoring();
            const started = engineRef.current.startRecording();
            if (started) {
                setState(AudioState.RECORDING);
                // Disarm when recording starts - user can re-arm for next sample if needed
                setIsArmed(false);
            } else {
                console.error('[AudioContext] Failed to start recording');
                setState(AudioState.IDLE);
            }
        }
    };

    const stopRecording = () => {
        console.log('[AudioContext] stopRecording called');
        if (engineRef.current && state === AudioState.RECORDING) {
            engineRef.current.stopRecording();
            // Force state update to ensure UI doesn't get stuck if callback fails
            setState(AudioState.IDLE);
        }
    };

    const playSample = (sample: any, loop: boolean) => {
        if (engineRef.current) {
            engineRef.current.play(sample.buffer, sample.trimStart, sample.trimEnd, loop);
        }
    };

    const stopPlayback = () => {
        if (engineRef.current) {
            engineRef.current.stop();
        }
    };

    const value = {
        engine: engineRef.current,
        state,
        isArmed,
        initialize,
        toggleArm,
        startRecording,
        stopRecording,
        playSample,
        stopPlayback,
        selectSource,
        setRecordingCallback
    };

    return (
        <AudioContext.Provider value={value}>
            {children}
        </AudioContext.Provider>
    );
};

