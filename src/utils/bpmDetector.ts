/**
 * Advanced BPM Detection using multiple methods:
 * - Enhanced onset detection with multiple onset detection functions
 * - Autocorrelation on onset detection function
 * - Comb filter approach
 * - Multiple tempo candidates with voting
 */

export interface BPMDetectionResult {
    bpm: number;
    confidence?: number;
}

/**
 * Compute enhanced spectral flux for onset detection
 */
async function computeSpectralFlux(buffer: AudioBuffer, fftSize: number = 2048): Promise<number[]> {
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const hopSize = 512;
    
    // Get mono mix if stereo
    let audioData: Float32Array;
    if (numChannels === 1) {
        audioData = buffer.getChannelData(0);
    } else {
        audioData = new Float32Array(length);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < length; i++) {
            audioData[i] = (left[i] + right[i]) / 2;
        }
    }
    
    const spectralFlux: number[] = [];
    let previousSpectrum: Float32Array | null = null;
    
    // Process in frames
    const numFrames = Math.floor((length - fftSize) / hopSize);
    const maxFrames = Math.min(numFrames, 200); // More frames for better accuracy
    
    for (let f = 0; f < maxFrames; f++) {
        const start = f * hopSize;
        const end = Math.min(start + fftSize, length);
        const frameData = audioData.slice(start, end);
        
        if (frameData.length < 512) break;
        
        // Create context for FFT
        let context: OfflineAudioContext;
        try {
            context = new OfflineAudioContext(1, frameData.length, sampleRate);
        } catch (err) {
            console.warn('Failed to create OfflineAudioContext for BPM detection:', err);
            break; // Skip this frame
        }
        
        const source = context.createBufferSource();
        const frameBuffer = context.createBuffer(1, frameData.length, sampleRate);
        frameBuffer.getChannelData(0).set(frameData);
        source.buffer = frameBuffer;
        
        const analyser = context.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = 0;
        
        source.connect(analyser);
        analyser.connect(context.destination);
        
        source.start(0);
        
        try {
            await context.startRendering();
        } catch (err) {
            console.warn('Failed to render audio context for BPM detection:', err);
            break; // Skip this frame
        }
        
        const spectrum = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(spectrum);
        
        // Convert to magnitude with better weighting
        const magnitude = new Float32Array(spectrum.length);
        for (let i = 0; i < spectrum.length; i++) {
            magnitude[i] = Math.pow(10, spectrum[i] / 20);
        }
        
        // Calculate spectral flux (only positive differences)
        if (previousSpectrum) {
            let flux = 0;
            for (let i = 0; i < magnitude.length; i++) {
                const diff = magnitude[i] - previousSpectrum[i];
                if (diff > 0) {
                    flux += diff;
                }
            }
            spectralFlux.push(flux);
        }
        
        previousSpectrum = magnitude;
    }
    
    return spectralFlux;
}

/**
 * Compute energy envelope for onset detection
 */
function computeEnergyEnvelope(audioData: Float32Array, sampleRate: number): number[] {
    const frameSize = Math.floor(sampleRate * 0.023); // ~23ms frames
    const hopSize = Math.floor(frameSize / 4);
    const envelope: number[] = [];
    
    for (let i = 0; i < audioData.length - frameSize; i += hopSize) {
        let energy = 0;
        for (let j = 0; j < frameSize; j++) {
            energy += audioData[i + j] * audioData[i + j];
        }
        envelope.push(Math.sqrt(energy / frameSize));
    }
    
    return envelope;
}

/**
 * Compute autocorrelation of onset detection function
 */
function autocorrelateOnsetFunction(onsetFunction: number[], minPeriod: number, maxPeriod: number, sampleRate: number, hopSize: number): Map<number, number> {
    const autocorr = new Map<number, number>();
    
    // Convert periods to samples
    const minSamples = Math.floor(minPeriod * sampleRate / hopSize);
    const maxSamples = Math.floor(maxPeriod * sampleRate / hopSize);
    
    // Limit autocorrelation range
    const maxLag = Math.min(maxSamples, Math.floor(onsetFunction.length / 2));
    const minLag = Math.max(1, minSamples);
    
    for (let lag = minLag; lag <= maxLag; lag++) {
        let correlation = 0;
        let count = 0;
        
        for (let i = 0; i < onsetFunction.length - lag; i++) {
            correlation += onsetFunction[i] * onsetFunction[i + lag];
            count++;
        }
        
        if (count > 0) {
            // Normalize
            correlation /= count;
            
            // Convert lag to BPM
            const period = (lag * hopSize) / sampleRate;
            const bpm = 60 / period;
            
            if (bpm >= 60 && bpm <= 200) {
                const roundedBPM = Math.round(bpm);
                autocorr.set(roundedBPM, correlation);
            }
        }
    }
    
    return autocorr;
}

/**
 * Comb filter approach - emphasize periodicities at candidate tempos
 */
function combFilterAutocorrelation(onsetFunction: number[], candidateBPM: number, sampleRate: number, hopSize: number): number {
    const period = 60 / candidateBPM;
    const periodSamples = Math.floor(period * sampleRate / hopSize);
    
    if (periodSamples < 1 || periodSamples >= onsetFunction.length / 2) {
        return 0;
    }
    
    let correlation = 0;
    let count = 0;
    
    // Check multiple periods (1x, 2x, 3x)
    for (let multiple = 1; multiple <= 3; multiple++) {
        const lag = periodSamples * multiple;
        if (lag < onsetFunction.length / 2) {
            for (let i = 0; i < onsetFunction.length - lag; i++) {
                correlation += onsetFunction[i] * onsetFunction[i + lag];
                count++;
            }
        }
    }
    
    return count > 0 ? correlation / count : 0;
}

/**
 * Find tempo using comb filter approach with multiple candidates
 */
function findTempoCombFilter(onsetFunction: number[], sampleRate: number, hopSize: number): Map<number, number> {
    const scores = new Map<number, number>();
    
    // Test multiple BPM candidates
    for (let bpm = 60; bpm <= 200; bpm += 1) {
        const score = combFilterAutocorrelation(onsetFunction, bpm, sampleRate, hopSize);
        scores.set(bpm, score);
    }
    
    return scores;
}

/**
 * Detect BPM using multiple methods and combine results
 */
export async function detectBPM(buffer: AudioBuffer): Promise<BPMDetectionResult | null> {
    try {
        const sampleRate = buffer.sampleRate;
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const duration = length / sampleRate;
        
        // Need at least 2 seconds of audio
        if (duration < 2) {
            console.log('BPM detection: Audio too short');
            return null;
        }
        
        // Get mono mix if stereo
        let audioData: Float32Array;
        if (numChannels === 1) {
            audioData = buffer.getChannelData(0);
        } else {
            audioData = new Float32Array(length);
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            for (let i = 0; i < length; i++) {
                audioData[i] = (left[i] + right[i]) / 2;
            }
        }
        
        // Normalize audio
        let max = 0;
        for (let i = 0; i < audioData.length; i++) {
            const abs = Math.abs(audioData[i]);
            if (abs > max) max = abs;
        }
        if (max > 0 && max < 1) {
            for (let i = 0; i < audioData.length; i++) {
                audioData[i] /= max;
            }
        }
        
        // Method 1: Spectral Flux onset detection function
        const hopSize = 512;
        let onsetFunction: number[] = [];
        
        try {
            const spectralFlux = await computeSpectralFlux(buffer, 2048);
            
            // Normalize spectral flux
            if (spectralFlux.length > 0) {
                let maxFlux = Math.max(...spectralFlux);
                if (maxFlux > 0) {
                    onsetFunction = spectralFlux.map(f => f / maxFlux);
                }
            }
        } catch (err) {
            console.log('Spectral flux failed, using energy envelope');
        }
        
        // Fallback: Energy envelope if spectral flux is empty
        if (onsetFunction.length === 0) {
            const envelope = computeEnergyEnvelope(audioData, sampleRate);
            let maxEnv = Math.max(...envelope);
            if (maxEnv > 0) {
                // Compute derivative (onset detection function)
                const derivative: number[] = [];
                for (let i = 1; i < envelope.length; i++) {
                    const diff = Math.max(0, envelope[i] - envelope[i - 1]);
                    derivative.push(diff);
                }
                
                maxEnv = Math.max(...derivative);
                if (maxEnv > 0) {
                    onsetFunction = derivative.map(d => d / maxEnv);
                } else {
                    onsetFunction = envelope.map(e => e / Math.max(...envelope));
                }
            }
        }
        
        if (onsetFunction.length < 50) {
            console.log('BPM detection: Onset function too short');
            return null;
        }
        
        // Smooth the onset function slightly
        const smoothed: number[] = [];
        for (let i = 0; i < onsetFunction.length; i++) {
            let sum = onsetFunction[i];
            let count = 1;
            if (i > 0) { sum += onsetFunction[i - 1] * 0.5; count += 0.5; }
            if (i < onsetFunction.length - 1) { sum += onsetFunction[i + 1] * 0.5; count += 0.5; }
            smoothed.push(sum / count);
        }
        onsetFunction = smoothed;
        
        // Method 2: Autocorrelation on onset function
        const minPeriod = 60 / 200; // 200 BPM
        const maxPeriod = 60 / 60;  // 60 BPM
        const autocorrScores = autocorrelateOnsetFunction(onsetFunction, minPeriod, maxPeriod, sampleRate, hopSize);
        
        // Method 3: Comb filter approach
        const combFilterScores = findTempoCombFilter(onsetFunction, sampleRate, hopSize);
        
        // Combine scores from both methods
        const combinedScores = new Map<number, number>();
        
        // Normalize autocorrelation scores
        let maxAutocorr = 0;
        for (const score of autocorrScores.values()) {
            if (score > maxAutocorr) maxAutocorr = score;
        }
        
        // Normalize comb filter scores
        let maxComb = 0;
        for (const score of combFilterScores.values()) {
            if (score > maxComb) maxComb = score;
        }
        
        // Combine with weights (autocorrelation 60%, comb filter 40%)
        for (let bpm = 60; bpm <= 200; bpm++) {
            const autocorrScore = (autocorrScores.get(bpm) || 0) / Math.max(maxAutocorr, 0.001);
            const combScore = (combFilterScores.get(bpm) || 0) / Math.max(maxComb, 0.001);
            const combined = (autocorrScore * 0.6) + (combScore * 0.4);
            combinedScores.set(bpm, combined);
        }
        
        // Find peak and check nearby BPMs (account for half/double time)
        let bestBPM = 0;
        let bestScore = 0;
        
        for (const [bpm, score] of combinedScores.entries()) {
            // Also check half and double time
            const halfTimeScore = combinedScores.get(Math.round(bpm / 2)) || 0;
            const doubleTimeScore = combinedScores.get(Math.round(bpm * 2)) || 0;
            
            // Boost score if half/double time also has high scores
            let adjustedScore = score;
            if (halfTimeScore > 0.5) adjustedScore += halfTimeScore * 0.2;
            if (doubleTimeScore > 0.5) adjustedScore += doubleTimeScore * 0.2;
            
            if (adjustedScore > bestScore) {
                bestScore = adjustedScore;
                bestBPM = bpm;
            }
        }
        
        if (bestBPM === 0 || bestScore < 0.1) {
            console.log('BPM detection: No clear tempo found');
            return null;
        }
        
        // Calculate confidence
        // Check how much better this BPM is than others
        const scores = Array.from(combinedScores.values()).sort((a, b) => b - a);
        const secondBest = scores[1] || 0;
        const confidence = Math.min(1, (bestScore - secondBest) / Math.max(bestScore, 0.001) + 0.3);
        
        console.log(`BPM detection: Found ${bestBPM} BPM with confidence ${(confidence * 100).toFixed(0)}%`);
        
        return {
            bpm: bestBPM,
            confidence: Math.max(0.3, Math.min(1, confidence))
        };
    } catch (error) {
        console.error('BPM detection error:', error);
        return null;
    }
}

/**
 * Detect BPM with custom options
 */
export async function detectBPMWithOptions(
    buffer: AudioBuffer,
    options?: {
        minBPM?: number;
        maxBPM?: number;
    }
): Promise<BPMDetectionResult | null> {
    const result = await detectBPM(buffer);
    
    if (!result) return null;
    
    let bpm = result.bpm;
    const minBPM = options?.minBPM || 60;
    const maxBPM = options?.maxBPM || 200;
    
    // Check if BPM is in range, try half/double time
    if (bpm < minBPM) {
        if (bpm * 2 >= minBPM && bpm * 2 <= maxBPM) {
            bpm = bpm * 2;
        } else {
            return null;
        }
    } else if (bpm > maxBPM) {
        if (bpm / 2 >= minBPM && bpm / 2 <= maxBPM) {
            bpm = Math.round(bpm / 2);
        } else {
            return null;
        }
    }
    
    return {
        bpm,
        confidence: result.confidence
    };
}
