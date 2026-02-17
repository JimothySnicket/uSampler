export const AudioState = {
    IDLE: 'idle',
    ARMED: 'armed',
    RECORDING: 'recording'
};

export class AudioEngine {
    constructor() {
        this.context = null;

        // Input Routing (Source -> Analyser -> InputSplitter -> Analysers -> RecorderNode)
        this.sourceNode = null;
        this.analyserNode = null; // Main analyser (mono/mix) - kept for visualizer
        this.inputSplitter = null;
        this.inputAnalyserL = null; // Stereo Input L
        this.inputAnalyserR = null; // Stereo Input R
        this.recorderNode = null; // AudioWorklet for lossless PCM capture

        // Output Routing (Source -> Effects -> Gain -> Use Playback Analysers -> Destination)
        this.masterGainNode = null;
        this.playbackSplitter = null;
        this.playbackAnalyserL = null; // Stereo Output L
        this.playbackAnalyserR = null; // Stereo Output R

        this.state = AudioState.IDLE;
        this.activeSource = null;
        this.playbackStartTime = 0;
        this.currentPlaybackRate = 1.0;
        this.isLooping = false;

        this.recordingBuffer = []; // {min, max} pairs for visualization

        this.onRecordingDataAvailable = null; // (blob) => void
        this.onRecordingStopped = null; // (blob, audioBuffer) => void
        this.onPlaybackEnded = null; // () => void
        this.onThresholdExceeded = null; // () => void

        this.outputVolume = 1.0;
        this.threshold = 75; // 0-100, maps to 0.0-1.0 amplitude (default 75%)
        this.isMonitoringThreshold = false;
        this.thresholdTriggered = false; // Prevent multiple triggers

        // EQ state
        this.eqEnabled = true;
        this.lowGain = 0; // dB
        this.lowFreq = 100; // Hz
        this.midGain = 0; // dB
        this.midFreq = 1000; // Hz
        this.midQ = 1.2; // Q factor
        this.highGain = 0; // dB
        this.highFreq = 8000; // Hz
        this.lowFilter = null;
        this.midFilter = null;
        this.highFilter = null;

        // Metering Buffers
        this.meterDataL = new Uint8Array(2048);
        this.meterDataR = new Uint8Array(2048);
    }

    async initContext() {
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        }

        // --- Input Chain Setup ---
        this.analyserNode = this.context.createAnalyser(); // Main visualizer analyser
        this.analyserNode.fftSize = 2048;

        this.inputSplitter = this.context.createChannelSplitter(2);
        this.inputAnalyserL = this.context.createAnalyser();
        this.inputAnalyserR = this.context.createAnalyser();
        this.inputAnalyserL.fftSize = 2048;
        this.inputAnalyserR.fftSize = 2048;

        // Connect splitter to analysers
        this.inputSplitter.connect(this.inputAnalyserL, 0);
        this.inputSplitter.connect(this.inputAnalyserR, 1);

        // Connect Input Analysers to a silent destination to prevent graph culling
        // Browsers optimize away audio nodes not connected to a destination, which would
        // cause the analysers to stop processing. This silent gain node keeps them active.
        this.keepAliveGain = this.context.createGain();
        this.keepAliveGain.gain.value = 0.0; // Silence
        this.keepAliveGain.connect(this.context.destination);

        this.inputAnalyserL.connect(this.keepAliveGain);
        this.inputAnalyserR.connect(this.keepAliveGain);

        // --- Output Chain Setup ---
        this.masterGainNode = this.context.createGain();
        this.masterGainNode.gain.value = this.outputVolume;

        this.playbackSplitter = this.context.createChannelSplitter(2);
        this.playbackAnalyserL = this.context.createAnalyser();
        this.playbackAnalyserR = this.context.createAnalyser();
        this.playbackAnalyserL.fftSize = 2048;
        this.playbackAnalyserR.fftSize = 2048;

        // Routing: Master Gain -> Destination (Main Out)
        this.masterGainNode.connect(this.context.destination);

        // Routing: Master Gain -> Splitter -> Analysers (Metering)
        this.masterGainNode.connect(this.playbackSplitter);
        this.playbackSplitter.connect(this.playbackAnalyserL, 0);
        this.playbackSplitter.connect(this.playbackAnalyserR, 1);

        // Initialize AudioWorklet modules
        await this.initModules();

        // Initialize noise gate
        await this.createNoiseGate();
    }

    async initModules() {
        // Load AudioWorklet modules with timeout to prevent hanging the entire app
        const loadModules = async () => {
            try {
                await Promise.all([
                    this.context.audioWorklet.addModule('processors/NoiseGateProcessor.js'),
                    this.context.audioWorklet.addModule('processors/RecorderProcessor.js'),
                ]);
                return true;
            } catch (error) {
                console.error('Error adding audio worklet modules:', error);
                return false;
            }
        };

        const timeout = new Promise(resolve => setTimeout(() => {
            console.warn('AudioWorklet module load timed out');
            resolve(false);
        }, 2000));

        const loaded = await Promise.race([loadModules(), timeout]);

        // Set up PCM recorder worklet (replaces MediaRecorder for lossless capture)
        if (loaded) {
            this.setupPCMRecorder();
        }
    }

    getSampleRate() {
        return this.context ? this.context.sampleRate : 48000; // Default fallback
    }

    async connectStream(streamId) {
        if (!this.context) await this.initContext();

        if (this.sourceNode) {
            console.log("Audio source already connected, disconnecting previous...");
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            if (this.context.state === 'suspended') {
                await this.context.resume();
            }

            this.setupSource(stream);

            // Handle stream ending (e.g. tab closed)
            stream.getAudioTracks()[0].addEventListener('ended', () => {
                console.log("Tab media stream ended");
                if (this.sourceNode) {
                    this.sourceNode.disconnect();
                    this.sourceNode = null;
                }
            });

            console.log("Connected Tab Stream");
            return true;
        } catch (err) {
            console.error('Error connecting stream:', err);
            return false;
        }
    }

    async connectDisplayMedia() {
        if (!this.context) await this.initContext();

        if (this.sourceNode) {
            console.log("Audio source already connected");
            return true;
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                },
                video: { width: 1, height: 1 }
            });

            if (this.context.state === 'suspended') {
                await this.context.resume();
            }

            if (stream.getAudioTracks().length === 0) {
                console.warn("No audio track found in display media.");
                stream.getTracks().forEach(t => t.stop());
                return false;
            }

            if (this.sourceNode) {
                this.sourceNode.disconnect();
            }

            this.setupSource(stream);

            stream.getAudioTracks()[0].addEventListener('ended', () => {
                console.log("Display media stream ended");
                if (this.sourceNode) {
                    this.sourceNode.disconnect();
                    this.sourceNode = null;
                }
            });

            console.log("Connected Display Media");
            return true;
        } catch (err) {
            console.error('Error connecting display media:', err);
            return false;
        }
    }

    setupSource(stream) {
        this.sourceNode = this.context.createMediaStreamSource(stream);

        // Connection 1: Source -> Main Visualizer Analyser (-> RecorderNode via setupPCMRecorder)
        this.sourceNode.connect(this.analyserNode);

        // Connection 2: Source -> Input Splitter -> Stereo Levels
        this.sourceNode.connect(this.inputSplitter);
    }

    setupPCMRecorder() {
        this.recorderNode = new AudioWorkletNode(this.context, 'recorder-processor');

        // Connect into the recording chain: analyserNode → recorderNode → keepAliveGain
        // keepAliveGain (gain=0) routes to destination, keeping the processor alive
        this.analyserNode.connect(this.recorderNode);
        this.recorderNode.connect(this.keepAliveGain);

        // Handle completed recording data from the worklet
        this.recorderNode.port.onmessage = (e) => {
            if (e.data.type === 'recordingComplete') {
                const { channels } = e.data;

                if (!channels || channels.length === 0 || channels[0].length === 0) {
                    console.warn('[AudioEngine] Recording produced no audio data');
                    if (this.onRecordingStopped) {
                        this.onRecordingStopped(new Blob([], { type: 'audio/wav' }), null);
                    }
                    return;
                }

                const numChannels = channels.length;
                const length = channels[0].length;
                const sampleRate = this.context.sampleRate;

                console.log(`[AudioEngine] PCM recording complete: ${numChannels}ch, ${length} samples, ${sampleRate}Hz, ${(length / sampleRate).toFixed(2)}s`);

                // Create AudioBuffer directly from raw PCM — no decoding needed, lossless
                const audioBuffer = this.context.createBuffer(numChannels, length, sampleRate);
                for (let ch = 0; ch < numChannels; ch++) {
                    audioBuffer.copyToChannel(channels[ch], ch);
                }

                // Create WAV blob for storage/session persistence
                const blob = this._rawToWavBlob(channels, sampleRate);
                console.log(`[AudioEngine] WAV blob created: ${(blob.size / 1024).toFixed(1)} KB`);

                if (this.onRecordingStopped) {
                    this.onRecordingStopped(blob, audioBuffer);
                }
            }
        };
    }

    /**
     * Convert raw Float32 channel arrays to a 16-bit PCM WAV Blob
     * @param {Float32Array[]} channels - Array of per-channel sample data
     * @param {number} sampleRate - Sample rate in Hz
     * @returns {Blob} WAV blob
     */
    _rawToWavBlob(channels, sampleRate) {
        const numChannels = channels.length;
        const length = channels[0].length;
        const bytesPerSample = 2;
        const dataLength = length * numChannels * bytesPerSample;
        const bufferSize = 44 + dataLength;
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        let pos = 0;

        const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
        const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

        // RIFF header
        setUint32(0x46464952); // "RIFF"
        setUint32(bufferSize - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        // fmt chunk
        setUint32(0x20746d66); // "fmt "
        setUint32(16); // chunk length
        setUint16(1); // PCM format
        setUint16(numChannels);
        setUint32(sampleRate);
        setUint32(sampleRate * bytesPerSample * numChannels); // byte rate
        setUint16(numChannels * bytesPerSample); // block align
        setUint16(16); // bits per sample

        // data chunk
        setUint32(0x61746164); // "data"
        setUint32(dataLength);

        // Write interleaved 16-bit PCM samples
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const s = Math.max(-1, Math.min(1, channels[ch][i]));
                const int16 = (s < 0 ? s * 32768 : s * 32767) | 0;
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    startRecording() {
        if (this.recorderNode) {
            this.recordingBuffer = [];
            try {
                this.recorderNode.port.postMessage({ command: 'start' });
                this.state = AudioState.RECORDING;

                // Safety: Mute output during recording to prevent feedback loops
                if (this.context && this.masterGainNode) {
                    try {
                        this.masterGainNode.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
                    } catch (e) { console.warn('Failed to mute master gain:', e); }
                }
                return true;
            } catch (e) {
                console.error('Failed to start PCM recording:', e);
                return false;
            }
        }
        return false;
    }

    stopRecording() {
        // ALWAYS reset state to IDLE to ensure UI doesn't get stuck
        this.state = AudioState.IDLE;

        if (this.recorderNode) {
            try {
                this.recorderNode.port.postMessage({ command: 'stop' });
            } catch (e) {
                console.error('Error stopping PCM recording:', e);
            }
        }

        // Restore volume
        if (this.context && this.masterGainNode) {
            try {
                this.masterGainNode.gain.setTargetAtTime(this.outputVolume, this.context.currentTime, 0.01);
            } catch (e) { console.warn('Failed to restore volume:', e); }
        }
    }

    play(buffer, trimStart, trimEnd, loop = false, playbackRate = 1.0) {
        this.stop();

        // Reset noise gate state when starting new playback to prevent gain accumulation
        // This ensures clean state when toggling on/off rapidly
        if (this.noiseGateNode) {
            // CRITICAL FIX: Disconnect previous connections!
            try {
                this.noiseGateNode.disconnect();
            } catch (e) { /* ignore if not connected */ }
        }

        // Source setup
        const source = this.context.createBufferSource();
        this.activeSource = source;
        this.isLooping = loop;

        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        this.currentPlaybackRate = playbackRate;

        // -- Create Per-Source Gain for Enveloping/Fading --
        const sourceGain = this.context.createGain();
        source.connect(sourceGain);
        this.activeSourceGain = sourceGain; // Store for fading

        // Anti-click fades: short gain ramps at slice boundaries to prevent audible clicks
        const fadeTime = 0.003; // 3ms — imperceptible but eliminates edge clicks
        const now = this.context.currentTime;
        sourceGain.gain.setValueAtTime(0, now);
        sourceGain.gain.linearRampToValueAtTime(1, now + fadeTime);

        // Chain starts with sourceGain
        let currentNode = sourceGain;

        // --- Noise Gate ---
        if (this.noiseGateNode && this.noiseGateEnabled) {
            currentNode.connect(this.noiseGateNode);
            currentNode = this.noiseGateNode;
        }

        // EQ filters (always create filters to allow real-time updates, set gain to 0 if disabled)
        // Low band filter
        this.lowFilter = this.context.createBiquadFilter();
        this.lowFilter.type = 'peaking';
        this.lowFilter.frequency.value = Math.max(20, Math.min(400, this.lowFreq));
        this.lowFilter.gain.value = this.eqEnabled ? this.lowGain : 0;
        this.lowFilter.Q.value = 1.0;
        currentNode.connect(this.lowFilter);
        currentNode = this.lowFilter;

        // Mid band filter
        this.midFilter = this.context.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = Math.max(400, Math.min(4000, this.midFreq));
        this.midFilter.gain.value = this.eqEnabled ? this.midGain : 0;
        this.midFilter.Q.value = this.midQ;
        currentNode.connect(this.midFilter);
        currentNode = this.midFilter;

        // High band filter
        this.highFilter = this.context.createBiquadFilter();
        this.highFilter.type = 'peaking';
        this.highFilter.frequency.value = Math.max(4000, Math.min(20000, this.highFreq));
        this.highFilter.gain.value = this.eqEnabled ? this.highGain : 0;
        this.highFilter.Q.value = 1.0;
        currentNode.connect(this.highFilter);
        currentNode = this.highFilter;



        // Connect to Main Output Gain (which routes to Destination and Playback metering)
        currentNode.connect(this.masterGainNode);

        const duration = buffer.duration;
        const start = trimStart * duration;
        const end = trimEnd * duration;
        const bufferDuration = end - start;
        // playDuration parameter to source.start() is in real-time, not buffer-time
        // When playbackRate != 1.0, we need to convert buffer-time to real-time
        // When looping, playDuration should be undefined to allow infinite looping
        const playDuration = loop ? undefined : bufferDuration / playbackRate;

        // Anti-click fade-out at end of non-looping playback
        if (!loop && playDuration && playDuration > fadeTime * 2) {
            sourceGain.gain.setValueAtTime(1, now + playDuration - fadeTime);
            sourceGain.gain.linearRampToValueAtTime(0, now + playDuration);
        }

        source.loop = loop;
        source.loopStart = start;
        source.loopEnd = end;

        source.start(0, start, playDuration);
        // Store the actual real-time when playback started (not adjusted for buffer offset)
        // The buffer offset will be accounted for in the playhead calculation
        this.playbackStartTime = this.context.currentTime;

        source.onended = () => {
            // Only fire onended callback if not looping (when looping, onended shouldn't fire, but check anyway)
            if (this.activeSource === source && !loop) {
                this.activeSource = null;
                if (this.onPlaybackEnded) this.onPlaybackEnded();
            }
        };
    }

    stop(fadeOut = false, fadeDuration = 0.005) {
        // Capture specific source and gain to stop (in case activeSource changes immediately after)
        const sourceToStop = this.activeSource;
        const gainToFade = this.activeSourceGain;

        if (sourceToStop) {
            try {
                if (fadeOut && gainToFade) {
                    // Smooth fade out on the PER-SOURCE gain node
                    const currentTime = this.context.currentTime;
                    // Cancel any scheduled changes
                    gainToFade.gain.cancelScheduledValues(currentTime);
                    // Ramp to 0
                    gainToFade.gain.setValueAtTime(gainToFade.gain.value, currentTime);
                    gainToFade.gain.linearRampToValueAtTime(0, currentTime + fadeDuration);

                    // Stop source after fade
                    setTimeout(() => {
                        try {
                            // Only stop if it hasn't finished naturally
                            // And importantly: we don't nullify activeSource if it has already changed!
                            sourceToStop.stop();
                            sourceToStop.disconnect();
                            if (gainToFade) gainToFade.disconnect();
                        } catch (e) {
                            // Ignore
                        }
                    }, fadeDuration * 1000 + 10);
                } else {
                    // Immediate stop
                    try {
                        sourceToStop.stop();
                        sourceToStop.disconnect();
                        if (gainToFade) gainToFade.disconnect();
                    } catch (e) {
                        // Ignore
                    }
                }
            } catch (e) {
                // Ignore
            }
        }

        // Only clear activeSource if we are stopping the CURRENT active source
        if (this.activeSource === sourceToStop) {
            this.activeSource = null;
            this.activeSourceGain = null;
        }

        this.currentPlaybackRate = 1.0;
    }

    playSnippet(buffer, startPct, durationSec = 0.1) {
        // Stop previous sound with a very quick fade to avoid clicks (using new per-source fade)
        this.stop(true, 0.01);

        const source = this.context.createBufferSource();
        source.buffer = buffer;

        // Create a dedicated gain node for the snippet envelope
        const envelopeGain = this.context.createGain();
        envelopeGain.gain.value = 0;

        source.connect(envelopeGain);
        envelopeGain.connect(this.masterGainNode);

        const start = startPct * buffer.duration;
        const now = this.context.currentTime;

        // Micro-fade in (5ms)
        envelopeGain.gain.setValueAtTime(0, now);
        envelopeGain.gain.linearRampToValueAtTime(1, now + 0.005);

        // Use provided duration (default shorter for scrubbing) but at least enough for fades
        // Decrease default duration to 0.1s for snappier scrubbing
        const actualDuration = Math.max(durationSec, 0.02);

        // Micro-fade out at the end
        envelopeGain.gain.setValueAtTime(1, now + actualDuration - 0.005);
        envelopeGain.gain.linearRampToValueAtTime(0, now + actualDuration);

        source.start(now, start, actualDuration);

        this.activeSource = source;
        this.activeSourceGain = envelopeGain;
    }

    getAnalyserData(timeData) {
        // Legacy support mostly
        if (this.analyserNode) {
            this.analyserNode.getByteTimeDomainData(timeData);
        }
    }

    // --- New Method: Get Stereo Levels ---
    getStereoLevels() {
        // Determine which analysers to use
        let analyserL = null;
        let analyserR = null;

        if (this.activeSource && (this.playbackAnalyserL && this.playbackAnalyserR)) {
            // Playing back -> Monitor Output
            analyserL = this.playbackAnalyserL;
            analyserR = this.playbackAnalyserR;
        } else if (this.inputAnalyserL && this.inputAnalyserR) {
            // Monitor Input (Always check input if not playing back - silent if no source)
            analyserL = this.inputAnalyserL;
            analyserR = this.inputAnalyserR;
        }

        if (!analyserL || !analyserR) {
            return { left: 0, right: 0 };
        }

        // Get data
        analyserL.getByteTimeDomainData(this.meterDataL);
        analyserR.getByteTimeDomainData(this.meterDataR);

        const calculatePeak = (data) => {
            // Calculate RMS or Peak. Let's start with Peak for VU style.
            let max = 0;
            for (let i = 0; i < data.length; i++) {
                const amp = Math.abs((data[i] - 128) / 128);
                if (amp > max) max = amp;
            }
            return max;
        };

        return {
            left: calculatePeak(this.meterDataL),
            right: calculatePeak(this.meterDataR)
        };
    }

    checkThreshold() {
        if (!this.analyserNode || !this.isMonitoringThreshold || this.state === AudioState.RECORDING) {
            return;
        }

        const timeData = new Uint8Array(2048);
        this.analyserNode.getByteTimeDomainData(timeData);

        // Calculate peak amplitude
        let max = 0;
        for (let i = 0; i < timeData.length; i++) {
            const v = Math.abs(timeData[i] - 128) / 128;
            if (v > max) max = v;
        }

        const thresholdLevel = this.threshold / 100;

        if (max > thresholdLevel && !this.thresholdTriggered && this.onThresholdExceeded) {
            this.thresholdTriggered = true;
            this.onThresholdExceeded();
        } else if (max <= thresholdLevel) {
            this.thresholdTriggered = false;
        }
    }

    startThresholdMonitoring() {
        this.isMonitoringThreshold = true;
        this.thresholdTriggered = false;
    }

    stopThresholdMonitoring() {
        this.isMonitoringThreshold = false;
        this.thresholdTriggered = false;
    }

    setVolume(val) {
        this.outputVolume = val;
        if (this.masterGainNode) this.masterGainNode.gain.value = val;
    }

    processLiveAudio(timeData) {
        if (this.state !== AudioState.RECORDING) return;

        const chunks = 4;
        const chunkSize = Math.floor(timeData.length / chunks);

        for (let c = 0; c < chunks; c++) {
            let min = 1.0;
            let max = -1.0;
            const start = c * chunkSize;
            const end = start + chunkSize;

            for (let i = start; i < end; i++) {
                const v = (timeData[i] - 128) / 128;
                if (v < min) min = v;
                if (v > max) max = v;
            }
            if (min > max) { min = 0; max = 0; }
            this.recordingBuffer.push({ min, max });
        }
    }

    // --- Processing methods same as before ---

    async crop(sample) {
        const buffer = sample.buffer;
        const startFrame = Math.floor(sample.trimStart * buffer.length);
        const endFrame = Math.floor(sample.trimEnd * buffer.length);
        const frameCount = endFrame - startFrame;

        if (frameCount <= 0) return null;

        const newBuffer = this.context.createBuffer(buffer.numberOfChannels, frameCount, buffer.sampleRate);

        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const oldData = buffer.getChannelData(i);
            const newData = newBuffer.getChannelData(i);
            for (let j = 0; j < frameCount; j++) {
                newData[j] = oldData[startFrame + j];
            }
        }
        return newBuffer;
    }

    async normalize(buffer) {
        const newBuffer = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        let maxAmp = 0;
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const data = buffer.getChannelData(i);
            for (let j = 0; j < data.length; j++) {
                if (Math.abs(data[j]) > maxAmp) maxAmp = Math.abs(data[j]);
            }
        }
        const gain = maxAmp > 0 ? 1.0 / maxAmp : 1.0;
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const oldData = buffer.getChannelData(i);
            const newData = newBuffer.getChannelData(i);
            for (let j = 0; j < oldData.length; j++) {
                newData[j] = oldData[j] * gain;
            }
        }
        return newBuffer;
    }

    async reverse(buffer) {
        const newBuffer = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const oldData = buffer.getChannelData(i);
            const newData = newBuffer.getChannelData(i);
            for (let j = 0; j < oldData.length; j++) {
                newData[j] = oldData[oldData.length - 1 - j];
            }
        }
        return newBuffer;
    }

    async resampleBuffer(buffer, targetSampleRate) {
        if (buffer.sampleRate === targetSampleRate) {
            return buffer;
        }

        const ratio = targetSampleRate / buffer.sampleRate;
        const newLength = Math.floor(buffer.length * ratio);
        const offlineContext = new OfflineAudioContext(
            buffer.numberOfChannels,
            newLength,
            targetSampleRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineContext.destination);
        source.start(0);

        return await offlineContext.startRendering();
    }

    async downsample(buffer, targetRate) {
        if (targetRate >= buffer.sampleRate) {
            return buffer;
        }
        return await this.resampleBuffer(buffer, targetRate);
    }

    bitcrush(buffer, bitDepth) {
        const newBuffer = this.context.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        const levels = Math.pow(2, bitDepth);
        const step = 2 / levels;
        const halfStep = step / 2;

        for (let i = 0; i < buffer.numberOfChannels; i++) {
            const oldData = buffer.getChannelData(i);
            const newData = newBuffer.getChannelData(i);
            for (let j = 0; j < oldData.length; j++) {
                const sample = oldData[j];
                const quantized = Math.floor((sample + 1) / step) * step - 1 + halfStep;
                newData[j] = Math.max(-1, Math.min(1, quantized));
            }
        }

        return newBuffer;
    }

    async applyEffectsAndResample(buffer, targetSampleRate = null) {
        const targetRate = targetSampleRate || buffer.sampleRate;
        const offlineContext = new OfflineAudioContext(
            buffer.numberOfChannels,
            Math.ceil(buffer.length * (targetRate / buffer.sampleRate)),
            targetRate
        );

        const source = offlineContext.createBufferSource();
        source.buffer = buffer;

        let currentNode = source;

        // EQ filters (always apply, but can be set to 0 gain if disabled)
        if (this.eqEnabled) {
            // Low band filter
            const lowFilter = offlineContext.createBiquadFilter();
            lowFilter.type = 'peaking';
            lowFilter.frequency.value = Math.max(20, Math.min(400, this.lowFreq));
            lowFilter.gain.value = this.lowGain;
            lowFilter.Q.value = 1.0;
            currentNode.connect(lowFilter);
            currentNode = lowFilter;

            // Mid band filter
            const midFilter = offlineContext.createBiquadFilter();
            midFilter.type = 'peaking';
            midFilter.frequency.value = Math.max(400, Math.min(4000, this.midFreq));
            midFilter.gain.value = this.midGain;
            midFilter.Q.value = this.midQ;
            currentNode.connect(midFilter);
            currentNode = midFilter;

            // High band filter
            const highFilter = offlineContext.createBiquadFilter();
            highFilter.type = 'peaking';
            highFilter.frequency.value = Math.max(4000, Math.min(20000, this.highFreq));
            highFilter.gain.value = this.highGain;
            highFilter.Q.value = 1.0;
            currentNode.connect(highFilter);
            currentNode = highFilter;
        }



        currentNode.connect(offlineContext.destination);
        source.start(0);

        return await offlineContext.startRendering();
    }




    setEQ(params) {
        if (params.enabled !== undefined) {
            this.eqEnabled = params.enabled;
            // Live toggle: set all filter gains to 0 when disabled, restore when enabled
            if (this.lowFilter) {
                this.lowFilter.gain.setTargetAtTime(this.eqEnabled ? this.lowGain : 0, this.context.currentTime, 0.01);
            }
            if (this.midFilter) {
                this.midFilter.gain.setTargetAtTime(this.eqEnabled ? this.midGain : 0, this.context.currentTime, 0.01);
            }
            if (this.highFilter) {
                this.highFilter.gain.setTargetAtTime(this.eqEnabled ? this.highGain : 0, this.context.currentTime, 0.01);
            }
        }
        if (params.lowGain !== undefined) {
            this.lowGain = params.lowGain;
            if (this.lowFilter) {
                this.lowFilter.gain.setTargetAtTime(this.eqEnabled ? this.lowGain : 0, this.context.currentTime, 0.01);
            }
        }
        if (params.lowFreq !== undefined) {
            this.lowFreq = params.lowFreq;
            if (this.lowFilter) {
                this.lowFilter.frequency.setTargetAtTime(Math.max(20, Math.min(400, this.lowFreq)), this.context.currentTime, 0.01);
            }
        }
        if (params.midGain !== undefined) {
            this.midGain = params.midGain;
            if (this.midFilter) {
                this.midFilter.gain.setTargetAtTime(this.eqEnabled ? this.midGain : 0, this.context.currentTime, 0.01);
            }
        }
        if (params.midFreq !== undefined) {
            this.midFreq = params.midFreq;
            if (this.midFilter) {
                this.midFilter.frequency.setTargetAtTime(Math.max(400, Math.min(4000, this.midFreq)), this.context.currentTime, 0.01);
            }
        }
        if (params.midQ !== undefined) {
            this.midQ = params.midQ;
            if (this.midFilter) {
                this.midFilter.Q.setTargetAtTime(this.midQ, this.context.currentTime, 0.01);
            }
        }
        if (params.highGain !== undefined) {
            this.highGain = params.highGain;
            if (this.highFilter) {
                this.highFilter.gain.setTargetAtTime(this.eqEnabled ? this.highGain : 0, this.context.currentTime, 0.01);
            }
        }
        if (params.highFreq !== undefined) {
            this.highFreq = params.highFreq;
            if (this.highFilter) {
                this.highFilter.frequency.setTargetAtTime(Math.max(4000, Math.min(20000, this.highFreq)), this.context.currentTime, 0.01);
            }
        }
    }

    // --- Live Noise Gate ---
    async createNoiseGate() {
        if (!this.context) return;

        try {
            // Create AudioWorkletNode
            this.noiseGateNode = new AudioWorkletNode(this.context, 'noise-gate-processor');

            // Initial parameters
            const sensitivity = this.noiseGateSensitivity || 0.5;
            const amount = this.noiseGateAmount || 0.5;
            const enabled = this.noiseGateEnabled ? 1 : 0;

            const thresholdParam = this.noiseGateNode.parameters.get('threshold');
            const amountParam = this.noiseGateNode.parameters.get('amount');
            const enabledParam = this.noiseGateNode.parameters.get('enabled');

            if (thresholdParam) thresholdParam.setValueAtTime(sensitivity, this.context.currentTime);
            if (amountParam) amountParam.setValueAtTime(amount, this.context.currentTime);
            if (enabledParam) enabledParam.setValueAtTime(enabled, this.context.currentTime);

            // Error handling
            this.noiseGateNode.onprocessorerror = (err) => {
                console.error('NoiseGateProcessor error:', err);
            };

        } catch (e) {
            console.error('Failed to create NoiseGateProcessor worklet node:', e);
            // Fallback to bypass or script processor if absolutely necessary (omitted for now)
        }
    }

    applyNoiseGateOffline(buffer, sensitivity, amount) {
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const newBuffer = this.context.createBuffer(numChannels, length, buffer.sampleRate);

        const inBuffers = [];
        const outBuffers = [];
        for (let ch = 0; ch < numChannels; ch++) {
            inBuffers.push(buffer.getChannelData(ch));
            outBuffers.push(newBuffer.getChannelData(ch));
        }

        const minThresh = 0.001;
        const maxThresh = 0.5;
        const threshold = minThresh + (sensitivity * (maxThresh - minThresh));

        // Initialize state for smoothing
        let currentGain = 1.0;
        let envelope = 0.0;
        const envAttack = 0.99;
        const envRelease = 0.9995;

        for (let i = 0; i < length; i++) {
            // Per-sample processing

            // Envelope detection (using first channel)
            const sample = Math.abs(inBuffers[0][i]); // Use first channel for envelope detection
            if (sample > envelope) {
                envelope = envAttack * envelope + (1 - envAttack) * sample;
            } else {
                envelope = envRelease * envelope + (1 - envRelease) * sample;
            }

            // Calculate Target Gain
            let targetGain = 1.0;
            if (envelope < threshold && threshold > 0) {
                const ratio = Math.max(0, envelope / threshold);
                targetGain = 1.0 - (amount * (1.0 - ratio));
            }

            // Clamp Target
            targetGain = Math.max(0.0, Math.min(1.0, targetGain));

            // Apply smoothing
            const isOpening = targetGain > currentGain;
            // Release (Closing to silence) -> Slow (retain gain) - wait, this is reversed logic for "Release" term
            // Gate Opening (Silence to Sound) -> Fast attack
            // Gate Closing (Sound to Silence) -> Slow release

            const alpha = isOpening ? 0.005 : 0.9992;
            currentGain = currentGain * alpha + targetGain * (1.0 - alpha);

            currentGain = Math.max(0.0, Math.min(1.0, currentGain));

            // Apply to all channels
            for (let ch = 0; ch < numChannels; ch++) {
                const funcInData = inBuffers[ch];
                const funcOutData = outBuffers[ch];
                funcOutData[i] = funcInData[i] * currentGain;
            }
        }
        return newBuffer;
    }

    setNoiseGate(enabled = false, sensitivity = 0.5, amount = 0.5) {
        const enabledChanged = this.noiseGateEnabled !== enabled;
        const settingsChanged =
            enabledChanged ||
            this.noiseGateSensitivity !== sensitivity ||
            this.noiseGateAmount !== amount;

        this.noiseGateEnabled = enabled;
        this.noiseGateSensitivity = sensitivity;
        this.noiseGateAmount = amount;

        if (this.context && this.noiseGateNode instanceof AudioWorkletNode) {
            try {
                const thresholdParam = this.noiseGateNode.parameters.get('threshold');
                const amountParam = this.noiseGateNode.parameters.get('amount');
                const enabledParam = this.noiseGateNode.parameters.get('enabled');

                // Ramp to new values to avoid zipper noise on parameter change
                if (thresholdParam) thresholdParam.setTargetAtTime(sensitivity, this.context.currentTime, 0.02);
                if (amountParam) amountParam.setTargetAtTime(amount, this.context.currentTime, 0.02);
                // Use setValueAtTime for immediate toggle, or excessively fast ramp
                if (enabledParam) enabledParam.setValueAtTime(enabled ? 1 : 0, this.context.currentTime);
            } catch (e) {
                console.warn('Error setting noise gate parameters:', e);
            }
        } else {
            // Legacy fallback logic
            if (settingsChanged) {
                this.noiseGateCurrentGain = 1.0;
            }
            if (enabledChanged) {
                this.noiseGateCurrentGain = 1.0;
            }
        }

    }

    bufferToBlob(buffer) {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const bufferArr = new ArrayBuffer(length);
        const view = new DataView(bufferArr);
        const channels = [];
        let i;
        let sample;
        let offset = 0;
        let pos = 0;

        const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
        const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8);
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt "
        setUint32(16);
        setUint16(1);
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan);
        setUint16(numOfChan * 2);
        setUint16(16);

        setUint32(0x61746164); // "data"
        setUint32(length - pos - 4);

        for (i = 0; i < buffer.numberOfChannels; i++)
            channels.push(buffer.getChannelData(i));

        let sampleIndex = 0;
        while (sampleIndex < buffer.length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][sampleIndex]));
                sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(44 + offset, sample, true);
                offset += 2;
            }
            sampleIndex++;
        }

        return new Blob([bufferArr], { type: 'audio/wav' });
    }

    // --- Time Stretching Methods ---

    /**
     * Time stretch audio buffer without changing pitch
     * @param {AudioBuffer} buffer - Audio buffer to stretch
     * @param {number} stretchRatio - Stretch ratio (0.25 to 4.0, 0.5 = half speed, 2.0 = double speed)
     * @param {Function} onProgress - Optional progress callback (0-1)
     * @returns {Promise<AudioBuffer>}
     */
    async timeStretch(buffer, stretchRatio, onProgress = null) {
        const { timeStretch } = await import('../utils/timeStretcher.js');
        return await timeStretch(buffer, {
            stretchRatio,
            method: 'simple',
            onProgress: onProgress || undefined
        });
    }

}
