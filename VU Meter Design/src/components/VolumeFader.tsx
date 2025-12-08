import React, { useRef, useEffect, useState } from 'react';

interface VolumeFaderProps {
  value: number; // 0 to 1
  onChange: (val: number) => void;
}

export const VolumeFader: React.FC<VolumeFaderProps> = ({ value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updateValue(e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateValue(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const updateValue = (clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    
    // Calculate 0-1 value from bottom to top
    // clientY is from top.
    // relative Y from top of track
    const relativeY = clientY - rect.top;
    
    // Percentage from top (0 = top = 100% volume, height = bottom = 0% volume)
    // Actually typically faders are: Top is Max, Bottom is Min.
    let percentage = 1 - (relativeY / rect.height);
    
    // Clamp
    percentage = Math.max(0, Math.min(1, percentage));
    
    onChange(percentage);
  };

  // Paddle travel height calculation
  // We want the paddle center to move from say 10% to 90% of the container to allow room.
  // Actually, standard faders often go full travel.
  // Let's keep it simple: Top 0%, Bottom 100% relative to the container height minus paddle height?
  // Let's just use a percentage top.
  const paddleHeight = 80; // px approx
  const containerHeight = 320; // 20rem = 320px
  // Available travel
  // We want value 1 -> Top
  // value 0 -> Bottom

  return (
    <div className="flex flex-col items-center">
      {/* Container */}
      <div 
        ref={trackRef}
        className="relative w-24 h-80 bg-gray-900 rounded-lg shadow-2xl border-x border-gray-800 cursor-ns-resize touch-none select-none overflow-visible"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Tick Marks (decorative) */}
        <div className="absolute top-4 bottom-4 w-full flex justify-between px-3 pointer-events-none opacity-60">
          <div className="flex flex-col justify-between h-full text-[9px] text-gray-400 font-mono text-right w-6">
             <span>+10</span>
             <span>+5</span>
             <span>0</span>
             <span>-5</span>
             <span>-10</span>
             <span>-20</span>
             <span>-∞</span>
          </div>
          <div className="flex flex-col justify-between h-full items-end w-2">
             {[...Array(21)].map((_, i) => (
               <div key={i} className={`h-[1px] bg-gray-600 ${i % 5 === 0 ? 'w-full' : 'w-1/2'}`}></div>
             ))}
          </div>
        </div>

        {/* Track Slot */}
        <div className="absolute top-4 bottom-4 left-1/2 -translate-x-1/2 w-3 bg-black rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border border-gray-800"></div>

        {/* Paddle */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-14 h-20 pointer-events-none transition-transform duration-75 ease-out will-change-transform"
          style={{ 
            // Calculate top position. 
            // When value is 1, top should be near 0 + margin.
            // When value is 0, top should be near 100% - height - margin.
            top: `${(1 - value) * (100 - 25)}%`, // 25% accounts for paddle height roughly relative to container
             marginTop: '4px'
          }}
        >
            {/* Paddle Body */}
            <div className={`
              w-full h-full 
              bg-gradient-to-b from-gray-700 via-gray-800 to-gray-900 
              rounded-md 
              shadow-[0_8px_16px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.2)] 
              border-t border-gray-600 
              flex flex-col items-center justify-center
              transform active:scale-95 transition-transform
              ${isDragging ? 'brightness-110' : ''}
            `}>
               {/* Grip Texture */}
               <div className="w-full flex flex-col items-center gap-1 opacity-40">
                  <div className="w-10 h-[2px] bg-black"></div>
                  <div className="w-10 h-[2px] bg-black"></div>
                  <div className="w-10 h-[2px] bg-black"></div>
                  <div className="w-10 h-[2px] bg-black"></div>
               </div>
               
               {/* Center Indicator */}
               <div className="absolute top-1/2 w-full h-[2px] bg-white opacity-80 shadow-[0_0_4px_white]"></div>
            </div>
        </div>
      </div>
      
      {/* Label under fader */}
      <div className="mt-4 text-xs font-mono text-gray-500 uppercase tracking-widest">Master</div>
    </div>
  );
};
