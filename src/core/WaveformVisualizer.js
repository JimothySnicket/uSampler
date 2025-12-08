export class WaveformVisualizer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.options = {
            color: options.color || '#6ab0ff', // Brighter blue
            backgroundColor: options.backgroundColor || '#1a1a1a',
            playheadColor: options.playheadColor || '#ffffff',
            barWidth: options.barWidth || 1,
            gap: options.gap || 0,
            amplitudeScale: options.amplitudeScale || 1.0, // Standard 1:1 scaling
            ...options
        };

        // Data storage
        this.liveData = []; // Array of {min, max}
        this.staticPeaks = null; // {min: [], max: []}
        this.duration = 0;
        this.zoomLevel = 1.0;
        this.scrollOffset = 0.0;

        // Handle high DPI
        this.resize();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        // Only resize if dimensions changed
        if (this.canvas.width !== rect.width * dpr || this.canvas.height !== rect.height * dpr) {
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.ctx.scale(dpr, dpr);
            this.width = rect.width;
            this.height = rect.height;
        } else {
            // Just update logical dimensions
            this.width = rect.width;
            this.height = rect.height;
        }
    }

    clear() {
        // Essential: Clear the canvas context completely before redrawing
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Only fill if a color is provided and not transparent
        if (this.options.backgroundColor && this.options.backgroundColor !== 'transparent') {
            this.ctx.fillStyle = this.options.backgroundColor;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }
    }

    // --- Live Mode ---

    reset() {
        this.liveData = [];
        this.staticPeaks = null;
        this.clear();
    }

    /**
     * Add a chunk of audio data (time domain)
     * @param {Uint8Array|Float32Array} data 
     */
    addLiveData(data) {
        // To increase resolution, we subdivide the incoming buffer into smaller chunks.
        // Incoming buffer is typically 2048 samples (~46ms).
        // If we want high res, let's take a peak every ~128 samples (~3ms).
        const chunkSize = 128;
        const isUint8 = data instanceof Uint8Array;

        for (let i = 0; i < data.length; i += chunkSize) {
            let min = 1.0;
            let max = -1.0;
            const end = Math.min(i + chunkSize, data.length);

            for (let j = i; j < end; j++) {
                let val = data[j];
                if (isUint8) {
                    val = (val - 128) / 128;
                }
                if (val < min) min = val;
                if (val > max) max = val;
            }
            this.liveData.push({ min, max });
        }
    }

    drawLive() {
        this.clear();
        if (this.liveData.length === 0) return;

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const centerY = h / 2;

        ctx.fillStyle = this.options.color;

        const count = this.liveData.length;
        const drawWidth = Math.min(w, count);
        const step = count > w ? count / w : 1;

        ctx.beginPath();

        // Top Envelope (Anchor to >= 0)
        for (let x = 0; x < drawWidth; x++) {
            const startIdx = Math.floor(x * step);
            const endIdx = Math.max(startIdx + 1, Math.floor((x + 1) * step));

            let max = -1.0;
            for (let i = startIdx; i < endIdx && i < count; i++) {
                if (this.liveData[i].max > max) max = this.liveData[i].max;
            }
            if (max === -1.0) max = 0;

            // Force max to be at least 0 to anchor to center
            const effectiveMax = Math.max(0, max);
            const scaledMax = Math.min(1, effectiveMax * this.options.amplitudeScale);

            const yTop = centerY - (scaledMax * centerY);

            if (x === 0) ctx.moveTo(x, yTop);
            else ctx.lineTo(x, yTop);
        }

        // Bottom Envelope (Anchor to <= 0)
        for (let x = drawWidth - 1; x >= 0; x--) {
            const startIdx = Math.floor(x * step);
            const endIdx = Math.max(startIdx + 1, Math.floor((x + 1) * step));

            let min = 1.0;
            for (let i = startIdx; i < endIdx && i < count; i++) {
                if (this.liveData[i].min < min) min = this.liveData[i].min;
            }
            if (min === 1.0) min = 0;

            // Force min to be at most 0 to anchor to center
            const effectiveMin = Math.min(0, min);
            const scaledMin = Math.max(-1, effectiveMin * this.options.amplitudeScale);

            const yBottom = centerY - (scaledMin * centerY);

            ctx.lineTo(x, yBottom);
        }

        ctx.closePath();
        ctx.fill();
    }

    // --- Static Mode ---

    /**
     * Draw static waveform with zoom and scroll support.
     * Computes peaks on the fly for the visible range to ensure max resolution.
     * @param {AudioBuffer} buffer 
     */
    drawStatic(buffer) {
        if (!buffer) return;

        this.clear();
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const centerY = h / 2;

        // Default zoom/scroll if not set
        const zoom = this.zoomLevel || 1.0;
        const scroll = this.scrollOffset || 0.0;

        // Calculate visible sample range
        const totalSamples = buffer.length;
        const visibleSamples = totalSamples / zoom;
        const startSample = Math.floor(scroll * totalSamples);
        const endSample = Math.min(totalSamples, Math.floor(startSample + visibleSamples));

        // Samples per pixel
        const step = (endSample - startSample) / w;
        const data = buffer.getChannelData(0);

        // Pre-calculate peaks for each pixel column
        const peaks = [];

        for (let x = 0; x < w; x++) {
            const currentStart = Math.floor(startSample + (x * step));
            const currentEnd = Math.floor(startSample + ((x + 1) * step));

            // If we are out of bounds
            if (currentStart >= totalSamples) {
                peaks.push({ min: 0, max: 0 });
                continue;
            }

            let min = 1.0;
            let max = -1.0;

            if (currentEnd > currentStart) {
                // Normal case: multiple samples per pixel (or 1:1)
                const searchEnd = Math.min(totalSamples, currentEnd);
                for (let i = currentStart; i < searchEnd; i++) {
                    const val = data[i];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            } else {
                // Zoomed in very close (less than 1 sample per pixel)
                // Pick the nearest sample
                const idx = Math.min(totalSamples - 1, currentStart);
                const val = data[idx];
                min = val;
                max = val;
            }

            // Safety check
            if (max < min) {
                min = 0; max = 0;
            }

            peaks.push({ min, max });
        }

        ctx.fillStyle = this.options.color;
        ctx.beginPath();

        // Top Envelope (Anchor to >= 0)
        for (let x = 0; x < peaks.length; x++) {
            const peak = peaks[x];
            // Force max to be at least 0
            const effectiveMax = Math.max(0, peak.max);
            const scaledMax = Math.min(1, effectiveMax * this.options.amplitudeScale);
            const y = centerY - (scaledMax * centerY);

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        // Bottom Envelope (Anchor to <= 0)
        for (let x = peaks.length - 1; x >= 0; x--) {
            const peak = peaks[x];
            // Force min to be at most 0
            const effectiveMin = Math.min(0, peak.min);
            const scaledMin = Math.max(-1, effectiveMin * this.options.amplitudeScale);
            const y = centerY - (scaledMin * centerY);

            ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fill();
    }

    drawPlayhead(progress) {
        // progress is 0..1 relative to the whole file
        // Map to visible range
        const zoom = this.zoomLevel || 1.0;
        const scroll = this.scrollOffset || 0.0;

        const visibleStart = scroll;
        const visibleEnd = scroll + (1 / zoom);

        if (progress >= visibleStart && progress <= visibleEnd) {
            const x = (progress - visibleStart) * zoom * this.width;
            this.ctx.fillStyle = this.options.playheadColor;
            this.ctx.fillRect(x, 0, 2, this.height);
        }
    }
}

