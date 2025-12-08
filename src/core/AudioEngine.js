export const AudioState = {
    IDLE: 'idle',
    ARMED: 'armed',
    RECORDING: 'recording'
};

export class AudioEngine {
    constructor() {
        this.context = null;

        // Input Routing (Source -> Analyser -> InputSplitter -> Analysers -> MediaStreamDestination)
        this.sourceNode = null;
        this.analyserNode = null; // Main analyser (mono/mix) - kept for visualizer
        this.inputSplitter = null;
        this.inputAnalyserL = null; // Stereo Input L
        this.inputAnalyserR = null; // Stereo Input R
        this.mediaStreamDestination = null;

        // Output Routing (Source -> Effects -> Gain -> Use Playback Analysers -> Destination)
        this.gainNode = null;
        this.playbackSplitter = null;
        this.playbackAnalyserL = null; // Stereo Output L
        this.playbackAnalyserR = null; // Stereo Output R
        // Note: playbackAnalyserNode removed as we now use splitters, but we might keep one for mix visualization if needed?
        // Let's use the L/R ones for levels.

        this.mediaRecorder = null;

        this.state = AudioState.IDLE;
        this.activeSource = null;
        this.playbackStartTime = 0;

        this.recordedChunks = [];
        this.recordingBuffer = []; // {min, max} pairs for visualization

        this.onRecordingDataAvailable = null; // (blob) => void
        this.onRecordingStopped = null; // (blob, audioBuffer) => void
        this.onPlaybackEnded = null; // () => void
        this.onThresholdExceeded = null; // () => void

        this.outputVolume = 1.0;
        this.threshold = 75; // 0-100, maps to 0.0-1.0 amplitude (default 75%)
        this.isMonitoringThreshold = false;
        this.thresholdTriggered = false; // Prevent multiple triggers

        // Effects state
        this.delayTime = 0.3; // seconds
        this.delayFeedback = 0.3; // 0-1
        this.delayMix = 0.0; // 0-1
        this.reverbRoomSize = 0.5; // 0-1
        this.reverbDamping = 0.5; // 0-1
        this.reverbMix = 0.0; // 0-1
        this.delayNode = null;
        this.reverbConvolver = null;

        // Metering Buffers
        this.meterDataL = new Uint8Array(2048);
        this.meterDataR = new Uint8Array(2048);
    }

    initContext() {
        if (this.context) return;

        this.context = new AudioContext();

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

        // Hack: Connect Input Analysers to a silent destination to prevent graph culling
        // Browsers optimizes away nodes not connected to a destination
        this.keepAliveGain = this.context.createGain();
        this.keepAliveGain.gain.value = 0.0; // Silence
        this.keepAliveGain.connect(this.context.destination);

        this.inputAnalyserL.connect(this.keepAliveGain);
        this.inputAnalyserR.connect(this.keepAliveGain);

        this.mediaStreamDestination = this.context.createMediaStreamDestination();

        // --- Output Chain Setup ---
        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = this.outputVolume;

        this.playbackSplitter = this.context.createChannelSplitter(2);
        this.playbackAnalyserL = this.context.createAnalyser();
        this.playbackAnalyserR = this.context.createAnalyser();
        this.playbackAnalyserL.fftSize = 2048;
        this.playbackAnalyserR.fftSize = 2048;

        // Routing: Gain -> Destination (Main Out)
        this.gainNode.connect(this.context.destination);

        // Routing: Gain -> Splitter -> Analysers (Metering)
        this.gainNode.connect(this.playbackSplitter);
        this.playbackSplitter.connect(this.playbackAnalyserL, 0);
        this.playbackSplitter.connect(this.playbackAnalyserR, 1);

        this.setupMediaRecorder();
    }

    getSampleRate() {
        return this.context ? this.context.sampleRate : 48000; // Default fallback
    }

    async connectStream(streamId) {
        if (!this.context) this.initContext();

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
            return true;
        } catch (err) {
            console.error('Error connecting stream:', err);
            return false;
        }
    }

    async connectDisplayMedia() {
        if (!this.context) this.initContext();

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

        // Connection 1: Source -> Main Visualizer Analyser -> Media Destination (Recording)
        this.sourceNode.connect(this.analyserNode);
        // Note: We don't connect analyserNode to mediaStreamDestination directly anymore if we want stereo recording?
        // Actually MediaStreamDestination accepts multiple inputs.
        // Let's keep source -> analyser -> destination flow but hook in splitting

        this.analyserNode.connect(this.mediaStreamDestination);

        // Connection 2: Source -> Input Splitter -> Stereo Levels
        this.sourceNode.connect(this.inputSplitter);
    }

    setupMediaRecorder() {
        this.mediaRecorder = new MediaRecorder(this.mediaStreamDestination.stream, {
            mimeType: 'audio/webm;codecs=opus'
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.recordedChunks.push(e.data);
        };

        this.mediaRecorder.onstop = async () => {
            console.log('[AudioEngine] MediaRecorder stopped, chunks:', this.recordedChunks.length);
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            console.log('[AudioEngine] Blob created, size:', blob.size);
            this.recordedChunks = [];

            if (this.onRecordingStopped) {
                try {
                    const arrayBuffer = await blob.arrayBuffer();
                    console.log('[AudioEngine] Decoding audio buffer...');
                    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
                    console.log('[AudioEngine] Audio buffer decoded, duration:', audioBuffer.duration);
                    this.onRecordingStopped(blob, audioBuffer);
                } catch (err) {
                    console.error("[AudioEngine] Error decoding recorded audio:", err);
                    this.onRecordingStopped(blob, null);
                }
            } else {
                console.warn('[AudioEngine] No onRecordingStopped callback set!');
            }
        };
    }

    startRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
            this.recordingBuffer = [];
            this.recordedChunks = [];
            this.mediaRecorder.start(100);
            this.state = AudioState.RECORDING;

            // Safety: Mute output during recording to prevent feedback loops
            if (this.gainNode) {
                // We use setTargetAtTime for smooth mute to avoid clicks
                this.gainNode.gain.setTargetAtTime(0, this.context.currentTime, 0.01);
            }
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.state = AudioState.IDLE;

            // Restore volume
            if (this.gainNode) {
                this.gainNode.gain.setTargetAtTime(this.outputVolume, this.context.currentTime, 0.01);
            }
        }
    }

    play(buffer, trimStart, trimEnd, loop = false) {
        this.stop();

        const source = this.context.createBufferSource();
        this.activeSource = source;

        source.buffer = buffer;

        // Build effects chain
        let currentNode = source;

        // Delay effect
        if (this.delayMix > 0) {
            this.delayNode = this.context.createDelay(1.0);
            this.delayNode.delayTime.value = this.delayTime;

            const delayGain = this.context.createGain();
            delayGain.gain.value = this.delayFeedback;

            this.delayNode.connect(delayGain);
            delayGain.connect(this.delayNode);

            const delayMix = this.context.createGain();
            const dryMix = this.context.createGain();
            delayMix.gain.value = this.delayMix;
            dryMix.gain.value = 1 - this.delayMix;

            currentNode.connect(dryMix);
            currentNode.connect(this.delayNode);
            this.delayNode.connect(delayMix);

            const delayMerge = this.context.createGain();
            dryMix.connect(delayMerge);
            delayMix.connect(delayMerge);
            currentNode = delayMerge;
        }

        // Reverb effect
        if (this.reverbMix > 0) {
            const reverbMix = this.context.createGain();
            const dryMix = this.context.createGain();
            reverbMix.gain.value = this.reverbMix;
            dryMix.gain.value = 1 - this.reverbMix;

            const reverbDelays = [];
            const reverbTimes = [0.03, 0.05, 0.07, 0.09];

            for (let i = 0; i < reverbTimes.length; i++) {
                const delay = this.context.createDelay(0.2);
                delay.delayTime.value = reverbTimes[i];
                const gain = this.context.createGain();
                gain.gain.value = this.reverbDamping * 0.3;

                delay.connect(gain);
                gain.connect(delay);
                delay.connect(reverbMix);

                reverbDelays.push(delay);
            }

            currentNode.connect(dryMix);
            for (const delay of reverbDelays) {
                currentNode.connect(delay);
            }

            const reverbMerge = this.context.createGain();
            dryMix.connect(reverbMerge);
            reverbMix.connect(reverbMerge);
            currentNode = reverbMerge;
        }

        // Connect to Main Output Gain (which routes to Destination and Playback metering)
        currentNode.connect(this.gainNode);

        const duration = buffer.duration;
        const start = trimStart * duration;
        const end = trimEnd * duration;
        const playDuration = end - start;

        source.loop = loop;
        source.loopStart = start;
        source.loopEnd = end;

        source.start(0, start, source.loop ? undefined : playDuration);
        this.playbackStartTime = this.context.currentTime - start;

        source.onended = () => {
            if (this.activeSource === source) {
                this.activeSource = null;
                if (this.onPlaybackEnded) this.onPlaybackEnded();
            }
        };
    }

    stop() {
        if (this.activeSource) {
            this.activeSource.stop();
            this.activeSource = null;
        }
    }

    playSnippet(buffer, startPct, durationSec = 0.2) {
        this.stop();

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gainNode);

        const start = startPct * buffer.duration;
        source.start(0, start, durationSec);
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
        if (this.gainNode) this.gainNode.gain.value = val;
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

    detectTransients(buffer, thresholdPercent = 50, minSilenceDuration = 0.05) {
        const sampleRate = buffer.sampleRate;
        const windowSize = Math.floor(sampleRate * 0.01);
        const minSilenceSamples = Math.floor(sampleRate * minSilenceDuration);
        const chopPoints = [0];

        const channelData = buffer.getChannelData(0);
        const rmsValues = [];

        let maxRMS = 0;
        for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
            let sum = 0;
            for (let j = 0; j < windowSize && i + j < channelData.length; j++) {
                sum += channelData[i + j] * channelData[i + j];
            }
            const rms = Math.sqrt(sum / windowSize);
            rmsValues.push({ index: i, rms });
            if (rms > maxRMS) maxRMS = rms;
        }

        const minThreshold = 0.01;
        const maxThreshold = maxRMS * 0.8;
        const threshold = minThreshold + (thresholdPercent / 100) * (maxThreshold - minThreshold);

        let inSilence = false;
        let silenceStart = 0;

        for (let i = 1; i < rmsValues.length; i++) {
            const prevRms = rmsValues[i - 1].rms;
            const currRms = rmsValues[i].rms;
            const rmsDiff = currRms - prevRms;

            if (currRms < threshold) {
                if (!inSilence) {
                    inSilence = true;
                    silenceStart = rmsValues[i].index;
                }
            } else {
                if (inSilence) {
                    const silenceDuration = (rmsValues[i].index - silenceStart) / sampleRate;
                    if (silenceDuration >= minSilenceDuration) {
                        chopPoints.push(silenceStart);
                    }
                    inSilence = false;
                }

                if (rmsDiff > threshold * 2 && currRms > threshold) {
                    chopPoints.push(rmsValues[i].index);
                }
            }
        }

        if (chopPoints[chopPoints.length - 1] !== buffer.length) {
            chopPoints.push(buffer.length);
        }

        const uniqueChops = [...new Set(chopPoints)].sort((a, b) => a - b);
        return uniqueChops;
    }

    createChops(buffer, chopPoints) {
        const chops = [];
        for (let i = 0; i < chopPoints.length - 1; i++) {
            const startFrame = chopPoints[i];
            const endFrame = chopPoints[i + 1];
            const frameCount = endFrame - startFrame;

            if (frameCount <= 0) continue;

            const chopBuffer = this.context.createBuffer(
                buffer.numberOfChannels,
                frameCount,
                buffer.sampleRate
            );

            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const oldData = buffer.getChannelData(ch);
                const newData = chopBuffer.getChannelData(ch);
                for (let j = 0; j < frameCount; j++) {
                    newData[j] = oldData[startFrame + j];
                }
            }

            chops.push({
                buffer: chopBuffer,
                startFrame,
                endFrame,
                startTime: startFrame / buffer.sampleRate,
                endTime: endFrame / buffer.sampleRate
            });
        }

        return chops;
    }

    equalDivide(buffer, sliceCount) {
        const frameCount = buffer.length;
        const framesPerSlice = Math.floor(frameCount / sliceCount);
        const chopPoints = [];

        for (let i = 0; i <= sliceCount; i++) {
            chopPoints.push(i * framesPerSlice);
        }

        chopPoints[chopPoints.length - 1] = frameCount;

        return this.createChops(buffer, chopPoints);
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

        if (this.delayMix > 0) {
            const delayNode = offlineContext.createDelay(1.0);
            delayNode.delayTime.value = this.delayTime;

            const delayGain = offlineContext.createGain();
            delayGain.gain.value = this.delayFeedback;
            delayNode.connect(delayGain);
            delayGain.connect(delayNode);

            const delayMix = offlineContext.createGain();
            const dryMix = offlineContext.createGain();
            delayMix.gain.value = this.delayMix;
            dryMix.gain.value = 1 - this.delayMix;

            currentNode.connect(dryMix);
            currentNode.connect(delayNode);
            delayNode.connect(delayMix);

            const delayMerge = offlineContext.createGain();
            dryMix.connect(delayMerge);
            delayMix.connect(delayMerge);
            currentNode = delayMerge;
        }

        if (this.reverbMix > 0) {
            const reverbMix = offlineContext.createGain();
            const dryMix = offlineContext.createGain();
            reverbMix.gain.value = this.reverbMix;
            dryMix.gain.value = 1 - this.reverbMix;

            const reverbDelays = [];
            const reverbTimes = [0.03, 0.05, 0.07, 0.09];

            for (let i = 0; i < reverbTimes.length; i++) {
                const delay = offlineContext.createDelay(0.2);
                delay.delayTime.value = reverbTimes[i];
                const gain = offlineContext.createGain();
                gain.gain.value = this.reverbDamping * 0.3;

                delay.connect(gain);
                gain.connect(delay);
                delay.connect(reverbMix);
                reverbDelays.push(delay);
            }

            currentNode.connect(dryMix);
            for (const delay of reverbDelays) {
                currentNode.connect(delay);
            }

            const reverbMerge = offlineContext.createGain();
            dryMix.connect(reverbMerge);
            reverbMix.connect(reverbMerge);
            currentNode = reverbMerge;
        }

        currentNode.connect(offlineContext.destination);
        source.start(0);

        return await offlineContext.startRendering();
    }

    setDelay(time, feedback, mix) {
        this.delayTime = time;
        this.delayFeedback = feedback;
        this.delayMix = mix;
        if (this.delayNode) {
            this.delayNode.delayTime.value = time;
        }
    }

    setReverb(roomSize, damping, mix) {
        this.reverbRoomSize = roomSize;
        this.reverbDamping = damping;
        this.reverbMix = mix;
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
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(44 + offset, sample, true);
                offset += 2;
            }
            sampleIndex++;
        }

        return new Blob([bufferArr], { type: 'audio/wav' });
    }
}
