/**
 * IndexedDB storage utilities for AudioBuffer persistence
 * Handles serialization and deserialization of AudioBuffers
 */

import { Sample, Chop } from '../../types';

export interface StoredSample {
    id: string;
    audioData: ArrayBuffer;
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    metadata: {
        name: string;
        duration: string;
        bpm: number | string;
        chops?: Chop[];
        detectedKey?: {
            key: string;
            mode: 'major' | 'minor';
            confidence: number;
        };
        detectedBPM?: number;
        waveform?: number[];
        tags?: string[];
        trimStart?: number;
        trimEnd?: number;
    };
}

export interface SavedSession {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    samples: StoredSample[];
}

const DB_NAME = 'uSamplerDB';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_SAMPLES = 'samples';

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB database
 */
export async function initDB(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Create sessions store
            if (!database.objectStoreNames.contains(STORE_SESSIONS)) {
                const sessionsStore = database.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
                sessionsStore.createIndex('name', 'name', { unique: false });
                sessionsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Create samples store (for individual sample storage if needed)
            if (!database.objectStoreNames.contains(STORE_SAMPLES)) {
                database.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
            }
        };
    });
}

/**
 * Convert AudioBuffer to ArrayBuffer for storage
 */
async function audioBufferToArrayBuffer(buffer: AudioBuffer): Promise<ArrayBuffer> {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    // Create a buffer to hold all channel data
    const totalLength = length * numChannels * 4; // 4 bytes per float32
    const arrayBuffer = new ArrayBuffer(totalLength + 16); // +16 for metadata
    const view = new DataView(arrayBuffer);
    
    // Store metadata at the start
    view.setUint32(0, numChannels, true);
    view.setUint32(4, length, true);
    view.setFloat32(8, sampleRate, true);
    view.setUint32(12, 0, true); // Reserved
    
    // Copy channel data
    let offset = 16;
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            view.setFloat32(offset, channelData[i], true);
            offset += 4;
        }
    }
    
    return arrayBuffer;
}

/**
 * Convert ArrayBuffer back to AudioBuffer
 */
async function arrayBufferToAudioBuffer(
    arrayBuffer: ArrayBuffer,
    audioContext: AudioContext
): Promise<AudioBuffer> {
    const view = new DataView(arrayBuffer);
    
    // Read metadata
    const numChannels = view.getUint32(0, true);
    const length = view.getUint32(4, true);
    const sampleRate = view.getFloat32(8, true);
    
    // Create AudioBuffer
    const buffer = audioContext.createBuffer(numChannels, length, sampleRate);
    
    // Copy channel data
    let offset = 16;
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            channelData[i] = view.getFloat32(offset, true);
            offset += 4;
        }
    }
    
    return buffer;
}

/**
 * Serialize Sample to StoredSample
 */
export async function serializeSample(sample: Sample): Promise<StoredSample> {
    if (!sample.buffer) {
        throw new Error('Sample must have an AudioBuffer to serialize');
    }

    const audioData = await audioBufferToArrayBuffer(sample.buffer);

    return {
        id: sample.id,
        audioData,
        sampleRate: sample.buffer.sampleRate,
        numberOfChannels: sample.buffer.numberOfChannels,
        length: sample.buffer.length,
        metadata: {
            name: sample.name,
            duration: sample.duration,
            bpm: sample.bpm,
            chops: sample.chops,
            detectedKey: sample.detectedKey,
            detectedBPM: sample.detectedBPM,
            waveform: sample.waveform,
            tags: sample.tags,
            trimStart: sample.trimStart,
            trimEnd: sample.trimEnd
        }
    };
}

/**
 * Deserialize StoredSample back to Sample
 */
export async function deserializeSample(
    stored: StoredSample,
    audioContext: AudioContext
): Promise<Sample> {
    const buffer = await arrayBufferToAudioBuffer(stored.audioData, audioContext);

    return {
        id: stored.id,
        name: stored.metadata.name,
        duration: stored.metadata.duration,
        bpm: stored.metadata.bpm,
        size: `${(stored.audioData.byteLength / 1024 / 1024).toFixed(2)} MB`,
        waveform: stored.metadata.waveform || [],
        tags: stored.metadata.tags || [],
        buffer,
        blob: undefined, // Will be regenerated if needed
        trimStart: stored.metadata.trimStart,
        trimEnd: stored.metadata.trimEnd,
        chops: stored.metadata.chops,
        detectedKey: stored.metadata.detectedKey,
        detectedBPM: stored.metadata.detectedBPM
    };
}

/**
 * Save a session to IndexedDB
 */
export async function saveSession(
    name: string,
    samples: Sample[]
): Promise<string> {
    const database = await initDB();
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    // Serialize all samples
    const storedSamples: StoredSample[] = [];
    for (const sample of samples) {
        if (sample.buffer) {
            const stored = await serializeSample(sample);
            storedSamples.push(stored);
        }
    }
    
    const session: SavedSession = {
        id: sessionId,
        name: name || `Session ${new Date().toLocaleString()}`,
        createdAt: now,
        updatedAt: now,
        samples: storedSamples
    };
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_SESSIONS], 'readwrite');
        const store = transaction.objectStore(STORE_SESSIONS);
        const request = store.add(session);
        
        request.onsuccess = () => resolve(sessionId);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Load a session from IndexedDB
 */
export async function loadSession(
    sessionId: string,
    audioContext: AudioContext
): Promise<Sample[]> {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_SESSIONS], 'readonly');
        const store = transaction.objectStore(STORE_SESSIONS);
        const request = store.get(sessionId);
        
        request.onsuccess = async () => {
            const session: SavedSession = request.result;
            if (!session) {
                reject(new Error('Session not found'));
                return;
            }
            
            // Deserialize all samples
            const samples: Sample[] = [];
            for (const stored of session.samples) {
                try {
                    const sample = await deserializeSample(stored, audioContext);
                    samples.push(sample);
                } catch (error) {
                    console.error('Failed to deserialize sample:', error);
                }
            }
            
            resolve(samples);
        };
        
        request.onerror = () => reject(request.error);
    });
}

/**
 * List all saved sessions
 */
export async function listSessions(): Promise<Array<{ id: string; name: string; createdAt: number; updatedAt: number; sampleCount: number }>> {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_SESSIONS], 'readonly');
        const store = transaction.objectStore(STORE_SESSIONS);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const sessions: SavedSession[] = request.result;
            const list = sessions.map(s => ({
                id: s.id,
                name: s.name,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
                sampleCount: s.samples.length
            }));
            // Sort by updatedAt descending (most recent first)
            list.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(list);
        };
        
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a session
 */
export async function deleteSession(sessionId: string): Promise<void> {
    const database = await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_SESSIONS], 'readwrite');
        const store = transaction.objectStore(STORE_SESSIONS);
        const request = store.delete(sessionId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}









