import React, { useState, useEffect, useCallback } from 'react';

interface KnobProps {
  label: string;
  value: number; // 0 to 100
  onChange: (value: number) => void;
  color?: string;
}

export const Knob: React.FC<KnobProps> = ({ label, value, onChange, color = 'text-indigo-500' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const newValue = Math.min(100, Math.max(0, startValue + deltaY));
    onChange(newValue);
  }, [isDragging, startY, startValue, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // SVG Calculation
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference * 0.75; // 270 degree arc
  const rotation = 135; // Start at bottom left

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div 
        className="relative w-12 h-12 cursor-ns-resize group"
        onMouseDown={handleMouseDown}
      >
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 44 44">
            {/* Background Track */}
            <circle
                cx="22" cy="22" r={radius}
                fill="none"
                stroke="#27272a"
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * 0.25} 
                style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center' }}
            />
            {/* Value Track */}
            <circle
                cx="22" cy="22" r={radius}
                fill="none"
                className={`${color}`}
                stroke="currentColor"
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center' }}
            />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-zinc-400 pointer-events-none">
            {Math.round(value)}
        </div>
      </div>
      <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{label}</span>
    </div>
  );
};
