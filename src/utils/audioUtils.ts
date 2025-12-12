export type ExportFormat = 'wav' | 'mp3';
export type MP3Bitrate = 128 | 192 | 256 | 320;

export interface ExportOptions {
    bitrate?: MP3Bitrate;
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

            console.log(`[audioUtils] MP3 encoding successful: ${(blob.size / 1024).toFixed(2)} KB, bitrate: ${options.bitrate || 128} kbps`);
            return blob;
        } else {
            // Validate buffer for WAV
            if (!buffer || !buffer.length || buffer.length === 0) {
                throw new Error('Invalid audio buffer: buffer is empty or null');
            }

            if (!buffer.sampleRate || buffer.sampleRate <= 0) {
                throw new Error(`Invalid audio buffer: invalid sample rate (${buffer.sampleRate})`);
            }

            const blob = audioBufferToWav(buffer);

            // Validate WAV blob
            if (!blob || blob.size === 0) {
                throw new Error('WAV encoding failed: produced empty or invalid blob');
            }

            // Calculate expected WAV size: header (44 bytes) + data (sampleRate * channels * 2 * duration)
            const expectedSize = 44 + (buffer.length * buffer.numberOfChannels * 2);
            const sizeDiff = Math.abs(blob.size - expectedSize);
            
            // Allow 1% tolerance for rounding
            if (sizeDiff > expectedSize * 0.01) {
                console.warn(`[audioUtils] WAV size mismatch: expected ~${expectedSize} bytes, got ${blob.size} bytes`);
            }

            console.log(`[audioUtils] WAV encoding successful: ${(blob.size / 1024).toFixed(2)} KB`);
            return blob;
        }
    } catch (error) {
        console.error('[audioUtils] Export error:', error);
        if (error instanceof Error) {
            throw new Error(`Export failed: ${error.message}`);
        }
        throw new Error('Export failed: Unknown error occurred');
    }
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new ArrayBuffer(length);
    const view = new DataView(out);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this example)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < buffer.numberOfChannels; i++)
        channels.push(buffer.getChannelData(i));

    while (pos < buffer.length) {
        for (i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(44 + offset, sample, true); // write 16-bit sample
            offset += 2;
        }
        pos++;
    }

    return new Blob([out], { type: 'audio/wav' });

    function setUint16(data: any) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data: any) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}
