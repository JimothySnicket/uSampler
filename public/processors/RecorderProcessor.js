/**
 * RecorderProcessor — Lossless PCM audio capture via AudioWorklet
 *
 * Captures raw Float32 samples directly from the Web Audio graph.
 * No encoding, no compression — audio is captured at the AudioContext's native sample rate.
 *
 * Commands (via port.postMessage):
 *   { command: 'start' }  — begin capturing
 *   { command: 'stop' }   — stop capturing, send all data back
 *
 * Response (via port.postMessage):
 *   { type: 'recordingComplete', channels: Float32Array[] }
 */
class RecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this._recording = false;
        this._chunks = []; // Array of per-channel Float32Array snapshots

        this.port.onmessage = (e) => {
            if (e.data.command === 'start') {
                this._recording = true;
                this._chunks = [];
            } else if (e.data.command === 'stop') {
                this._recording = false;

                if (this._chunks.length === 0) {
                    this.port.postMessage({ type: 'recordingComplete', channels: [] });
                    return;
                }

                // Merge all chunks per channel into single contiguous Float32Arrays
                const channelCount = this._chunks[0].length;
                const merged = [];

                for (let ch = 0; ch < channelCount; ch++) {
                    const totalLen = this._chunks.reduce((sum, chunk) => sum + chunk[ch].length, 0);
                    const buf = new Float32Array(totalLen);
                    let offset = 0;
                    for (const chunk of this._chunks) {
                        buf.set(chunk[ch], offset);
                        offset += chunk[ch].length;
                    }
                    merged.push(buf);
                }

                // Transfer ownership of the underlying ArrayBuffers for zero-copy
                this.port.postMessage(
                    { type: 'recordingComplete', channels: merged },
                    merged.map(b => b.buffer)
                );
                this._chunks = [];
            }
        };
    }

    process(inputs) {
        if (this._recording && inputs[0] && inputs[0].length > 0) {
            // Copy each channel (input arrays are reused by the audio engine between calls)
            this._chunks.push(inputs[0].map(ch => new Float32Array(ch)));
        }
        return true;
    }
}

registerProcessor('recorder-processor', RecorderProcessor);
