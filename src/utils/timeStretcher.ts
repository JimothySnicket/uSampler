/**
 * Time Stretching using Web Audio API
 * 
 * Simple time stretching using playbackRate for real-time preview
 * and OfflineAudioContext for high-quality final processing
 */

export interface TimeStretchOptions {
    stretchRatio: number; // > 0, 1.0 = no change, 2.0 = double length
    method?: 'simple'; // Only simple method supported
    onProgress?: (progress: number) => void; // 0-1
}

export interface TimeStretchResult {
    buffer: AudioBuffer;
    duration: number; // New duration in seconds
}

/**
 * Simple time stretching using Web Audio API playbackRate
 * High quality using OfflineAudioContext
 */
async function simpleTimeStretch(
    buffer: AudioBuffer,
    stretchRatio: number
): Promise<AudioBuffer> {
    if (stretchRatio <= 0) {
        throw new Error('Stretch ratio must be greater than 0');
    }
    
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const inputLength = buffer.length;
    const outputLength = Math.floor(inputLength * stretchRatio);
    
    // Use OfflineAudioContext with playbackRate
    let context: OfflineAudioContext;
    try {
        context = new OfflineAudioContext(numChannels, outputLength, sampleRate);
    } catch (err) {
        throw new Error(`Failed to create OfflineAudioContext: ${err}`);
    }
    
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 / stretchRatio; // Inverse for time stretching
    
    source.connect(context.destination);
    source.start(0);
    
    try {
        return await context.startRendering();
    } catch (err) {
        throw new Error(`Failed to render audio context: ${err}`);
    }
}

/**
 * Main time stretching function
 */
export async function timeStretch(
    buffer: AudioBuffer,
    options: TimeStretchOptions
): Promise<AudioBuffer> {
    const { stretchRatio, onProgress } = options;
    
    // Validate stretch ratio
    if (!stretchRatio || stretchRatio <= 0 || !isFinite(stretchRatio)) {
        throw new Error(`Invalid stretch ratio: ${stretchRatio}`);
    }
    
    // Validate buffer
    if (!buffer || !buffer.length || !buffer.sampleRate) {
        throw new Error('Invalid audio buffer');
    }
    
    if (onProgress) onProgress(0.1);
    
    try {
        const result = await simpleTimeStretch(buffer, stretchRatio);
        if (onProgress) onProgress(1.0);
        return result;
    } catch (error) {
        console.error('Time stretch error:', error);
        throw error;
    }
}
