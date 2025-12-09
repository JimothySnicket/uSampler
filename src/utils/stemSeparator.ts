/**
 * Stem Separation using TensorFlow.js
 * 
 * Separates audio into stems (vocals, drums, bass, other) using
 * pre-trained models. Supports both browser-based and server-side approaches.
 */

import { audioBufferToWav } from './audioUtils';

export interface StemSeparationResult {
    vocals?: AudioBuffer;
    drums?: AudioBuffer;
    bass?: AudioBuffer;
    other?: AudioBuffer;
    accompaniment?: AudioBuffer; // Combined non-vocal stems
}

export interface StemSeparationOptions {
    modelType?: '2stems' | '4stems' | '5stems'; // Number of stems to separate
    quality?: 'low' | 'medium' | 'high'; // Processing quality
    useServer?: boolean; // Use server-side processing if available
}

/**
 * Separate audio into stems using TensorFlow.js (browser-based)
 * 
 * Note: This is a placeholder implementation. Full implementation requires:
 * - Loading TensorFlow.js models (Spleeter or Open-Unmix)
 * - Model files can be large (50-200MB), consider lazy loading
 * - May need Web Workers for processing to avoid blocking UI
 * 
 * To use: npm install @tensorflow/tfjs
 */
export async function separateStems(
    buffer: AudioBuffer,
    options: StemSeparationOptions = {}
): Promise<StemSeparationResult | null> {
    const { modelType = '4stems', quality = 'medium', useServer = false } = options;
    
    try {
        // Check if TensorFlow.js is available (dynamic import to avoid compile-time dependency)
        let tf: any;
        try {
            // Dynamic import using string - TypeScript won't check this at compile time
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const tfModulePath = '@tensorflow/tfjs';
            const tfModule = await import(/* @ts-ignore */ tfModulePath);
            tf = tfModule.default || tfModule;
        } catch (err: any) {
            // Handle module not found or CSP violations gracefully
            if (err.code === 'MODULE_NOT_FOUND' || 
                err.message?.includes('Cannot find module') ||
                err.message?.includes('Failed to resolve module specifier') ||
                err.name === 'TypeError') {
                console.warn('TensorFlow.js not available. Stem separation requires TensorFlow.js and model files.');
                console.warn('This feature is not implemented for browser extensions due to size constraints.');
                return null;
            }
            throw err;
        }
        
        // For now, return null with a message that this requires model setup
        // Full implementation would:
        // 1. Load the appropriate model (Spleeter 2/4/5 stems or Open-Unmix)
        //    - Models can be loaded from URLs or local files
        //    - Example: await tf.loadLayersModel('path/to/model.json')
        // 2. Convert AudioBuffer to tensor format
        //    - Reshape audio data to model input shape
        //    - Normalize if required by model
        // 3. Run inference
        //    - const predictions = model.predict(audioTensor)
        // 4. Convert results back to AudioBuffer
        //    - Extract each stem from predictions
        //    - Create AudioBuffer for each stem
        
        // Stem separation not implemented for browser extensions
        // Would require TensorFlow.js and large model files (50-200MB+)
        // Use server-side separation instead
        return null;
    } catch (error) {
        console.error('Stem separation error:', error);
        return null;
    }
}

/**
 * Separate audio into stems using server-side API
 * This calls a backend service that runs Spleeter/Demucs/Open-Unmix
 * 
 * API Contract:
 * - POST request to {apiEndpoint}/separate
 * - multipart/form-data with 'audio' file and 'model' parameter
 * - Returns JSON with stem data (base64 or URLs)
 */
export async function separateStemsServer(
    buffer: AudioBuffer,
    apiEndpoint: string,
    options: StemSeparationOptions = {}
): Promise<StemSeparationResult | null> {
    const { modelType = '4stems' } = options;
    
    if (!apiEndpoint) {
        console.warn('Server endpoint not configured for stem separation');
        return null;
    }
    
    try {
        // Convert AudioBuffer to WAV blob
        const blob = audioBufferToWav(buffer);
        
        // Create FormData
        const formData = new FormData();
        formData.append('audio', blob, 'audio.wav');
        formData.append('model', modelType);
        
        // Send to server with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
        
        const response = await fetch(`${apiEndpoint}/separate`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error (${response.status}): ${errorText || response.statusText}`);
        }
        
        const result = await response.json();
        
        // Convert returned audio data to AudioBuffers
        // Server can return base64 encoded audio, URLs, or direct audio data
        const stems: StemSeparationResult = {};
        const sampleRate = buffer.sampleRate;
        
        // Helper to convert response data to AudioBuffer
        const decodeStem = async (data: string | ArrayBuffer | Blob | null | undefined): Promise<AudioBuffer | undefined> => {
            if (!data) return undefined;
            
            try {
                let arrayBuffer: ArrayBuffer;
                
                if (typeof data === 'string') {
                    // Assume base64 encoded
                    const binaryString = atob(data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    arrayBuffer = bytes.buffer;
                } else if (data instanceof Blob) {
                    arrayBuffer = await data.arrayBuffer();
                } else if (data instanceof ArrayBuffer) {
                    arrayBuffer = data;
                } else {
                    console.warn('Unknown stem data format:', typeof data);
                    return undefined;
                }
                
                // Decode audio
                const audioContext = new AudioContext({ sampleRate });
                return await audioContext.decodeAudioData(arrayBuffer.slice(0));
            } catch (error) {
                console.error('Error decoding stem audio:', error);
                return undefined;
            }
        };
        
        // Process each stem if present in response
        if (result.vocals) stems.vocals = await decodeStem(result.vocals);
        if (result.drums) stems.drums = await decodeStem(result.drums);
        if (result.bass) stems.bass = await decodeStem(result.bass);
        if (result.other) stems.other = await decodeStem(result.other);
        if (result.accompaniment) stems.accompaniment = await decodeStem(result.accompaniment);
        
        // If no stems were decoded, return null
        if (!stems.vocals && !stems.drums && !stems.bass && !stems.other && !stems.accompaniment) {
            console.warn('No valid stems found in server response');
            return null;
        }
        
        return stems;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('Server stem separation timeout');
        } else {
            console.error('Server stem separation error:', error);
        }
        return null;
    }
}


