
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
    gainNode: GainNode | null;
    mediaStreamDestination: MediaStreamAudioDestinationNode | null;
    mediaRecorder: MediaRecorder | null;
    state: string;
    activeSource: AudioBufferSourceNode | null;
    playbackStartTime: number;
    recordedChunks: BlobPart[];
    recordingBuffer: { min: number; max: number }[];
    onRecordingDataAvailable: ((blob: Blob) => void) | null;
    onRecordingStopped: ((blob: Blob, audioBuffer: AudioBuffer | null) => void) | null;
    onPlaybackEnded: (() => void) | null;
    onThresholdExceeded: (() => void) | null;
    outputVolume: number;
    threshold: number;
    isMonitoringThreshold: boolean;

    constructor();
    initContext(): void;
    connectStream(streamId: string): Promise<boolean>;
    connectDisplayMedia(): Promise<boolean>;
    startRecording(): void;
    stopRecording(): void;
    play(buffer: AudioBuffer, trimStart: number, trimEnd: number, loop: boolean): void;
    stop(): void;
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
    detectTransients(buffer: AudioBuffer, threshold?: number, minSilenceDuration?: number): number[];
    createChops(buffer: AudioBuffer, chopPoints: number[]): Array<{ buffer: AudioBuffer; startFrame: number; endFrame: number; startTime: number; endTime: number }>;
    equalDivide(buffer: AudioBuffer, sliceCount: number): Array<{ buffer: AudioBuffer; startFrame: number; endFrame: number; startTime: number; endTime: number }>;
    applyEffectsAndResample(buffer: AudioBuffer, targetSampleRate?: number | null): Promise<AudioBuffer>;
    setDelay(time: number, feedback: number, mix: number): void;
    setReverb(roomSize: number, damping: number, mix: number): void;
    getSampleRate(): number;
    bufferToBlob(buffer: AudioBuffer): Blob;
}
