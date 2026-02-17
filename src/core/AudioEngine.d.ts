
export declare const AudioState: {
    IDLE: string;
    ARMED: string;
    RECORDING: string;
};

export declare class AudioEngine {
    context: AudioContext | null;
    sourceNode: MediaStreamAudioSourceNode | null;
    analyserNode: AnalyserNode | null;
    inputSplitter: ChannelSplitterNode | null;
    inputAnalyserL: AnalyserNode | null;
    inputAnalyserR: AnalyserNode | null;
    playbackSplitter: ChannelSplitterNode | null;
    playbackAnalyserL: AnalyserNode | null;
    playbackAnalyserR: AnalyserNode | null;
    masterGainNode: GainNode | null;
    recorderNode: AudioWorkletNode | null;
    state: string;
    activeSource: AudioBufferSourceNode | null;
    playbackStartTime: number;
    currentPlaybackRate: number;
    isLooping: boolean;
    recordingBuffer: { min: number; max: number }[];
    onRecordingDataAvailable: ((blob: Blob) => void) | null;
    onRecordingStopped: ((blob: Blob, audioBuffer: AudioBuffer | null) => void) | null;
    onPlaybackEnded: (() => void) | null;
    onThresholdExceeded: (() => void) | null;
    outputVolume: number;
    threshold: number;
    isMonitoringThreshold: boolean;

    constructor();
    initContext(): Promise<void>;
    connectStream(streamId: string): Promise<boolean>;
    connectDisplayMedia(): Promise<boolean>;
    startRecording(): boolean;
    stopRecording(): void;
    play(buffer: AudioBuffer, trimStart: number, trimEnd: number, loop: boolean, playbackRate?: number): void;
    stop(fadeOut?: boolean): void;
    playSnippet(buffer: AudioBuffer, startPct: number, durationSec?: number): void;
    getAnalyserData(timeData: Uint8Array): void;
    getStereoLevels(): { left: number; right: number };
    setVolume(val: number): void;
    processLiveAudio(timeData: Uint8Array): void;
    checkThreshold(): void;
    startThresholdMonitoring(): void;
    stopThresholdMonitoring(): void;
    crop(sample: any): Promise<AudioBuffer | null>;
    normalize(buffer: AudioBuffer): Promise<AudioBuffer>;
    reverse(buffer: AudioBuffer): Promise<AudioBuffer>;
    resampleBuffer(buffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer>;
    downsample(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer>;
    bitcrush(buffer: AudioBuffer, bitDepth: number): AudioBuffer;
    applyEffectsAndResample(buffer: AudioBuffer, targetSampleRate?: number | null): Promise<AudioBuffer>;

    setEQ(params: {
        enabled?: boolean;
        lowGain?: number;
        lowFreq?: number;
        midGain?: number;
        midFreq?: number;
        midQ?: number;
        highGain?: number;
        highFreq?: number;
    }): void;
    getSampleRate(): number;
    bufferToBlob(buffer: AudioBuffer): Blob;
    timeStretch(buffer: AudioBuffer, stretchRatio: number, onProgress?: ((progress: number) => void) | null): Promise<AudioBuffer>;
}
