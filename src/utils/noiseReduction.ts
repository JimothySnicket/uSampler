/**
 * Noise Reduction using RNNoise and Spectral Gating
 * 
 * Supports both RNNoise (WebAssembly) and spectral gating methods.
 * RNNoise is optimized for speech but works well for music too.
 */

export interface NoiseReductionOptions {
    method?: 'rnnoise' | 'spectral';
    aggressiveness?: number; // 0-1 (Legacy)
    sensitivity?: number; // 0-1, Threshold (what is noise)
    amount?: number; // 0-1, How much to reduce
}

/**
 * Spectral gating noise reduction using Web Audio API
 * Simple but effective for general noise reduction
 */
function spectralGating(
    buffer: AudioBuffer,
    options: NoiseReductionOptions = {}
): AudioBuffer {
    // Map legacy aggressiveness if needed
    const sensitivity = options.sensitivity !== undefined ? options.sensitivity : (options.aggressiveness ?? 0.5);
    const amount = options.amount !== undefined ? options.amount : (options.aggressiveness ?? 0.5);
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;

    // Create offline context for processing
    const context = new OfflineAudioContext(numChannels, length, sampleRate);
    const source = context.createBufferSource();
    const analyser = context.createAnalyser();
    const gainNode = context.createGain();

    // Set analyser parameters
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    // Create output buffer
    const outputBuffer = context.createBuffer(numChannels, length, sampleRate);

    // Process each channel
    for (let channel = 0; channel < numChannels; channel++) {
        const inputData = buffer.getChannelData(channel);
        const outputData = outputBuffer.getChannelData(channel);

        // Calculate noise floor from first 0.5 seconds
        const noiseSampleLength = Math.min(Math.floor(sampleRate * 0.5), length);
        let noiseEnergy = 0;
        for (let i = 0; i < noiseSampleLength; i++) {
            noiseEnergy += inputData[i] * inputData[i];
        }
        const noiseFloor = Math.sqrt(noiseEnergy / noiseSampleLength);
        // Sensitivity controls multiple of noise floor. 
        // 0.0 -> 1.0x noise floor (very conservative)
        // 0.5 -> 2.0x noise floor
        // 1.0 -> 4.0x noise floor (aggressive classification)
        const thresholdMultiplier = 1 + (sensitivity * 3);
        const threshold = noiseFloor * thresholdMultiplier;

        // Process in frames
        const frameSize = 512;
        for (let i = 0; i < length; i += frameSize) {
            const frameEnd = Math.min(i + frameSize, length);

            // Calculate frame energy
            let frameEnergy = 0;
            for (let j = i; j < frameEnd; j++) {
                frameEnergy += inputData[j] * inputData[j];
            }
            const frameRMS = Math.sqrt(frameEnergy / (frameEnd - i));

            // Apply gating
            // Gain reduction based on how far below threshold we are
            let gain = 1.0;

            if (frameRMS < threshold) {
                // We are in noise territory
                // Amount 0.0 -> Gain 1.0 (no reduction)
                // Amount 1.0 -> Gain 0.0 (silence)

                // Smooth falloff
                const ratio = frameRMS / threshold; // 0 to 1
                gain = ratio + (1 - ratio) * (1 - amount);

                // Apply exponential curve for more natural sounding gate
                gain = Math.pow(gain, 1.5);
            }

            // Apply gate to frame
            for (let j = i; j < frameEnd; j++) {
                outputData[j] = inputData[j] * gain;
            }
        }

        // Smooth transitions to avoid artifacts
        const smoothingWindow = 64;
        for (let i = smoothingWindow; i < length - smoothingWindow; i++) {
            let sum = 0;
            for (let j = -smoothingWindow; j <= smoothingWindow; j++) {
                sum += outputData[i + j];
            }
            outputData[i] = sum / (smoothingWindow * 2 + 1);
        }
    }

    return outputBuffer;
}

// RNNoise processor cache
let rnnoiseProcessor: any = null;
let rnnoiseModule: any = null;

/**
 * Initialize RNNoise processor (lazy loading)
 * 
 * Note: @timephy/rnnoise-wasm doesn't export RnnoiseProcessor directly.
 * We'll use the AudioWorklet approach or fall back to spectral gating.
 * For now, using spectral gating as RNNoise integration requires AudioWorklet setup.
 */
async function initRNNoise(): Promise<any> {
    // RNNoise package is designed for AudioWorklet, not direct offline processing
    // For offline processing, we'll use spectral gating instead
    // AudioWorklet integration would require real-time audio stream processing
    throw new Error('RNNoise AudioWorklet integration not yet implemented. Using spectral gating fallback.');
}

/**
 * Simple linear resampling
 */
function resampleAudio(data: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return data;

    const ratio = toRate / fromRate;
    const newLength = Math.floor(data.length * ratio);
    const resampled = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const srcIndex = i / ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, data.length - 1);
        const t = srcIndex - srcIndexFloor;
        resampled[i] = data[srcIndexFloor] * (1 - t) + data[srcIndexCeil] * t;
    }

    return resampled;
}

/**
 * RNNoise WebAssembly implementation using @timephy/rnnoise-wasm
 * 
 * Note: The @timephy/rnnoise-wasm package is designed for AudioWorklet (real-time processing).
 * For offline processing, we fall back to spectral gating which works well for most cases.
 * 
 * Future: Could implement AudioWorklet-based processing for real-time streams.
 */
async function rnnoiseReduction(
    buffer: AudioBuffer,
    aggressiveness: number = 0.5
): Promise<AudioBuffer> {
    try {
        // Try to initialize RNNoise processor
        // This will fail and fall back to spectral gating for now
        const processor = await initRNNoise();

        // RNNoise requires 44.1kHz mono audio, processes in frames of 480 samples (~10.9ms)
        const sampleRate = buffer.sampleRate;
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const requiredSampleRate = processor.getRequiredPCMFrequency(); // Should be 44100
        const frameSize = processor.getSampleLength(); // Should be 480

        // Convert to mono if needed
        let monoData: Float32Array;
        if (numChannels === 1) {
            monoData = buffer.getChannelData(0);
        } else {
            monoData = new Float32Array(length);
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            for (let i = 0; i < length; i++) {
                monoData[i] = (left[i] + right[i]) / 2;
            }
        }

        // Resample to required sample rate (48kHz)
        let processedData = resampleAudio(monoData, sampleRate, requiredSampleRate);

        // Process with RNNoise frame by frame
        const numFrames = Math.floor(processedData.length / frameSize);
        const denoisedData = new Float32Array(processedData.length);

        for (let i = 0; i < numFrames; i++) {
            const frameStart = i * frameSize;
            const frame = processedData.slice(frameStart, frameStart + frameSize);

            // Create a copy for processing (RNNoise modifies in place)
            const frameCopy = new Float32Array(frame);

            // Process frame through RNNoise (shouldDenoise = true)
            processor.processAudioFrame(frameCopy, true);

            // Apply aggressiveness control (blend original and denoised)
            for (let j = 0; j < frameSize; j++) {
                const original = frame[j];
                const denoised = frameCopy[j];
                // Blend based on aggressiveness: 0 = original, 1 = fully denoised
                denoisedData[frameStart + j] = original * (1 - aggressiveness) + denoised * aggressiveness;
            }
        }

        // Handle remaining samples (pad with zeros or copy as-is)
        const remainingStart = numFrames * frameSize;
        for (let i = remainingStart; i < processedData.length; i++) {
            denoisedData[i] = processedData[i];
        }

        // Resample back to original sample rate if needed
        let finalData = resampleAudio(denoisedData, requiredSampleRate, sampleRate);

        // Create output AudioBuffer
        const audioContext = new OfflineAudioContext(numChannels, finalData.length, sampleRate);
        const outputBuffer = audioContext.createBuffer(numChannels, finalData.length, sampleRate);

        // Copy to all channels
        for (let channel = 0; channel < numChannels; channel++) {
            outputBuffer.getChannelData(channel).set(finalData);
        }

        return outputBuffer;

    } catch (error) {
        console.warn('RNNoise processing failed, falling back to spectral gating:', error);
        return spectralGating(buffer, { aggressiveness });
    }
}

/**
 * Reduce noise in audio buffer
 * 
 * @param buffer - Audio buffer to process
 * @param options - Processing options
 * @returns Processed audio buffer with reduced noise
 */
export async function reduceNoise(
    buffer: AudioBuffer,
    options: NoiseReductionOptions = {}
): Promise<AudioBuffer> {
    const { method = 'spectral', aggressiveness = 0.5 } = options;

    // Clamp aggressiveness to [0, 1]
    const clampedAggressiveness = Math.max(0, Math.min(1, aggressiveness));

    try {
        if (method === 'rnnoise') {
            return await rnnoiseReduction(buffer, clampedAggressiveness);
        } else {
            return spectralGating(buffer, options);
        }
    } catch (error) {
        console.error('Noise reduction error:', error);
        // Return original buffer if processing fails
        return buffer;
    }
}

/**
 * Reduce noise with progress callback (for long audio files)
 */
export async function reduceNoiseWithProgress(
    buffer: AudioBuffer,
    options: NoiseReductionOptions = {},
    onProgress?: (progress: number) => void
): Promise<AudioBuffer> {
    const { method = 'spectral', aggressiveness = 0.5 } = options;

    // For now, process entire buffer at once
    // Future: chunk processing for very long files
    if (onProgress) {
        onProgress(0);
    }

    const result = await reduceNoise(buffer, options);

    if (onProgress) {
        onProgress(1);
    }

    return result;
}

