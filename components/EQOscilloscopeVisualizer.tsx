import React, { useRef, useEffect } from 'react';
import { useAudio } from '../src/context/AudioContext';

interface EQOscilloscopeVisualizerProps {
  isPlaying?: boolean;
}

export const EQOscilloscopeVisualizer: React.FC<EQOscilloscopeVisualizerProps> = ({
  isPlaying = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { engine } = useAudio();
  const captureBuffer = useRef(new Uint8Array(2048));
  const isPlayingRef = useRef(isPlaying);
  
  // Oscilloscope settings - fixed time base (time window to display)
  const TIME_WINDOW_MS = 50; // Show last 50ms of audio (adjustable)
  const SAMPLE_RATE = 44100; // Standard sample rate (will get actual from engine if available)
  
  // Calculate buffer size based on time window
  // We need enough samples to show the time window at the sample rate
  const samplesPerWindow = Math.ceil((TIME_WINDOW_MS / 1000) * SAMPLE_RATE);
  const bufferSize = Math.max(4096, samplesPerWindow * 2); // Extra buffer for smooth scrolling
  
  const waveformBuffer = useRef<Float32Array>(new Float32Array(bufferSize));
  const bufferIndex = useRef(0);
  const isBufferFull = useRef(false);
  const lastUpdateTime = useRef(0);
  
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
      // Ensure we have valid dimensions
      if (rect.width <= 0 || rect.height <= 0) return;
      
      widthRef.current = rect.width;
      heightRef.current = rect.height;
      
      // Set canvas size attributes (actual pixel size)
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      
      // Set CSS size (display size)
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      // Scale context to handle DPR
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.scale(dpr, dpr);
      }
    };

    // Initial resize
    resizeCanvas();

    // Watch for container size changes
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

  // Animation loop - oscilloscope rendering
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
      
      // Skip if dimensions are invalid
      if (width <= 0 || height <= 0) {
        animId = requestAnimationFrame(draw);
        return;
      }
      
      const dpr = dprRef.current;
      
      // Clear canvas - use actual canvas dimensions
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Reset transform and scale for DPR
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // Draw background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      // Check if audio is actually playing
      const isActuallyPlaying = isPlayingRef.current && engine.activeSource && engine.playbackAnalyserL;

      if (isActuallyPlaying) {
        // Get actual sample rate from engine if available
        const actualSampleRate = engine.context?.sampleRate || SAMPLE_RATE;
        const samplesPerWindow = Math.ceil((TIME_WINDOW_MS / 1000) * actualSampleRate);
        
        // Get processed audio data from analyser (after EQ filters)
        engine.playbackAnalyserL.getByteTimeDomainData(captureBuffer.current);
        
        // Convert byte data to normalized float values (-1 to 1)
        const samples = captureBuffer.current;
        const sampleCount = samples.length;
        
        // Add new samples to buffer (circular buffer)
        // Samples are added continuously, creating a scrolling effect
        for (let i = 0; i < sampleCount; i++) {
          // Convert from 0-255 to -1 to 1
          const normalized = (samples[i] - 128) / 128;
          
          waveformBuffer.current[bufferIndex.current] = normalized;
          bufferIndex.current = (bufferIndex.current + 1) % bufferSize;
          
          if (bufferIndex.current === 0 && !isBufferFull.current) {
            isBufferFull.current = true;
          }
        }

        // Draw center line (zero reference)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw waveform with proper time base
        // Show exactly samplesPerWindow samples, scaled to fit width
        ctx.strokeStyle = '#6ab0ff';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        const centerY = height / 2;
        const amplitude = height * 0.45; // Use 45% of height for waveform amplitude
        
        // Determine how many samples we have available
        const availableSamples = isBufferFull.current ? bufferSize : bufferIndex.current;
        
        if (availableSamples > 1 && width > 0) {
          // Show exactly samplesPerWindow samples (fixed time window)
          // This ensures linear time base - each pixel represents the same amount of time
          const samplesToShow = Math.min(samplesPerWindow, availableSamples);
          
          // Ensure we have valid samples to show
          if (samplesToShow > 0) {
            // Calculate samples per pixel for linear time base
            const samplesPerPixel = samplesToShow / width;
            
            // Find the oldest sample in our window (most recent samples are just before bufferIndex)
            const oldestSampleIdx = isBufferFull.current 
              ? (bufferIndex.current - samplesToShow + bufferSize) % bufferSize
              : Math.max(0, bufferIndex.current - samplesToShow);
            
            // Draw waveform with proper linear scaling
            let pathStarted = false;
            
            for (let x = 0; x < width; x++) {
              // Map screen x position to buffer index with linear time base
              const sampleOffset = Math.floor(x * samplesPerPixel);
              const sampleIdx = oldestSampleIdx + sampleOffset;
              
              // Handle buffer wrapping
              let wrappedIdx: number;
              if (sampleIdx < 0) {
                wrappedIdx = (sampleIdx + bufferSize) % bufferSize;
              } else if (sampleIdx >= bufferSize) {
                wrappedIdx = sampleIdx % bufferSize;
              } else {
                wrappedIdx = sampleIdx;
              }
              
              // Ensure wrappedIdx is valid
              if (wrappedIdx < 0 || wrappedIdx >= bufferSize) continue;
              
              // Get sample value
              const sample = waveformBuffer.current[wrappedIdx];
              const y = centerY - (sample * amplitude);
              
              // Clamp y to canvas bounds
              const clampedY = Math.max(0, Math.min(height, y));
              
              if (!pathStarted) {
                ctx.moveTo(x, clampedY);
                pathStarted = true;
              } else {
                ctx.lineTo(x, clampedY);
              }
            }
          }
        }

        ctx.stroke();

        // Optional: Add subtle grid lines for time reference
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        const gridLines = 8;
        for (let i = 1; i < gridLines; i++) {
          const x = (i / gridLines) * width;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
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

      // Don't restore - we want to keep the DPR scaling
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [engine, isPlaying]);

  return (
    <div
      ref={containerRef}
      className="w-full h-40 bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden relative shadow-inner"
      style={{ minWidth: 0, maxWidth: '100%' }}
    >
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block" 
        style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
      />
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs pointer-events-none">
          Play audio to see oscilloscope
        </div>
      )}
    </div>
  );
};

