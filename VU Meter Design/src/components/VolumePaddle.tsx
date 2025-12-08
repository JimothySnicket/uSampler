import React from 'react';
import { cn } from '../../lib/utils';

interface VolumePaddleProps {
  volume: number;
  onChange: (val: number) => void;
  className?: string;
}

export const VolumePaddle: React.FC<VolumePaddleProps> = ({ volume, onChange, className }) => {
  return (
    <div className={cn("flex flex-col items-center gap-2 w-full h-full justify-center", className)}>
      <div 
        className="relative bg-[#111] w-full max-w-[60px] h-full min-h-[200px] rounded-md border border-[#222] shadow-[inset_0_2px_10px_rgba(0,0,0,1)] flex justify-center touch-none select-none"
      >
        {/* Track Line */}
        <div className="absolute top-2 bottom-2 w-[10%] min-w-[4px] bg-black rounded-full shadow-[inset_0_0_5px_rgba(0,0,0,1)] z-0"></div>
        
        {/* Ticks */}
        <div className="absolute top-0 bottom-0 w-full pointer-events-none h-full opacity-60">
           {[...Array(11)].map((_, i) => (
             <React.Fragment key={i}>
                 <div 
                    className="absolute w-[15%] h-px bg-neutral-500 left-1" 
                    style={{ top: `${10 + i * 8}%`, opacity: (i % 5 === 0) ? 1 : 0.5 }}
                 />
                 <div 
                    className="absolute w-[15%] h-px bg-neutral-500 right-1" 
                    style={{ top: `${10 + i * 8}%`, opacity: (i % 5 === 0) ? 1 : 0.5 }}
                 />
             </React.Fragment>
           ))}
        </div>

        {/* Interaction Overlay */}
        <div 
            className="absolute inset-0 z-30 cursor-ns-resize"
            onPointerMove={(e) => {
                if (e.buttons !== 1) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                // Invert because slider bottom is 0? No, usually bottom is min volume.
                // But typically faders: Top = Max (0dB), Bottom = Min (-inf).
                // So Top (y=0) -> Volume 1.0
                // Bottom (y=h) -> Volume 0.0
                const val = 1 - (y / rect.height);
                onChange(val);
            }}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                const val = 1 - (y / rect.height);
                onChange(val);
            }}
        ></div>

        {/* Visual Paddle Handle */}
        <div 
            className="absolute w-[80%] max-w-[48px] h-[25%] max-h-[60px] z-10 pointer-events-none transition-none left-1/2"
            style={{ 
                // Position logic:
                // Volume 1 -> Top 0%
                // Volume 0 -> Top 100%
                top: `${(1 - volume) * 100}%`,
                transform: `translate(-50%, -50%)`,
                // We clamp visual range slightly purely for aesthetics if needed, but 0-100% works if we center the handle.
                // At 0%, center of handle is at top edge. Half handle sticks out.
                // Ideally we want to clamp it so it stays inside.
                // But for now, let's leave it as "center on value".
            }}
        >
             {/* Inner Render */}
            <div className="w-full h-full bg-gradient-to-b from-[#333] to-[#1a1a1a] rounded-sm border-t border-white/10 border-b border-black shadow-[0_4px_10px_rgba(0,0,0,0.8)] relative flex flex-col items-center justify-center gap-1">
                {/* Grip */}
                <div className="w-[60%] h-0.5 bg-black/60 border-b border-white/5"></div>
                <div className="w-[60%] h-0.5 bg-black/60 border-b border-white/5"></div>
                <div className="w-[60%] h-0.5 bg-black/60 border-b border-white/5"></div>
                
                {/* Center Line */}
                <div className="absolute w-full h-[1px] bg-white/50 top-1/2 -translate-y-1/2"></div>
            </div>
        </div>
      </div>
      
      <div className="text-[8px] sm:text-[9px] text-neutral-500 font-bold tracking-widest uppercase mt-2 bg-black/40 px-2 py-1 rounded border border-white/5 whitespace-nowrap select-none">
        Main
      </div>
    </div>
  );
};
