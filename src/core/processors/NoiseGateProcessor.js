class NoiseGateProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'threshold',
                defaultValue: 0.05,
                minValue: 0,
                maxValue: 1
            },
            {
                name: 'amount',
                defaultValue: 0.5,
                minValue: 0,
                maxValue: 1
            },
            {
                name: 'enabled',
                defaultValue: 0,
                minValue: 0,
                maxValue: 1
            }
        ];
    }

    constructor() {
        super();
        this.currentGain = 1.0;
        this.envelope = 0.0;
        // Smoothing coefficients (per sample at 44.1kHz)
        // Attack (gain reduction): Fast ~10ms
        this.attackCoeff = 0.9995;
        // Release (gain recovery): Slow ~100ms
        this.releaseCoeff = 0.99995;

        // Envelope follower coefficients
        this.envAttack = 0.99; // Fast attack for RMS detection
        this.envRelease = 0.9995; // Slower release for RMS
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        // If no input or output, just return
        if (!input || !output || input.length === 0 || output.length === 0) return true;

        const numChannels = input.length;
        const length = input[0].length;

        // Get parameter values (using index 0 assuming constant for block, or array for automation)
        // For simplicity/perf in this specific use case, we take the first value
        // but supports k-rate modulation if we read per sample.
        const threshold = parameters.threshold.length > 1 ? parameters.threshold[0] : parameters.threshold[0];
        const amount = parameters.amount.length > 1 ? parameters.amount[0] : parameters.amount[0];
        const enabled = (parameters.enabled.length > 1 ? parameters.enabled[0] : parameters.enabled[0]) > 0.5;

        // Optimization: If disabled, pass through efficiently
        if (!enabled) {
            for (let channel = 0; channel < numChannels; channel++) {
                output[channel].set(input[channel]);
            }
            this.currentGain = 1.0;
            return true;
        }

        // Process loop
        // We calculate one gain envelope for the whole stream (linked stereo) or just use Channel 0
        // Using linked stereo (Channel 0 determines gain for all) is standard for gates to preserve stereo image.
        const inputL = input[0];

        for (let i = 0; i < length; i++) {
            // 1. Envelope Detection (RMS-ish)
            const sample = inputL[i];
            const absSample = Math.abs(sample);

            // Simple envelope follower
            if (absSample > this.envelope) {
                this.envelope = this.envAttack * this.envelope + (1 - this.envAttack) * absSample;
            } else {
                this.envelope = this.envRelease * this.envelope + (1 - this.envRelease) * absSample;
            }

            // 2. Calculate Target Gain
            // If envelope < threshold, reduce gain
            // Map 0...1 sensitivity input to actual threshold amplitude
            // Note: 'threshold' input comes from Sensitivity slider (0..1)
            // Higher sensitivity = Higher threshold (more aggressive gating)
            // Range: -60dB (0.001) to -6dB (0.5)
            const minThresh = 0.001;
            const maxThresh = 0.5;
            const actualThreshold = minThresh + (threshold * (maxThresh - minThresh));

            let targetGain = 1.0;
            if (this.envelope < actualThreshold) {
                // Below threshold
                // Calculate reduction ratio
                const ratio = Math.max(0, this.envelope / actualThreshold);
                // Apply amount: 0 = no red, 1 = full red
                targetGain = 1.0 - (amount * (1.0 - ratio));
            }

            // Clamp target gain
            targetGain = Math.max(0.0, Math.min(1.0, targetGain));

            // 3. Apply Gain Smoothing (Attack/Release)
            // If target < current, we are reducing gain (Closing gate) -> Attack
            // If target > current, we are increasing gain (Opening gate) -> Release
            // Wait, gate terminology is confusing.
            // "Closing" (reducing volume to silence) should be somewhat smooth but responsive.
            // "Opening" (silence to signal) needs to be FAST to preserve transients (Attack).

            // Let's refine coefficients based on standard Gate behavior:
            // Attack (Opening): Very Fast (<10ms) to catch transients
            // Release (Closing): Adjustable/Slower (>100ms) to avoid chattering

            // Logic:
            // If targetGain > currentGain (Opening, moving towards 1.0): Use Fast coeff
            // If targetGain < currentGain (Closing, moving towards 0.0): Use Slow coeff

            // 0.0002 per sample @ 44.1k is roughly instant
            // 0.9995 is roughly 100ms

            const isOpening = targetGain > this.currentGain;
            // Opening (Silence -> Sound): Fast!
            // Closing (Sound -> Silence): Slow (Hold/Release)

            const coeff = isOpening ? 0.001 : 0.9995;
            // Standard one-pole filter: out = out * coeff + in * (1-coeff)
            // For fast rise (small coeff): currentGain jumps to target
            // For slow decay (large coeff): currentGain lingers

            // Adjusted logic for my coeff definitions:
            // If coeff is 0.99 (close to 1), it retains state -> Slow
            // If coeff is 0.01 (close to 0), it takes new value -> Fast

            const alpha = isOpening ? 0.005 : 0.9992; // Tuned by ear values

            this.currentGain = this.currentGain * alpha + targetGain * (1.0 - alpha);

            // 4. Apply Gain to all channels
            for (let ch = 0; ch < numChannels; ch++) {
                output[ch][i] = input[ch][i] * this.currentGain;
            }
        }

        return true;
    }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
