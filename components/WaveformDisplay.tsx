import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Sample, Region } from '../types';
import { useAudio } from '../src/context/AudioContext';
import { WaveformVisualizer } from '../src/core/WaveformVisualizer';
import { ZoomIn, ZoomOut, Scissors, Activity } from 'lucide-react';
import { getCanvasTheme } from '../src/utils/themeUtils';

interface WaveformDisplayProps {
  sample?: Sample | null;
  region: Region;
  onRegionChange: (region: Region) => void;
  isPlaying: boolean;
  isRecording?: boolean;
  isLooping?: boolean;
  onCrop?: () => void;
  onNormalize?: () => void;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  sample,
  region,
  onRegionChange,
  isPlaying,
  isRecording = false,
  isLooping = false,
  onCrop,
  onNormalize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<WaveformVisualizer | null>(null);
  const { engine } = useAudio();
  const captureBuffer = useRef(new Uint8Array(2048));

  const [zoom, setZoom] = useState(1.0);
  const [scrollOffset, setScrollOffset] = useState(0.0);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'pan' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartRegion, setDragStartRegion] = useState<Region>({ start: 0, end: 1 });
  const [dragStartScroll, setDragStartScroll] = useState(0);
  const prevSampleIdRef = useRef<string | undefined>(sample?.id);
  const canvasTheme = useMemo(() => getCanvasTheme(), []);

  // Reset zoom when sample changes or when a new sample is created
  useEffect(() => {
    const currentSampleId = sample?.id;
    const prevSampleId = prevSampleIdRef.current;

    // Reset zoom if sample ID changed (different sample selected or new sample created)
    if (currentSampleId !== prevSampleId && prevSampleId !== undefined) {
      setZoom(1.0);
      setScrollOffset(0.0);
    }

    prevSampleIdRef.current = currentSampleId;
  }, [sample?.id]);

  // Initialize Visualizer
  useEffect(() => {
    if (canvasRef.current && !vizRef.current) {
      vizRef.current = new WaveformVisualizer(canvasRef.current, {
        color: canvasTheme.waveformColor,
        backgroundColor: 'transparent',
        playheadColor: canvasTheme.playhead,
        amplitudeScale: 0.8
      });
    }
  }, []);

  // Update zoom and scroll in visualizer
  useEffect(() => {
    if (vizRef.current) {
      vizRef.current.zoomLevel = zoom;
      vizRef.current.scrollOffset = scrollOffset;
    }
  }, [zoom, scrollOffset]);

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (vizRef.current) vizRef.current.resize();
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Convert pixel X to normalized position (0-1) based on zoom/scroll
  const pixelToNormalized = useCallback((pixelX: number): number => {
    const width = containerRef.current?.clientWidth || 1;
    const visibleStart = scrollOffset;
    const visibleDuration = 1 / zoom;

    // X position relative to visible area (0-1)
    const relativeX = pixelX / width;
    // Convert to global position (0-1)
    return Math.max(0, Math.min(1, visibleStart + relativeX * visibleDuration));
  }, [zoom, scrollOffset]);

  // Convert normalized position (0-1) to pixel X
  const normalizedToPixel = useCallback((normalized: number): number => {
    const width = containerRef.current?.clientWidth || 1;
    const visibleStart = scrollOffset;
    const visibleDuration = 1 / zoom;

    // Convert global position to relative position
    const relativeX = (normalized - visibleStart) / visibleDuration;
    return relativeX * width;
  }, [zoom, scrollOffset]);

  // Handle mouse/touch events
  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'pan') => {
    e.preventDefault();
    e.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;

    setIsDragging(type);
    setDragStartX(mouseX);
    setDragStartRegion({ ...region });
    setDragStartScroll(scrollOffset);
  }, [region, scrollOffset]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current || !sample) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = containerRef.current.clientWidth;
    const visibleDuration = 1 / zoom;
    const maxScroll = Math.max(0, 1 - visibleDuration);

    if (isDragging === 'start' || isDragging === 'end') {
      // Convert mouse position to normalized position (0-1) based on current view
      const mouseX = e.clientX - rect.left;

      // Calculate what normalized position this pixel represents
      const relativeX = Math.max(0, Math.min(1, mouseX / width));
      const targetNormalized = scrollOffset + (relativeX * visibleDuration);

      // Clamp to valid range
      let newPosition = Math.max(0, Math.min(1, targetNormalized));

      // Ensure start < end with minimum gap
      if (isDragging === 'start') {
        newPosition = Math.max(0, Math.min(dragStartRegion.end - 0.001, newPosition));
        onRegionChange({ ...dragStartRegion, start: newPosition });
      } else {
        newPosition = Math.max(dragStartRegion.start + 0.001, Math.min(1, newPosition));
        onRegionChange({ ...dragStartRegion, end: newPosition });
      }

      // Auto-scroll when dragging flag near edges
      if (zoom > 1) {
        const edgeThreshold = 0.1; // 10% from edge triggers scroll
        const mouseRelative = mouseX / width;

        let newScroll = scrollOffset;

        if (mouseRelative < edgeThreshold && scrollOffset > 0) {
          // Near left edge, scroll left
          const scrollSpeed = (edgeThreshold - mouseRelative) / edgeThreshold;
          newScroll = Math.max(0, scrollOffset - (scrollSpeed * visibleDuration * 0.05));
        } else if (mouseRelative > (1 - edgeThreshold) && scrollOffset < maxScroll) {
          // Near right edge, scroll right
          const scrollSpeed = (mouseRelative - (1 - edgeThreshold)) / edgeThreshold;
          newScroll = Math.min(maxScroll, scrollOffset + (scrollSpeed * visibleDuration * 0.05));
        }

        if (newScroll !== scrollOffset) {
          setScrollOffset(newScroll);
        }
      }
    } else if (isDragging === 'pan') {
      // Panning the waveform
      const currentX = e.clientX - rect.left;
      const deltaX = currentX - dragStartX;
      const deltaNormalized = (deltaX / width) / zoom;
      const newScroll = Math.max(0, Math.min(maxScroll, dragStartScroll - deltaNormalized));
      setScrollOffset(newScroll);
    }
  }, [isDragging, dragStartX, dragStartRegion, dragStartScroll, zoom, scrollOffset, onRegionChange, sample]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Wheel zoom - just scroll wheel over waveform
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (sample) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(1, Math.min(20, zoom * delta));

      // Zoom toward mouse position
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mousePos = pixelToNormalized(mouseX);

        setZoom(newZoom);
        // Adjust scroll to keep mouse position stable
        const width = containerRef.current?.clientWidth || 1;
        const newScroll = Math.max(0, Math.min(1 - (1 / newZoom), mousePos - (mouseX / width) / newZoom));
        setScrollOffset(newScroll);
      }
    }
  }, [zoom, pixelToNormalized, sample]);

  // Zoom controls
  const handleZoomIn = () => {
    const newZoom = Math.min(20, zoom * 1.5);
    setZoom(newZoom);
    // Keep center position
    const maxScroll = Math.max(0, 1 - (1 / newZoom));
    setScrollOffset(Math.min(maxScroll, scrollOffset));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(1, zoom / 1.5);
    setZoom(newZoom);
    // Keep center position
    const maxScroll = Math.max(0, 1 - (1 / newZoom));
    setScrollOffset(Math.min(maxScroll, scrollOffset));
  };


  // Format MM:SS.ms
  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10); // 1 decimal place
    return `${min}:${sec.toString().padStart(2, '0')}.${ms}`;
  };

  const timeDisplayRef = useRef<HTMLDivElement>(null);

  // Animation Loop
  useEffect(() => {
    let animId: number;

    const animate = () => {
      if (!vizRef.current || !engine) return;

      if (isRecording) {
        // Live Mode
        if (engine.analyserNode) {
          engine.analyserNode.getByteTimeDomainData(captureBuffer.current);
          if (engine.processLiveAudio) {
            engine.processLiveAudio(captureBuffer.current);
          }
        }
        if (engine.recordingBuffer) {
          vizRef.current.liveData = engine.recordingBuffer;
          vizRef.current.drawLive();
        }
        // Update Time for Recording
        if (timeDisplayRef.current && engine.context) {
          timeDisplayRef.current.innerText = "REC " + formatTime(engine.recordingBuffer ? engine.recordingBuffer.length * 0.046 : 0); // Approx
        }
      } else {
        // Static Mode
        if (sample && sample.buffer) {
          vizRef.current.drawStatic(sample.buffer);

          // Draw selection region overlay (after waveform)
          if (vizRef.current && vizRef.current.ctx && vizRef.current.width) {
            const ctx = vizRef.current.ctx;
            const w = vizRef.current.width;
            const h = vizRef.current.height;

            const startX = Math.max(0, Math.min(w, normalizedToPixel(region.start)));
            const endX = Math.max(0, Math.min(w, normalizedToPixel(region.end)));

            // Stronger overlay outside selection - darker and more obvious
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            if (startX > 0) ctx.fillRect(0, 0, startX, h);
            if (endX < w) ctx.fillRect(endX, 0, w - endX, h);

            // Subtle tint for selected region
            ctx.fillStyle = `${canvasTheme.accentIndigo}15`;
            ctx.fillRect(startX, 0, endX - startX, h);

            // Thin selection border lines
            ctx.strokeStyle = `${canvasTheme.accentIndigo}80`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(startX, 0);
            ctx.lineTo(startX, h);
            ctx.moveTo(endX, 0);
            ctx.lineTo(endX, h);
            ctx.stroke();
          }

          // Draw Playhead & Update Time
          const duration = sample.buffer.duration;
          let currentPos = 0;

          if (isPlaying && engine.context && engine.playbackStartTime > 0) {
            // Calculate elapsed real time since playback started
            const elapsed = engine.context.currentTime - engine.playbackStartTime;

            // Get playback rate (accounts for time-stretching)
            const playbackRate = engine.currentPlaybackRate || 1.0;

            const actualRegionStart = region.start;
            const actualRegionEnd = region.end;

            // The region being played (in seconds of the buffer)
            const regionStartTime = actualRegionStart * duration;
            const regionEndTime = actualRegionEnd * duration;
            const regionDuration = regionEndTime - regionStartTime;

            // Calculate how much buffer time has elapsed
            const bufferTimeElapsed = elapsed * playbackRate;

            // Calculate current position in the buffer
            let bufferPosition = regionStartTime + bufferTimeElapsed;

            // If looping, wrap the position back to start when it exceeds the end
            if (isLooping && engine.isLooping) {
              bufferPosition = regionStartTime + (bufferTimeElapsed % regionDuration);
            } else if (bufferPosition > regionEndTime) {
              bufferPosition = regionEndTime;
            }

            const effectivePlaybackDuration = regionDuration / playbackRate;
            const tolerance = 0.5;

            const shouldShowPlayhead = isLooping && engine.isLooping
              ? true
              : playbackRate !== 1.0
                ? elapsed <= effectivePlaybackDuration + tolerance && bufferPosition <= regionEndTime + (duration * 0.1)
                : elapsed <= effectivePlaybackDuration + tolerance && bufferPosition <= regionEndTime + tolerance;

            if (shouldShowPlayhead) {
              currentPos = isLooping && engine.isLooping
                ? bufferPosition
                : Math.max(regionStartTime, Math.min(bufferPosition, regionEndTime));

              const bufferProgress = Math.max(0, Math.min(currentPos / duration, 1.0));

              if (vizRef.current && vizRef.current.ctx && vizRef.current.width) {
                const ctx = vizRef.current.ctx;
                const w = vizRef.current.width;
                const h = vizRef.current.height;
                const zoom = vizRef.current.zoomLevel || 1.0;
                const scroll = vizRef.current.scrollOffset || 0.0;

                const visibleStart = scroll;
                const visibleEnd = scroll + (1 / zoom);

                if (bufferProgress >= visibleStart && bufferProgress <= visibleEnd) {
                  const x = (bufferProgress - visibleStart) * zoom * w;
                  ctx.fillStyle = vizRef.current.options.playheadColor || '#ffffff';
                  ctx.fillRect(x, 0, 2, h);
                }
              } else {
                vizRef.current.drawPlayhead(bufferProgress);
              }
            }
          }

          if (timeDisplayRef.current) {
            const playbackRate = engine?.currentPlaybackRate || 1.0;
            const effectiveDuration = duration / playbackRate;
            timeDisplayRef.current.innerText = `${formatTime(currentPos)} / ${formatTime(effectiveDuration)}`;
          }
        } else {
          vizRef.current.clear();
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, [engine, sample, isPlaying, isRecording, region, normalizedToPixel, isLooping]);

  if (!sample && !isRecording) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--text-faint)' }}>
        No sample loaded
      </div>
    );
  }

  const containerWidth = containerRef.current?.clientWidth || 1;
  // Calculate pixel positions for markers - these are the vertical lines
  const startMarkerX = sample ? Math.max(0, Math.min(containerWidth, normalizedToPixel(region.start))) : 0;
  const endMarkerX = sample ? Math.max(0, Math.min(containerWidth, normalizedToPixel(region.end))) : containerWidth;

  // Tab positioning: Start tab left-aligns to marker, End tab right-aligns to marker
  const startTabLeft = Math.max(0, startMarkerX);
  const endTabLeft = Math.min(containerWidth - 20, endMarkerX - 20);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onWheel={handleWheel}
      onMouseDown={(e) => {
        if (!sample || isDragging) return;

        // If clicking on waveform (not flags), start pan
        if (e.target === canvasRef.current || (e.target === containerRef.current && !(e.target as HTMLElement).closest('[data-flag]'))) {
          handleMouseDown(e, 'pan');
        }
      }}
    >
      {/* Canvas container - clip to bounds */}
      <div className="absolute inset-0 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Crop Start/End Flags */}
      {sample && containerWidth > 0 && (
        <>
          <div
            data-flag="start"
            className="absolute cursor-ew-resize pointer-events-auto z-30"
            style={{
              left: `${startTabLeft}px`,
              top: '4px',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleMouseDown(e, 'start');
            }}
          >
            <div className="w-5 h-3.5 rounded-sm flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--vu-green) 60%, var(--surface))', border: '1px solid var(--vu-green)' }}>
              <span className="text-[7px] font-bold" style={{ color: 'var(--vu-green)' }}>S</span>
            </div>
          </div>

          <div
            data-flag="end"
            className="absolute cursor-ew-resize pointer-events-auto z-30"
            style={{
              left: `${endTabLeft}px`,
              top: '4px',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              handleMouseDown(e, 'end');
            }}
          >
            <div className="w-5 h-3.5 rounded-sm flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--vu-red) 60%, var(--surface))', border: '1px solid var(--vu-red)' }}>
              <span className="text-[7px] font-bold" style={{ color: 'var(--vu-red)' }}>E</span>
            </div>
          </div>
        </>
      )}

      {/* Floating Crop + Normalize buttons — visible when region is adjusted */}
      {sample && (region.start > 0.001 || region.end < 0.999) && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-20">
          {onCrop && (
            <button
              onClick={(e) => { e.stopPropagation(); onCrop(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer hover:opacity-90 transition-opacity shadow-lg"
              style={{ background: 'var(--accent-indigo)', color: '#fff' }}
            >
              <Scissors className="w-3 h-3" /> Crop
            </button>
          )}
          {onNormalize && (
            <button
              onClick={(e) => { e.stopPropagation(); onNormalize(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer hover:opacity-90 transition-opacity shadow-lg"
              style={{ background: 'var(--success)', color: '#fff' }}
            >
              <Activity className="w-3 h-3" /> Normalize
            </button>
          )}
        </div>
      )}

      {/* Zoom Controls */}
      {sample && zoom > 1 && (
        <div className="absolute bottom-1 right-1 flex gap-px z-10 opacity-60 hover:opacity-100 transition-opacity">
          <button
            onClick={handleZoomOut}
            className="p-0.5 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="Zoom Out"
          >
            <ZoomOut className="w-2.5 h-2.5" />
          </button>
          <div className="px-1 py-0.5 text-[8px] font-mono rounded-sm" style={{ background: 'var(--surface)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
            {zoom.toFixed(1)}x
          </div>
          <button
            onClick={handleZoomIn}
            className="p-0.5 rounded-sm cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            title="Zoom In"
          >
            <ZoomIn className="w-2.5 h-2.5" />
          </button>
        </div>
      )}
    </div>
  );
};
