/**
 * Key Detection using Enhanced Chromagram Analysis
 * 
 * Implements improved key detection with:
 * - Better chromagram computation using multiple windows
 * - Temperley-Kostka-Payne key profiles (alternative to Krumhansl-Schmuckler)
 * - Weighted correlation emphasizing important chroma bins
 * - Harmonic content consideration
 */

export interface KeyDetectionResult {
    key: string; // e.g., "C", "C#", "D", etc.
    mode: 'major' | 'minor';
    confidence: number; // 0-1
    alternativeKeys?: Array<{ key: string; mode: 'major' | 'minor'; confidence: number }>;
}

// Krumhansl-Schmuckler key profiles (original)
const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Temperley-Kostka-Payne profiles (often more accurate)
const TKP_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TKP_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Weight factors for chroma bins (emphasize root, third, fifth)
const CHROMA_WEIGHTS = [1.2, 0.8, 1.0, 0.8, 1.1, 1.0, 0.9, 1.2, 0.8, 1.0, 0.8, 1.0];

/**
 * Compute chromagram with improved frequency mapping
 * Uses more windows and better harmonic content handling
 */
async function computeChromagram(buffer: AudioBuffer): Promise<number[]> {
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const fftSize = 4096;
    
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
    
    // Process in windows with overlap
    const hopSize = Math.floor(fftSize / 2);
    const numWindows = Math.max(1, Math.floor((length - fftSize) / hopSize));
    const chroma = new Array(12).fill(0);
    
    // Process more windows for better accuracy (up to 40)
    const windowsToProcess = Math.min(numWindows, 40);
    
    for (let w = 0; w < windowsToProcess; w++) {
        const start = w * hopSize;
        const end = Math.min(start + fftSize, length);
        const windowLength = end - start;
        
        if (windowLength < 512) break;
        
        // Create context for this window
        let context: OfflineAudioContext;
        try {
            context = new OfflineAudioContext(1, windowLength, sampleRate);
        } catch (err) {
            console.warn('Failed to create OfflineAudioContext for key detection:', err);
            continue; // Skip this window
        }
        
        const source = context.createBufferSource();
        const windowBuffer = context.createBuffer(1, windowLength, sampleRate);
        const windowData = audioData.slice(start, end);
        
        // Apply Hann window
        for (let i = 0; i < windowLength; i++) {
            windowData[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowLength - 1)));
        }
        
        windowBuffer.getChannelData(0).set(windowData);
        source.buffer = windowBuffer;
        
        const analyser = context.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = 0;
        
        source.connect(analyser);
        analyser.connect(context.destination);
        
        source.start(0);
        
        try {
            await context.startRendering();
        } catch (err) {
            console.warn('Failed to render audio context for key detection:', err);
            continue; // Skip this window
        }
        
        // Get frequency data as float (more accurate)
        const fftData = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(fftData);
        
        // Convert to chromagram with better frequency mapping
        const binFreq = sampleRate / fftSize;
        
        // Focus on multiple frequency ranges for better harmonic content
        const ranges = [
            { min: 80, max: 250 },   // Bass range (fundamentals)
            { min: 250, max: 1000 }, // Mid range (strong harmonics)
            { min: 1000, max: 3000 } // Upper range (weaker but still relevant)
        ];
        
        for (const range of ranges) {
            const weight = range.min < 250 ? 1.5 : range.min < 1000 ? 1.2 : 0.8; // Weight bass more
            
            for (let i = 1; i < fftData.length; i++) {
                const freq = i * binFreq;
                
                if (freq >= range.min && freq <= range.max) {
                    // Convert frequency to MIDI note number
                    const midiNote = 69 + 12 * Math.log2(freq / 440);
                    
                    // Map to chroma (12 semitones)
                    let chromaIndex = Math.floor(midiNote + 0.5) % 12;
                    if (chromaIndex < 0) chromaIndex += 12;
                    
                    // Convert dB to linear scale
                    const magnitude = Math.pow(10, fftData[i] / 20);
                    
                    // Also consider harmonics - check if this is a harmonic of a lower note
                    // This helps with instruments where overtones are stronger than fundamentals
                    for (let harmonic = 1; harmonic <= 4; harmonic++) {
                        const fundamentalFreq = freq / harmonic;
                        if (fundamentalFreq >= 80) {
                            const fundamentalMidi = 69 + 12 * Math.log2(fundamentalFreq / 440);
                            let fundamentalChroma = Math.floor(fundamentalMidi + 0.5) % 12;
                            if (fundamentalChroma < 0) fundamentalChroma += 12;
                            
                            // Add to both the actual chroma and the fundamental chroma
                            const harmonicWeight = 1.0 / harmonic;
                            chroma[chromaIndex] += magnitude * weight;
                            if (harmonic > 1) {
                                chroma[fundamentalChroma] += magnitude * weight * harmonicWeight * 0.5;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Apply chroma weights
    for (let i = 0; i < 12; i++) {
        chroma[i] *= CHROMA_WEIGHTS[i];
    }
    
    // Normalize
    const total = chroma.reduce((sum, val) => sum + val, 0);
    if (total > 0) {
        for (let i = 0; i < 12; i++) {
            chroma[i] /= total;
        }
    }
    
    return chroma;
}

/**
 * Weighted correlation with key profiles
 * Emphasizes important chroma bins (root, third, fifth)
 */
function correlateWithProfile(chroma: number[], profile: number[], useWeights: boolean = true): number {
    let correlation = 0;
    let chromaNorm = 0;
    let profileNorm = 0;
    
    for (let i = 0; i < 12; i++) {
        const weight = useWeights ? CHROMA_WEIGHTS[i] : 1.0;
        const weightedChroma = chroma[i] * weight;
        const weightedProfile = profile[i] * weight;
        
        correlation += weightedChroma * weightedProfile;
        chromaNorm += weightedChroma * weightedChroma;
        profileNorm += weightedProfile * weightedProfile;
    }
    
    const norm = Math.sqrt(chromaNorm * profileNorm);
    return norm > 0 ? correlation / norm : 0;
}

/**
 * Detect musical key from audio buffer
 * Uses both Krumhansl-Schmuckler and Temperley-Kostka-Payne profiles
 */
export async function detectKey(buffer: AudioBuffer): Promise<KeyDetectionResult> {
    try {
        // Compute chromagram
        const chroma = await computeChromagram(buffer);
        
        // Check if we have meaningful data
        const maxChroma = Math.max(...chroma);
        if (maxChroma < 0.01) {
            return {
                key: 'C',
                mode: 'major',
                confidence: 0.1
            };
        }
        
        // Correlate with all 24 key profiles using both profile sets
        const correlations: Array<{ key: string; mode: 'major' | 'minor'; correlation: number; method: string }> = [];
        
        for (let shift = 0; shift < 12; shift++) {
            // Rotate chroma for each key
            const rotatedChroma = [...chroma.slice(shift), ...chroma.slice(0, shift)];
            
            // Krumhansl-Schmuckler correlations
            const ksMajorCorr = correlateWithProfile(rotatedChroma, KS_MAJOR, true);
            const ksMinorCorr = correlateWithProfile(rotatedChroma, KS_MINOR, true);
            
            // Temperley-Kostka-Payne correlations
            const tkpMajorCorr = correlateWithProfile(rotatedChroma, TKP_MAJOR, true);
            const tkpMinorCorr = correlateWithProfile(rotatedChroma, TKP_MINOR, true);
            
            // Average both methods for better accuracy
            const avgMajorCorr = (ksMajorCorr + tkpMajorCorr) / 2;
            const avgMinorCorr = (ksMinorCorr + tkpMinorCorr) / 2;
            
            correlations.push({
                key: KEY_NAMES[shift],
                mode: 'major',
                correlation: avgMajorCorr,
                method: 'combined'
            });
            
            correlations.push({
                key: KEY_NAMES[shift],
                mode: 'minor',
                correlation: avgMinorCorr,
                method: 'combined'
            });
        }
        
        // Sort by correlation
        correlations.sort((a, b) => b.correlation - a.correlation);
        
        // Get top result
        const topResult = correlations[0];
        const secondResult = correlations[1];
        const thirdResult = correlations[2];
        
        // Calculate confidence
        const maxCorr = topResult.correlation;
        const secondCorr = secondResult?.correlation || 0;
        const thirdCorr = thirdResult?.correlation || 0;
        
        // Confidence based on:
        // 1. How much better the top result is than the second
        // 2. The absolute correlation value
        // 3. How consistent the top few results are
        const correlationDiff = maxCorr - secondCorr;
        const relativeConfidence = correlationDiff / Math.max(maxCorr, 0.001);
        const absoluteConfidence = Math.min(1, maxCorr * 2); // Scale absolute correlation
        
        // Combine both confidence measures
        let confidence = (relativeConfidence * 0.6) + (absoluteConfidence * 0.4);
        
        // Boost if correlation is very high
        if (maxCorr > 0.6) {
            confidence = Math.min(1, confidence * 1.3);
        }
        
        // Reduce if second and third are very close (uncertainty)
        if (secondCorr > maxCorr * 0.9 && thirdCorr > maxCorr * 0.85) {
            confidence *= 0.7;
        }
        
        // Ensure minimum confidence
        confidence = Math.max(0.2, Math.min(1, confidence));
        
        // Get alternative keys (top 3)
        const alternatives = correlations.slice(1, 4).map(c => ({
            key: c.key,
            mode: c.mode,
            confidence: Math.max(0, Math.min(1, (c.correlation / maxCorr) * confidence))
        }));
        
        return {
            key: topResult.key,
            mode: topResult.mode,
            confidence: confidence,
            alternativeKeys: alternatives
        };
    } catch (error) {
        console.error('Key detection error:', error);
        // Return fallback
        return {
            key: 'C',
            mode: 'major',
            confidence: 0.1
        };
    }
}
