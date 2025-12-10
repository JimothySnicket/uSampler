import React, { useRef, useEffect } from 'react';
import { Sample } from '../types';
import { useAudio } from '../src/context/AudioContext';
import { WaveformVisualizer } from '../src/core/WaveformVisualizer';

interface EQWaveformVisualizerProps {
  sample?: Sample | null;
  isPlaying?: boolean;
}

export const EQWaveformVisualizer: React.FC<EQWaveformVisualizerProps> = ({
  sample,
  isPlaying = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<WaveformVisualizer | null>(null);
  const { engine } = useAudio();
  const captureBuffer = useRef(new Uint8Array(2048));
  const isPlayingRef = useRef(isPlaying);

  // Update ref when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize Visualizer
  useEffect(() => {
    if (canvasRef.current && !vizRef.current) {
      vizRef.current = new WaveformVisualizer(canvasRef.current, {
        color: '#6ab0ff', // Brighter blue to match EQ theme
        backgroundColor: 'transparent',
        playheadColor: '#ffffff',
        amplitudeScale: 0.8
      });
    }
  }, []);

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (vizRef.current) vizRef.current.resize();
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Reset visualizer when switching modes
  useEffect(() => {
    if (vizRef.current) {
      if (isPlaying) {
        // Reset when starting playback to clear old data
        vizRef.current.reset();
      } else if (sample && sample.buffer) {
        // Reset when stopping to prepare for static display
        vizRef.current.reset();
      }
    }
  }, [isPlaying, sample?.id]);

  // Animation Loop - Live mode during playback, static mode when stopped
  useEffect(() => {
    let animId: number;
    let lastMode: 'live' | 'static' | 'empty' = 'empty';

    const animate = () => {
      if (!vizRef.current || !engine) {
        animId = requestAnimationFrame(animate);
        return;
      }

      // Check if audio is actually playing (activeSource exists and analyser is available)
      const isActuallyPlaying = isPlayingRef.current && engine.activeSource && engine.playbackAnalyserL;

      // Live Mode: Read from playbackAnalyserL (after EQ processing)
      if (isActuallyPlaying) {
        // Reset if we just switched to live mode
        if (lastMode !== 'live') {
          vizRef.current.reset();
          lastMode = 'live';
        }

        // Get processed audio data from analyser (after EQ filters)
        engine.playbackAnalyserL.getByteTimeDomainData(captureBuffer.current);
        
        // Add data to visualizer for live display
        vizRef.current.addLiveData(captureBuffer.current);
        
        // Limit live data to prevent memory growth (keep last ~2000 points for smooth scrolling)
        if (vizRef.current.liveData.length > 2000) {
          vizRef.current.liveData = vizRef.current.liveData.slice(-1500);
        }
        
        vizRef.current.drawLive();
      } 
      // Static Mode: Show original sample waveform
      else if (sample && sample.buffer) {
        if (lastMode !== 'static') {
          vizRef.current.reset();
          lastMode = 'static';
        }
        vizRef.current.drawStatic(sample.buffer);
      } 
      // Empty state
      else {
        if (lastMode !== 'empty') {
          vizRef.current.reset();
          lastMode = 'empty';
        }
        vizRef.current.clear();
      }

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, [engine, sample, isPlaying]);

  return (
    <div
      ref={containerRef}
      className="w-full h-40 bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden relative shadow-inner"
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      {!sample && !isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs">
          Load a sample to see waveform
        </div>
      )}
    </div>
  );
};

