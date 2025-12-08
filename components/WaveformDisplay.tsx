import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sample, Region, Chop } from '../types';
import { useAudio } from '../src/context/AudioContext';
import { WaveformVisualizer } from '../src/core/WaveformVisualizer';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface WaveformDisplayProps {
  sample?: Sample | null;
  region: Region;
  onRegionChange: (region: Region) => void;
  isPlaying: boolean;
  isRecording?: boolean;
  chops?: Chop[];
  activeChopId?: string | null;
  chopsLinked?: boolean;
  onChopClick?: (chopId: string) => void;
  onChopUpdate?: (chops: Chop[]) => void;
  previewMode?: boolean;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  sample,
  region,
  onRegionChange,
  isPlaying,
  isRecording = false,
  chops = [],
  activeChopId = null,
  chopsLinked = true,
  onChopClick,
  onChopUpdate,
  previewMode = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vizRef = useRef<WaveformVisualizer | null>(null);
  const { engine } = useAudio();
  const captureBuffer = useRef(new Uint8Array(2048));

  const [zoom, setZoom] = useState(1.0);
  const [scrollOffset, setScrollOffset] = useState(0.0);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'pan' | 'chop-start' | 'chop-end' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartRegion, setDragStartRegion] = useState<Region>({ start: 0, end: 1 });
  const [dragStartScroll, setDragStartScroll] = useState(0);
  const [draggingChopId, setDraggingChopId] = useState<string | null>(null);
  const [dragStartChops, setDragStartChops] = useState<Chop[]>([]);

  // Initialize Visualizer
  useEffect(() => {
    if (canvasRef.current && !vizRef.current) {
      vizRef.current = new WaveformVisualizer(canvasRef.current, {
        color: '#818cf8',
        backgroundColor: 'transparent',
        playheadColor: '#ffffff',
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

    // Hit test for Chops first (if present)
    if (chops.length > 0) {
      const hitThreshold = 6; // pixels

      for (const chop of chops) {
        // Check Start
        const startPx = normalizedToPixel(chop.start);
        if (Math.abs(mouseX - startPx) < hitThreshold) {
          setIsDragging('chop-start');
          setDraggingChopId(chop.id);
          setDragStartX(mouseX);
          setDragStartChops(chops);
          setDragStartScroll(scrollOffset);
          return;
        }

        // Check End
        const endPx = normalizedToPixel(chop.end);
        if (Math.abs(mouseX - endPx) < hitThreshold) {
          setIsDragging('chop-end');
          setDraggingChopId(chop.id);
          setDragStartX(mouseX);
          setDragStartChops(chops);
          setDragStartScroll(scrollOffset);
          return;
        }
      }
    }

    // Default to region dragging or panning
    setIsDragging(type);
    setDragStartX(mouseX);
    setDragStartRegion({ ...region });
    setDragStartScroll(scrollOffset);
  }, [region, scrollOffset, chops, normalizedToPixel]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current || !sample) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = containerRef.current.clientWidth;
    const visibleDuration = 1 / zoom;
    const maxScroll = Math.max(0, 1 - visibleDuration);

    // Handle chop dragging
    if ((isDragging === 'chop-start' || isDragging === 'chop-end') && draggingChopId && onChopUpdate) {
      const mouseX = e.clientX - rect.left;
      const relativeX = Math.max(0, Math.min(1, mouseX / width));
      const targetNormalized = scrollOffset + (relativeX * visibleDuration);
      const clampedPosition = Math.max(0, Math.min(1, targetNormalized));

      const updatedChops = [...dragStartChops];
      const chopIndex = updatedChops.findIndex(c => c.id === draggingChopId);
      if (chopIndex === -1) return;

      const chop = updatedChops[chopIndex];

      if (isDragging === 'chop-start') {
        const newStart = Math.max(0, Math.min(chop.end - 0.001, clampedPosition));
        updatedChops[chopIndex] = { ...chop, start: newStart, startFrame: Math.floor(newStart * sample.buffer!.length) };

        // If linked, update previous chop's end
        if (chopsLinked && chopIndex > 0) {
          updatedChops[chopIndex - 1] = {
            ...updatedChops[chopIndex - 1],
            end: newStart,
            endFrame: Math.floor(newStart * sample.buffer!.length)
          };
        }
      } else {
        const newEnd = Math.max(chop.start + 0.001, Math.min(1, clampedPosition));
        updatedChops[chopIndex] = { ...chop, end: newEnd, endFrame: Math.floor(newEnd * sample.buffer!.length) };

        // If linked, update next chop's start
        if (chopsLinked && chopIndex < updatedChops.length - 1) {
          updatedChops[chopIndex + 1] = {
            ...updatedChops[chopIndex + 1],
            start: newEnd,
            startFrame: Math.floor(newEnd * sample.buffer!.length)
          };
        }
      }

      onChopUpdate(updatedChops);
      onChopUpdate(updatedChops);
      return;
    }

    // Cursor update for hover (when not dragging)
    if (!isDragging) {
      const mouseX = e.clientX - rect.left;
      const hitThreshold = 6;
      let cursor = 'default';

      // Check Region edges
      const regionStartPx = normalizedToPixel(region.start);
      const regionEndPx = normalizedToPixel(region.end);

      if (Math.abs(mouseX - regionStartPx) < hitThreshold || Math.abs(mouseX - regionEndPx) < hitThreshold) {
        cursor = 'ew-resize';
      }

      // Check Chops
      if (cursor === 'default' && chops.length > 0) {
        for (const chop of chops) {
          if (Math.abs(mouseX - normalizedToPixel(chop.start)) < hitThreshold ||
            Math.abs(mouseX - normalizedToPixel(chop.end)) < hitThreshold) {
            cursor = 'col-resize';
            break;
          }
        }
      }

      if (containerRef.current.style.cursor !== cursor) {
        containerRef.current.style.cursor = cursor;
      }
    }

    if (isDragging === 'chop-start' || isDragging === 'chop-end') return;

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
  }, [isDragging, dragStartX, dragStartRegion, dragStartScroll, zoom, scrollOffset, onRegionChange, draggingChopId, dragStartChops, chopsLinked, onChopUpdate, sample]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
    setDraggingChopId(null);
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
          const elapsed = engine.context.currentTime - (engine.playbackStartTime || engine.context.currentTime); // Logic might differ for recording duration
          // Actually MediaRecorder duration? 
          // AudioEngine doesn't track recording start time strictly in state.
          // Using context time relative to start? 
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

            // Highlight selected region - brighter background
            ctx.fillStyle = 'rgba(129, 140, 248, 0.15)'; // Indigo tint for selected area
            ctx.fillRect(startX, 0, endX - startX, h);

            // Stronger selection border lines - thicker and brighter
            ctx.strokeStyle = '#818cf8';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(startX, 0);
            ctx.lineTo(startX, h);
            ctx.moveTo(endX, 0);
            ctx.lineTo(endX, h);
            ctx.stroke();

            // Draw brighter flag indicators at top of lines
            ctx.fillStyle = '#22c55e'; // Green for start
            ctx.fillRect(startX - 1, 0, 2, 6);
            ctx.fillStyle = '#ef4444'; // Red for end
            ctx.fillRect(endX - 1, 0, 2, 6);

            // Draw chop markers
            if (chops && chops.length > 0) {
              chops.forEach((chop) => {
                const chopStartX = Math.max(0, Math.min(w, normalizedToPixel(chop.start)));
                const chopEndX = Math.max(0, Math.min(w, normalizedToPixel(chop.end)));
                const isActive = chop.id === activeChopId;

                // Highlight active chop region
                if (isActive) {
                  ctx.fillStyle = 'rgba(129, 140, 248, 0.2)';
                  ctx.fillRect(chopStartX, 0, chopEndX - chopStartX, h);
                }

                // Draw chop boundary lines
                ctx.save();
                ctx.strokeStyle = isActive ? '#818cf8' : previewMode ? 'rgba(129, 140, 248, 0.5)' : '#3f3f46';
                ctx.lineWidth = isActive ? 2 : 1;
                if (previewMode && !isActive) {
                  ctx.setLineDash([4, 4]); // Dashed line for ghost chops
                }

                ctx.beginPath();
                ctx.moveTo(chopStartX, 0);
                ctx.lineTo(chopStartX, h);
                if (chopEndX !== w) {
                  ctx.moveTo(chopEndX, 0);
                  ctx.lineTo(chopEndX, h);
                }
                ctx.stroke();
                ctx.restore();
              });
            }
          }

          // Draw Playhead & Update Time
          const duration = sample.buffer.duration;
          let currentPos = 0;

          if (isPlaying && engine.context) {
            const elapsed = engine.context.currentTime - engine.playbackStartTime;
            const progress = (elapsed % duration) / duration;
            currentPos = elapsed % duration;
            if (elapsed < duration) { // Or loop logic?
              vizRef.current.drawPlayhead(progress);
            }
          }

          if (timeDisplayRef.current) {
            timeDisplayRef.current.innerText = `${formatTime(currentPos)} / ${formatTime(duration)}`;
          }
        } else {
          vizRef.current.clear();
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, [engine, sample, isPlaying, isRecording, region, normalizedToPixel, chops, activeChopId, previewMode]);

  if (!sample && !isRecording) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">
        No sample loaded
      </div>
    );
  }

  const containerWidth = containerRef.current?.clientWidth || 1;
  // Calculate pixel positions for markers - these are the vertical lines
  const startMarkerX = sample ? Math.max(0, Math.min(containerWidth, normalizedToPixel(region.start))) : 0;
  const endMarkerX = sample ? Math.max(0, Math.min(containerWidth, normalizedToPixel(region.end))) : containerWidth;

  // Tab positioning: Start tab left-aligns to marker (faces right), End tab right-aligns to marker (faces left)
  // Start tab: left edge of tab aligns with marker, but constrained so it doesn't go off left edge
  const startTabLeft = Math.max(0, startMarkerX);
  // End tab: right edge of tab aligns with marker (40px wide), constrained so it doesn't go off right edge
  const endTabLeft = Math.min(containerWidth - 40, endMarkerX - 40);

  // Ensure flags are always visible even if their position is off-screen
  // They can extend beyond container but will still be aligned with the waveform

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onWheel={handleWheel}
      onMouseDown={(e) => {
        if (!sample || isDragging) return;

        // Check if clicking on a chop region
        if (chops && chops.length > 0 && onChopClick) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const clickPos = pixelToNormalized(mouseX);

            // Find which chop was clicked
            const clickedChop = chops.find(chop => clickPos >= chop.start && clickPos <= chop.end);
            if (clickedChop) {
              onChopClick(clickedChop.id);
              return;
            }
          }
        }

        // If clicking on waveform (not flags or chop handles), start pan
        if (e.target === canvasRef.current || (e.target === containerRef.current && !(e.target as HTMLElement).closest('[data-flag]') && !(e.target as HTMLElement).closest('[data-chop-handle]'))) {
          handleMouseDown(e, 'pan');
        }
      }}
    >
      {/* Canvas container - clip to bounds */}
      <div className="absolute inset-0 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Flags overlay - Crop flags at TOP, Chop flags at BOTTOM */}
      {sample && containerWidth > 0 && (
        <>
          {/* Crop Start/End Flags - at TOP, only show when no chops active */}
          {(!chops || chops.length === 0) && (
            <>
              <div
                data-flag="start"
                className="absolute cursor-ew-resize pointer-events-auto z-30"
                style={{
                  left: `${startTabLeft}px`,
                  top: '8px',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'start');
                }}
              >
                <div className="w-10 h-6 bg-green-500 rounded-t-md flex items-center justify-center shadow-lg border border-green-400 border-b-0">
                  <span className="text-white text-xs font-bold">S</span>
                </div>
              </div>

              <div
                data-flag="end"
                className="absolute cursor-ew-resize pointer-events-auto z-30"
                style={{
                  left: `${endTabLeft}px`,
                  top: '8px',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, 'end');
                }}
              >
                <div className="w-10 h-6 bg-red-500 rounded-t-md flex items-center justify-center shadow-lg border border-red-400 border-b-0">
                  <span className="text-white text-xs font-bold">E</span>
                </div>
              </div>
            </>
          )}

          {/* Chop flags - ALL at BOTTOM of waveform */}
          {chops && chops.length > 0 && chops.map((chop) => {
            const startX = normalizedToPixel(chop.start);
            const endX = normalizedToPixel(chop.end);
            const isActive = chop.id === activeChopId;

            // Show all chops (not just active one)
            // All chop flags go at bottom, extending downward

            const chopStartTabLeft = Math.max(0, Math.min(containerWidth - 40, startX));
            const chopEndTabLeft = Math.max(0, Math.min(containerWidth - 40, endX - 40));

            return (
              <React.Fragment key={chop.id}>
                {/* Start flag */}
                <div
                  data-chop-flag={`${chop.id}-start`}
                  className="absolute cursor-ew-resize pointer-events-auto z-25"
                  style={{
                    left: `${chopStartTabLeft}px`,
                    bottom: '8px',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDragging('chop-start');
                    setDraggingChopId(chop.id);
                    const rect = containerRef.current?.getBoundingClientRect();
                    setDragStartX(rect ? e.clientX - rect.left : e.clientX);
                    setDragStartChops([...chops]);
                  }}
                >
                  <div className={`w-8 h-5 rounded-b-md flex items-center justify-center shadow-lg border border-t-0 ${isActive
                    ? 'bg-green-500 border-green-400'
                    : 'bg-green-500/60 border-green-400/60'
                    }`}>
                    <span className="text-white text-[10px] font-bold">S</span>
                  </div>
                </div>

                {/* End flag */}
                <div
                  data-chop-flag={`${chop.id}-end`}
                  className="absolute cursor-ew-resize pointer-events-auto z-25"
                  style={{
                    left: `${chopEndTabLeft}px`,
                    bottom: '8px',
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsDragging('chop-end');
                    setDraggingChopId(chop.id);
                    const rect = containerRef.current?.getBoundingClientRect();
                    setDragStartX(rect ? e.clientX - rect.left : e.clientX);
                    setDragStartChops([...chops]);
                  }}
                >
                  <div className={`w-8 h-5 rounded-b-md flex items-center justify-center shadow-lg border border-t-0 ${isActive
                    ? 'bg-red-500 border-red-400'
                    : 'bg-red-500/60 border-red-400/60'
                    }`}>
                    <span className="text-white text-[10px] font-bold">E</span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* Zoom Controls */}
      {sample && (
        <div className="absolute bottom-2 right-2 flex gap-1 z-10">
          <button
            onClick={handleZoomOut}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="px-2 py-1.5 bg-zinc-800 text-zinc-400 text-xs font-mono rounded border border-zinc-700">
            {zoom.toFixed(1)}x
          </div>
        </div>
      )}
    </div>
  );
};
