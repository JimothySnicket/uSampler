export interface WaveformVisualizerOptions {
    color?: string;
    backgroundColor?: string;
    playheadColor?: string;
    barWidth?: number;
    gap?: number;
    amplitudeScale?: number;
}

export declare class WaveformVisualizer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    options: WaveformVisualizerOptions;
    liveData: { min: number; max: number }[];
    staticPeaks: { min: number; max: number }[] | null;
    duration: number;
    zoomLevel: number;
    scrollOffset: number;
    width: number;
    height: number;

    constructor(canvas: HTMLCanvasElement, options?: WaveformVisualizerOptions);
    resize(): void;
    clear(): void;
    reset(): void;
    addLiveData(data: Uint8Array | Float32Array): void;
    drawLive(): void;
    drawStatic(buffer: AudioBuffer): void;
    drawPlayhead(progress: number): void;
}

