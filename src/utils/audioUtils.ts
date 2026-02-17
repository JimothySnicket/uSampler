import { debug, debugWarn, debugError } from './logger';

export type ExportFormat = 'wav' | 'mp3';
export type MP3Bitrate = 128 | 192 | 256 | 320;
export type WavBitDepth = 16 | 24 | 32;

export interface ExportOptions {
    bitrate?: MP3Bitrate;
    bitDepth?: WavBitDepth;
}

export function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Convert AudioBuffer to specified format
 * @param buffer AudioBuffer to convert
 * @param format Export format ('wav' or 'mp3')
 * @param options Export options (bitrate for MP3)
 * @returns Promise resolving to Blob in specified format
 * @throws Error if encoding fails or validation fails
 */
export async function audioBufferToFormat(
    buffer: AudioBuffer,
    format: ExportFormat = 'wav',
    options: ExportOptions = {}
): Promise<Blob> {
    try {
        if (format === 'mp3') {
            // Dynamic import to avoid loading if not needed
            const { audioBufferToMp3, isMp3EncodingAvailable } = await import('./mp3Encoder');
            
            // Validate MP3 encoding is available
            const mp3Available = await isMp3EncodingAvailable();
            if (!mp3Available) {
                throw new Error('MP3 encoding library (lamejs) is not available. Please ensure it is properly loaded.');
            }

            // Validate buffer
            if (!buffer || !buffer.length || buffer.length === 0) {
                throw new Error('Invalid audio buffer: buffer is empty or null');
            }

            if (!buffer.sampleRate || buffer.sampleRate <= 0) {
                throw new Error(`Invalid audio buffer: invalid sample rate (${buffer.sampleRate})`);
            }

            if (!buffer.numberOfChannels || buffer.numberOfChannels <= 0) {
                throw new Error(`Invalid audio buffer: invalid channel count (${buffer.numberOfChannels})`);
            }

            // Encode to MP3
            const blob = await audioBufferToMp3(buffer, {
                bitrate: options.bitrate || 128
            });

            // Validate MP3 blob
            if (!blob || blob.size === 0) {
                throw new Error('MP3 encoding failed: produced empty or invalid blob');
            }

            // Check minimum size (MP3 files should be at least a few KB for valid audio)
            if (blob.size < 100) {
                throw new Error(`MP3 encoding may have failed: file size is suspiciously small (${blob.size} bytes)`);
            }

            debug(`[audioUtils] MP3 encoding successful: ${(blob.size / 1024).toFixed(2)} KB, bitrate: ${options.bitrate || 128} kbps`);
            return blob;
        } else {
            // Validate buffer for WAV
            if (!buffer || !buffer.length || buffer.length === 0) {
                throw new Error('Invalid audio buffer: buffer is empty or null');
            }

            if (!buffer.sampleRate || buffer.sampleRate <= 0) {
                throw new Error(`Invalid audio buffer: invalid sample rate (${buffer.sampleRate})`);
            }

            const depth = options.bitDepth || 16;
            const blob = audioBufferToWav(buffer, depth);

            // Validate WAV blob
            if (!blob || blob.size === 0) {
                throw new Error('WAV encoding failed: produced empty or invalid blob');
            }

            // Calculate expected WAV size: header + data
            const bytesPerSample = depth === 32 ? 4 : depth === 24 ? 3 : 2;
            const expectedSize = 44 + (buffer.length * buffer.numberOfChannels * bytesPerSample);
            const sizeDiff = Math.abs(blob.size - expectedSize);

            // Allow 1% tolerance for rounding
            if (sizeDiff > expectedSize * 0.01) {
                debugWarn(`[audioUtils] WAV size mismatch: expected ~${expectedSize} bytes, got ${blob.size} bytes`);
            }

            debug(`[audioUtils] WAV encoding successful: ${(blob.size / 1024).toFixed(2)} KB`);
            return blob;
        }
    } catch (error) {
        debugError('[audioUtils] Export error:', error);
        if (error instanceof Error) {
            throw new Error(`Export failed: ${error.message}`);
        }
        throw new Error('Export failed: Unknown error occurred');
    }
}

export function audioBufferToWav(buffer: AudioBuffer, bitDepth: WavBitDepth = 16): Blob {
    const numOfChan = buffer.numberOfChannels;
    const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2;
    const dataLength = buffer.length * numOfChan * bytesPerSample;
    const headerLength = 44;
    const length = dataLength + headerLength;
    const out = new ArrayBuffer(length);
    const view = new DataView(out);
    const channels: Float32Array[] = [];
    let pos = 0;

    // Format tag: 1 = PCM integer, 3 = IEEE float
    const formatTag = bitDepth === 32 ? 3 : 1;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(formatTag);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * bytesPerSample * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * bytesPerSample); // block-align
    setUint16(bitDepth);

    setUint32(0x61746164); // "data" - chunk
    setUint32(dataLength); // chunk length

    // Collect channel data
    for (let i = 0; i < numOfChan; i++)
        channels.push(buffer.getChannelData(i));

    // Write interleaved samples
    let offset = headerLength;
    for (let s = 0; s < buffer.length; s++) {
        for (let ch = 0; ch < numOfChan; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][s]));

            if (bitDepth === 16) {
                const int16 = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(offset, int16, true);
                offset += 2;
            } else if (bitDepth === 24) {
                // 24-bit signed integer: scale to [-8388608, 8388607]
                const int24 = Math.round(sample < 0 ? sample * 8388608 : sample * 8388607);
                view.setUint8(offset, int24 & 0xFF);
                view.setUint8(offset + 1, (int24 >> 8) & 0xFF);
                view.setUint8(offset + 2, (int24 >> 16) & 0xFF);
                offset += 3;
            } else {
                // 32-bit float: write raw float value
                view.setFloat32(offset, sample, true);
                offset += 4;
            }
        }
    }

    return new Blob([out], { type: 'audio/wav' });

    function setUint16(data: number) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: number) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}
