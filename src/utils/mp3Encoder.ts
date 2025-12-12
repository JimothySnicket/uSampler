/**
 * MP3 encoding utility using lamejs
 * Converts AudioBuffer to MP3 format
 */

// Chrome API type declaration
declare const chrome: {
    runtime?: {
        getURL?: (path: string) => string;
    };
} | undefined;

// Lazy load lamejs from public folder as a script tag
// lame.all.js needs to execute as a script to create the global lamejs object properly
let lamejsPromise: Promise<any> | null = null;

async function loadLamejs(): Promise<any> {
    if (lamejsPromise) {
        return lamejsPromise;
    }
    
    lamejsPromise = (async () => {
        try {
            // Check if already loaded on window
            if (typeof window !== 'undefined' && (window as any).lamejs && (window as any).lamejs.Mp3Encoder) {
                console.log('[mp3Encoder] lamejs already loaded on window');
                return (window as any).lamejs;
            }
            
            // Load lame.all.js as a script tag
            // For Chrome extensions, use chrome.runtime.getURL if available, otherwise use relative path
            return new Promise((resolve, reject) => {
                // Check if script already exists
                const existingScript = document.querySelector('script[src*="lame.all.js"]');
                if (existingScript) {
                    // Script already loaded, check if lamejs is available
                    if (typeof (window as any).lamejs !== 'undefined' && (window as any).lamejs.Mp3Encoder) {
                        console.log('[mp3Encoder] lamejs already loaded from existing script');
                        resolve((window as any).lamejs);
                        return;
                    }
                }
                
                const script = document.createElement('script');
                
                // Determine the correct path
                let scriptPath = '/lame.all.js';
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    scriptPath = chrome.runtime.getURL('lame.all.js');
                }
                
                script.src = scriptPath;
                script.onload = () => {
                    // Wait a moment for the script to execute (lame.all.js calls lamejs() at the end)
                    setTimeout(() => {
                        if (typeof (window as any).lamejs !== 'undefined' && (window as any).lamejs.Mp3Encoder) {
                            console.log('[mp3Encoder] lamejs loaded successfully from script tag');
                            resolve((window as any).lamejs);
                        } else {
                            console.error('[mp3Encoder] lamejs not found on window after script load');
                            console.error('[mp3Encoder] window.lamejs:', (window as any).lamejs);
                            reject(new Error('lamejs not found on window after script load. Check console for details.'));
                        }
                    }, 200);
                };
                script.onerror = (error) => {
                    console.error('[mp3Encoder] Failed to load lame.all.js script:', error);
                    console.error('[mp3Encoder] Script path attempted:', scriptPath);
                    reject(new Error(`Failed to load lame.all.js script from ${scriptPath}`));
                };
                document.head.appendChild(script);
            });
        } catch (error) {
            console.error('[mp3Encoder] Failed to load lamejs:', error);
            throw error;
        }
    })();
    
    return lamejsPromise;
}

export interface MP3EncodeOptions {
    /** Bitrate in kbps (default: 128) */
    bitrate?: number;
    /** Sample rate in Hz (default: 44100) */
    sampleRate?: number;
    /** Number of channels (1 = mono, 2 = stereo, default: uses buffer channels) */
    channels?: number;
}

/**
 * Convert AudioBuffer to MP3 Blob
 * @param buffer AudioBuffer to encode
 * @param options Encoding options
 * @returns Promise resolving to MP3 Blob
 * @throws Error if encoding fails
 */
export async function audioBufferToMp3(
    buffer: AudioBuffer,
    options: MP3EncodeOptions = {}
): Promise<Blob> {
    try {
        // Load lamejs dynamically
        console.log('[mp3Encoder] Loading lamejs...');
        const lamejs = await loadLamejs();
        
        // Check if lamejs is available with detailed logging
        console.log('[mp3Encoder] Checking lamejs availability...');
        console.log('[mp3Encoder] typeof lamejs:', typeof lamejs);
        console.log('[mp3Encoder] lamejs object:', lamejs);
        console.log('[mp3Encoder] lamejs keys:', lamejs ? Object.keys(lamejs) : 'lamejs is null/undefined');
        console.log('[mp3Encoder] lamejs.Mp3Encoder:', (lamejs as any)?.Mp3Encoder);
        
        if (typeof lamejs === 'undefined' || lamejs === null) {
            console.error('[mp3Encoder] lamejs is undefined/null - module not loaded');
            throw new Error('lamejs library is not loaded. MP3 encoding is not available. Please ensure lamejs is properly installed.');
        }
        
        // Access Mp3Encoder
        const Mp3Encoder = (lamejs as any).Mp3Encoder;
        
        if (!Mp3Encoder || typeof Mp3Encoder !== 'function') {
            console.error('[mp3Encoder] Mp3Encoder not found or not a function');
            console.error('[mp3Encoder] Available properties:', Object.keys(lamejs));
            console.error('[mp3Encoder] typeof Mp3Encoder:', typeof Mp3Encoder);
            throw new Error('lamejs.Mp3Encoder is not available or not a function. The library may not be properly initialized.');
        }
        
        console.log('[mp3Encoder] Mp3Encoder found, ready to encode');

        // Validate bitrate
        const validBitrates = [128, 192, 256, 320];
        const {
            bitrate = 128,
            sampleRate = buffer.sampleRate,
            channels = buffer.numberOfChannels
        } = options;

        if (!validBitrates.includes(bitrate)) {
            throw new Error(`Invalid MP3 bitrate: ${bitrate}. Valid bitrates are: ${validBitrates.join(', ')}`);
        }

        // Validate sample rate
        if (!sampleRate || sampleRate <= 0) {
            throw new Error(`Invalid sample rate: ${sampleRate}`);
        }

        // Ensure channels is valid (1 or 2)
        const numChannels = Math.min(Math.max(channels, 1), 2);
        
        // Validate buffer
        if (!buffer || !buffer.length || buffer.length === 0) {
            throw new Error('AudioBuffer is empty or invalid');
        }

        if (buffer.numberOfChannels < 1) {
            throw new Error(`Invalid channel count: ${buffer.numberOfChannels}`);
        }
        
        // Get channel data
        const leftChannel = buffer.getChannelData(0);
        if (!leftChannel || leftChannel.length === 0) {
            throw new Error('AudioBuffer channel data is empty');
        }

        const rightChannel = numChannels === 2 && buffer.numberOfChannels > 1
            ? buffer.getChannelData(1)
            : leftChannel; // Use mono if only one channel

        // Convert float32 samples to int16
        const samples = buffer.length;
        const left = new Int16Array(samples);
        const right = new Int16Array(samples);

        for (let i = 0; i < samples; i++) {
            // Clamp and convert to 16-bit integer
            const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
            const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));
            
            left[i] = leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF;
            right[i] = rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF;
        }

        // Create MP3 encoder
        let mp3encoder: any;
        try {
            // Get Mp3Encoder constructor
            const Mp3Encoder = (lamejs as any).Mp3Encoder;
            
            console.log(`[mp3Encoder] Creating encoder: ${numChannels}ch, ${sampleRate}Hz, ${bitrate}kbps`);
            console.log('[mp3Encoder] Mp3Encoder constructor:', typeof Mp3Encoder);
            console.log('[mp3Encoder] Mp3Encoder name:', Mp3Encoder?.name);
            
            if (typeof Mp3Encoder !== 'function') {
                throw new Error(`Mp3Encoder is not a function, got: ${typeof Mp3Encoder}`);
            }
            
            mp3encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);
            if (!mp3encoder) {
                throw new Error('Failed to create MP3 encoder instance - constructor returned null/undefined');
            }
            console.log('[mp3Encoder] Encoder created successfully:', mp3encoder);
        } catch (err) {
            console.error('[mp3Encoder] Failed to create encoder:', err);
            console.error('[mp3Encoder] Error stack:', err instanceof Error ? err.stack : 'No stack');
            const errorMsg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to initialize MP3 encoder: ${errorMsg}. Check console for details.`);
        }

        const sampleBlockSize = 1152; // MP3 frame size
        const mp3Data: Int8Array[] = [];

        // Encode in blocks
        for (let i = 0; i < samples; i += sampleBlockSize) {
            const leftChunk = left.subarray(i, i + sampleBlockSize);
            const rightChunk = numChannels === 2 ? right.subarray(i, i + sampleBlockSize) : leftChunk;
            
            try {
                const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
                if (mp3buf && mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
            } catch (err) {
                console.warn(`[mp3Encoder] Error encoding block at sample ${i}:`, err);
                // Continue encoding other blocks
            }
        }

        // Flush remaining data
        let finalBuf: Int8Array | null = null;
        try {
            finalBuf = mp3encoder.flush();
            if (finalBuf && finalBuf.length > 0) {
                mp3Data.push(finalBuf);
            }
        } catch (err) {
            console.warn('[mp3Encoder] Error flushing encoder:', err);
            // Continue even if flush fails
        }

        // Validate we have some encoded data
        if (mp3Data.length === 0) {
            throw new Error('MP3 encoding produced no data. The encoder may have failed.');
        }

        // Combine all MP3 data
        const totalLength = mp3Data.reduce((sum, arr) => sum + arr.length, 0);
        if (totalLength === 0) {
            throw new Error('MP3 encoding produced empty output');
        }

        const result = new Int8Array(totalLength);
        let offset = 0;
        for (const arr of mp3Data) {
            result.set(arr, offset);
            offset += arr.length;
        }

        const blob = new Blob([result], { type: 'audio/mpeg' });
        
        // Final validation
        if (!blob || blob.size === 0) {
            throw new Error('Failed to create MP3 blob: blob is empty');
        }

        console.log(`[mp3Encoder] Successfully encoded MP3: ${(blob.size / 1024).toFixed(2)} KB, ${numChannels}ch, ${sampleRate}Hz, ${bitrate}kbps`);
        return blob;
    } catch (error) {
        console.error('[mp3Encoder] MP3 encoding error:', error);
        if (error instanceof Error) {
            throw new Error(`MP3 encoding failed: ${error.message}`);
        }
        throw new Error('MP3 encoding failed: Unknown error');
    }
}

/**
 * Check if MP3 encoding is available
 * @returns true if lamejs is loaded
 */
export async function isMp3EncodingAvailable(): Promise<boolean> {
    try {
        const lamejs = await loadLamejs();
        return lamejs && typeof (lamejs as any).Mp3Encoder === 'function';
    } catch {
        return false;
    }
}







