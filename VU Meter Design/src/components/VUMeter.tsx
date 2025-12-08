import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';

interface VUMeterProps {
  level: number; // 0 to 1 linear amplitude
  channel: 'Left' | 'Right';
  className?: string;
}

export const VUMeter: React.FC<VUMeterProps> = ({ level, channel, className }) => {
  const dbValue = useMemo(() => {
     if (level <= 0.0001) return -Infinity;
     return 20 * Math.log10(level) + 3;
  }, [level]);

  const dbfsValue = useMemo(() => {
    if (level <= 0.0001) return -Infinity;
    return 20 * Math.log10(level);
  }, [level]);

  const segments = useMemo(() => {
    const minDb = -30;
    const maxDb = 6;
    const range = maxDb - minDb;
    const segmentCount = 40;

    return Array.from({ length: segmentCount }).map((_, i) => {
        const percent = i / (segmentCount - 1);
        const segDb = minDb + (percent * range);
        
        let colorClass = "bg-green-500";
        let glowClass = "shadow-[0_0_4px_#22c55e]";
        
        if (segDb >= 0) {
            colorClass = "bg-red-500";
            glowClass = "shadow-[0_0_5px_#ef4444]";
        } else if (segDb >= -6) {
            colorClass = "bg-yellow-400";
            glowClass = "shadow-[0_0_4px_#facc15]";
        }

        return {
            db: segDb,
            colorClass,
            glowClass
        };
    });
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-2 w-full max-w-[120px]", className)}>
      {/* Housing */}
      <div className="relative w-full bg-[#fdf6e3] p-1 rounded-lg border border-neutral-600 shadow-xl flex flex-row items-stretch justify-center gap-1 aspect-[1/4] min-h-[200px]">
         
         {/* Markings Left */}
         <div className="flex flex-col justify-between py-1 text-[8px] font-bold text-neutral-500 font-mono text-right w-[20%] select-none leading-none">
            <span>+6</span>
            <span>+3</span>
            <span className="text-black">0</span>
            <span>-3</span>
            <span>-6</span>
            <span>-10</span>
            <span>-20</span>
            <span>-30</span>
         </div>

         {/* Meter Window */}
         <div className="relative flex-1 bg-neutral-900 rounded-[2px] border border-neutral-700 shadow-inner overflow-hidden flex flex-col-reverse p-[1px] gap-[1px]">
            {/* Glass Glare */}
            <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent pointer-events-none z-20"></div>
            
            {/* Segments */}
            {segments.map((seg, i) => {
                const isActive = dbValue >= seg.db;
                return (
                    <div 
                        key={i} 
                        className={`w-full flex-1 rounded-[0.5px] transition-colors duration-75 ${isActive ? `${seg.colorClass} ${seg.glowClass} opacity-100` : 'bg-neutral-800 opacity-30'}`}
                    />
                );
            })}
         </div>

         {/* Markings Right (Decorative) */}
         <div className="flex flex-col justify-between py-1 w-[15%] select-none opacity-50 items-start">
             <div className="h-px w-2 bg-neutral-400"></div>
             <div className="h-px w-2 bg-neutral-400"></div>
             <div className="h-px w-3 bg-black"></div>
             <div className="h-px w-2 bg-neutral-400"></div>
             <div className="h-px w-2 bg-neutral-400"></div>
             <div className="h-px w-2 bg-neutral-400"></div>
             <div className="h-px w-2 bg-neutral-400"></div>
             <div className="h-px w-2 bg-neutral-400"></div>
         </div>
      </div>

      {/* Digital Readout */}
      <div className="w-full flex flex-col items-center">
        <div className="bg-[#222] text-green-400 font-mono text-xs sm:text-sm font-bold px-2 py-0.5 rounded border border-neutral-600 shadow-md w-full text-center">
            {dbfsValue <= -90 ? '-∞' : dbfsValue.toFixed(1)}
        </div>
        <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mt-1 text-center truncate w-full">
            {channel}
        </div>
      </div>
    </div>
  );
};
