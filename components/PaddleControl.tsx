import React, { useState, useCallback, useEffect } from 'react';

interface PaddleControlProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  step?: number;
  color?: 'indigo' | 'green' | 'yellow' | 'red';
  showNotches?: boolean;
  description?: string;
}

export const PaddleControl: React.FC<PaddleControlProps> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  unit = '%',
  step = 1,
  color = 'indigo',
  showNotches = true,
  description
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const range = max - min;
    const pixelsPerUnit = 100 / range; // Assuming 100px height
    const deltaValue = (deltaY / pixelsPerUnit) * step;
    const newValue = Math.min(max, Math.max(min, startValue + deltaValue));
    onChange(Math.round(newValue / step) * step);
  }, [isDragging, startY, startValue, onChange, min, max, step]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const percentage = ((value - min) / (max - min)) * 100;
  
  const colorClasses = {
    indigo: 'bg-indigo-500 border-indigo-400',
    green: 'bg-green-500 border-green-400',
    yellow: 'bg-yellow-500 border-yellow-400',
    red: 'bg-red-500 border-red-400'
  };

  const notchPositions = [0, 25, 50, 75, 100];

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="text-center">
        <div className="text-sm uppercase font-bold text-zinc-400 tracking-wider mb-2">{label}</div>
        {description && (
          <div className="text-xs text-zinc-500 mb-3 max-w-[100px] leading-relaxed">{description}</div>
        )}
        <div className={`text-2xl font-mono font-bold ${color === 'indigo' ? 'text-indigo-400' : color === 'green' ? 'text-green-400' : color === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
          {value}{unit}
        </div>
      </div>
      
      <div 
        className="relative w-12 h-32 bg-zinc-900 border border-zinc-800 rounded-md cursor-ns-resize group overflow-hidden"
        onMouseDown={handleMouseDown}
      >
        {/* Notches */}
        {showNotches && (
          <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
            {notchPositions.map((pos) => (
              <div 
                key={pos}
                className="w-full h-px bg-zinc-800"
                style={{ marginTop: pos === 0 ? '0' : pos === 100 ? 'auto' : 'auto', marginBottom: pos === 100 ? '0' : 'auto' }}
              />
            ))}
          </div>
        )}
        
        {/* Track */}
        <div className="absolute bottom-0 left-0 right-0 bg-zinc-800/50" style={{ height: `${100 - percentage}%` }} />
        
        {/* Value Fill */}
        <div 
          className={`absolute bottom-0 left-0 right-0 ${colorClasses[color]} transition-all duration-75`}
          style={{ height: `${percentage}%` }}
        />
        
        {/* Paddle Handle */}
        <div 
          className={`absolute left-0 right-0 ${colorClasses[color]} border-t-2 transition-all duration-75 shadow-lg`}
          style={{ 
            bottom: `${percentage}%`,
            height: '8px',
            marginBottom: '-4px'
          }}
        />
        
        {/* Value indicator line */}
        <div 
          className="absolute left-0 right-0 border-t border-white/30 pointer-events-none"
          style={{ 
            bottom: `${percentage}%`,
            marginBottom: '-0.5px'
          }}
        />
      </div>
    </div>
  );
};

