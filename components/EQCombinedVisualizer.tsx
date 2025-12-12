import React, { useRef, useEffect, useMemo } from 'react';
import { useAudio } from '../src/context/AudioContext';
import { LazyMotion, domAnimation, motion } from 'motion/react';

interface Band {
  name: string;
  gain: number;
  freq: number;
  q: number;
  color: string;
}

interface EQCombinedVisualizerProps {
  isPlaying?: boolean;
  bands: Band[];
}

export const EQCombinedVisualizer: React.FC<EQCombinedVisualizerProps> = ({
  isPlaying = false,
  bands = []
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { engine } = useAudio();
  const captureBuffer = useRef(new Uint8Array(2048));
  const isPlayingRef = useRef(isPlaying);
  
  // Waveform buffer settings
  const TIME_WINDOW_MS = 150; // Show last 150ms of audio
  const SAMPLE_RATE = 44100;
  const samplesPerWindow = Math.ceil((TIME_WINDOW_MS / 1000) * SAMPLE_RATE);
  const bufferSize = Math.max(4096, samplesPerWindow * 2);
  
  const waveformBuffer = useRef<Float32Array>(new Float32Array(bufferSize));
  const bufferIndex = useRef(0);
  const isBufferFull = useRef(false);
  
  // Canvas dimensions
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const dprRef = useRef(1);

  // Update ref when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize canvas and handle resize
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      
      widthRef.current = rect.width;
      heightRef.current = rect.height;
      
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Reset buffer when playback stops
  useEffect(() => {
    if (!isPlaying) {
      bufferIndex.current = 0;
      isBufferFull.current = false;
      waveformBuffer.current.fill(0);
    }
  }, [isPlaying]);

  // Calculate EQ curve path (from EQVisualizer logic)
  const curvePath = useMemo(() => {
    if (bands.length === 0) return "";

    const points: [number, number][] = [];
    const width = 100;
    const height = 100;
    const minDb = -18;
    const maxDb = 18;
    const dbRange = maxDb - minDb;
    const minF = 20;
    const maxF = 20000;
    
    for (let x = 0; x <= width; x++) {
      const t = x / width;
      const f = minF * Math.pow(maxF / minF, t);
      
      let totalGain = 0;

      bands.forEach(band => {
        const f0 = band.freq;
        const q = band.q;
        const gain = band.gain;
        const octaves = Math.log2(f / f0);
        const sigma = 1 / (q * 1.2);
        const response = gain * Math.exp(-(octaves * octaves) / (2 * sigma * sigma));
        totalGain += response;
      });

      const pxPerDb = height / dbRange;
      const y = (height / 2) - (totalGain * pxPerDb);
      points.push([x, y]);
    }

    return `M ${points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L ")}`;
  }, [bands]);

  // Create individual band curve paths
  const bandCurves = useMemo(() => {
    return bands.map(band => {
      const points: [number, number][] = [];
      const width = 100;
      const height = 100;
      const minF = 20;
      const maxF = 20000;
      const minDb = -18;
      const maxDb = 18;
      const dbRange = maxDb - minDb;
      const pxPerDb = height / dbRange;

      for (let x = 0; x <= width; x++) {
        const t = x / width;
        const f = minF * Math.pow(maxF / minF, t);
        const f0 = band.freq;
        const q = band.q;
        const gain = band.gain;
        const octaves = Math.log2(f / f0);
        const sigma = 1 / (q * 1.2);
        const response = gain * Math.exp(-(octaves * octaves) / (2 * sigma * sigma));
        const y = (height / 2) - (response * pxPerDb);
        points.push([x, y]);
      }
      
      const path = `M ${points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L ")}`;
      const areaPath = `${path} L 100,50 L 0,50 Z`;
      
      return { color: band.color, areaPath, linePath: path };
    });
  }, [bands]);

  // Animation loop - waveform rendering
  useEffect(() => {
    let animId: number;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!canvasRef.current || !ctx || !engine) {
        animId = requestAnimationFrame(draw);
        return;
      }

      const width = widthRef.current;
      const height = heightRef.current;
      
      if (width <= 0 || height <= 0) {
        animId = requestAnimationFrame(draw);
        return;
      }
      
      const dpr = dprRef.current;
      
      // Clear canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Draw background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      // Check if audio is actually playing
      const isActuallyPlaying = isPlayingRef.current && engine.activeSource && engine.playbackAnalyserL;

      if (isActuallyPlaying) {
        // Get actual sample rate from engine
        const actualSampleRate = engine.context?.sampleRate || SAMPLE_RATE;
        const samplesPerWindow = Math.ceil((TIME_WINDOW_MS / 1000) * actualSampleRate);
        
        // Get processed audio data from analyser (after EQ filters)
        engine.playbackAnalyserL.getByteTimeDomainData(captureBuffer.current);
        
        // Convert byte data to normalized float values (-1 to 1)
        const samples = captureBuffer.current;
        const sampleCount = samples.length;
        
        // Add new samples to buffer (circular buffer)
        for (let i = 0; i < sampleCount; i++) {
          const normalized = (samples[i] - 128) / 128;
          waveformBuffer.current[bufferIndex.current] = normalized;
          bufferIndex.current = (bufferIndex.current + 1) % bufferSize;
          
          if (bufferIndex.current === 0 && !isBufferFull.current) {
            isBufferFull.current = true;
          }
        }

        // Draw center line (zero reference)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw waveform as a clear single line
        const centerY = height / 2;
        const amplitude = height * 0.4; // Use 40% of height for waveform amplitude
        
        const availableSamples = isBufferFull.current ? bufferSize : bufferIndex.current;
        
        if (availableSamples > 1 && width > 0) {
          const samplesToShow = Math.min(samplesPerWindow, availableSamples);
          
          if (samplesToShow > 0) {
            const samplesPerPixel = samplesToShow / width;
            
            // Find the oldest sample in our window
            const oldestSampleIdx = isBufferFull.current 
              ? (bufferIndex.current - samplesToShow + bufferSize) % bufferSize
              : Math.max(0, bufferIndex.current - samplesToShow);
            
            // Draw waveform as a single clear line
            ctx.strokeStyle = '#6ab0ff';
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            
            let pathStarted = false;
            
            for (let x = 0; x < width; x++) {
              const sampleOffset = Math.floor(x * samplesPerPixel);
              const sampleIdx = oldestSampleIdx + sampleOffset;
              
              let wrappedIdx: number;
              if (sampleIdx < 0) {
                wrappedIdx = (sampleIdx + bufferSize) % bufferSize;
              } else if (sampleIdx >= bufferSize) {
                wrappedIdx = sampleIdx % bufferSize;
              } else {
                wrappedIdx = sampleIdx;
              }
              
              if (wrappedIdx < 0 || wrappedIdx >= bufferSize) continue;
              
              const sample = waveformBuffer.current[wrappedIdx];
              const y = centerY - (sample * amplitude);
              const clampedY = Math.max(0, Math.min(height, y));
              
              if (!pathStarted) {
                ctx.moveTo(x, clampedY);
                pathStarted = true;
              } else {
                ctx.lineTo(x, clampedY);
              }
            }
            
            ctx.stroke();
          }
        }
      } else {
        // Not playing - show empty state with center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [engine, isPlaying]);

  return (
    <LazyMotion features={domAnimation}>
      <div
        ref={containerRef}
        className="w-full h-40 bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden relative shadow-inner"
        style={{ minWidth: 0, maxWidth: '100%' }}
      >
        {/* Canvas layer - waveform */}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full block" 
          style={{ display: 'block' }}
        />
        
        {/* SVG overlay - EQ frequency response curve */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="w-full h-full" 
                 style={{ 
                   backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)', 
                   backgroundSize: '20px 20px',
                   backgroundPosition: 'center'
                 }}>
            </div>
            {/* Center line (0dB) */}
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/20"></div>
          </div>

          {/* SVG Container */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            {/* Individual Band Fills (Subtle) */}
            {bandCurves.map((curve, i) => (
               <path 
                  key={`area-${i}`}
                  d={curve.areaPath}
                  fill={curve.color}
                  fillOpacity="0.1"
                  className="mix-blend-screen"
               />
            ))}

            {/* Individual Band Lines (Subtle) */}
            {bandCurves.map((curve, i) => (
               <path 
                  key={`line-${i}`}
                  d={curve.linePath}
                  fill="none"
                  stroke={curve.color}
                  strokeWidth="0.5"
                  strokeOpacity="0.3"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="2 2"
               />
            ))}

            {/* Master Curve */}
            <motion.path
              d={curvePath}
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
              initial={false}
              animate={{ d: curvePath }}
              transition={{ type: "tween", ease: "linear", duration: 0.1 }}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs pointer-events-none">
            Play audio to see waveform
          </div>
        )}
      </div>
    </LazyMotion>
  );
};















