import React, { useState, useEffect, useRef } from 'react';

interface EQKnobProps {
  label: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  value?: number; // Controlled mode
  onChange?: (value: number) => void;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  formatValue?: (val: number) => string;
}

export const EQKnob: React.FC<EQKnobProps> = ({
  label,
  min = -12,
  max = 12,
  defaultValue = 0,
  value: controlledValue,
  onChange,
  color = "var(--eq-high)", // Default blue
  size = 'md',
  formatValue = (val) => `${val > 0 ? '+' : ''}${val.toFixed(1)}dB`
}) => {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : internalValue;
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const startValueRef = useRef<number>(value);

  // Sync startValueRef when value changes (for controlled mode)
  useEffect(() => {
    if (!isDragging) {
      startValueRef.current = value;
    }
  }, [value, isDragging]);

  // Dimensions based on size
  const dimensions = {
    sm: { size: 32, stroke: 3, padding: 4 },
    md: { size: 48, stroke: 4, padding: 6 },
    lg: { size: 64, stroke: 4, padding: 8 }
  }[size];

  const w = dimensions.size;
  const cx = w / 2;
  const cy = w / 2;
  const r = (w / 2) - dimensions.padding;
  const strokeWidth = dimensions.stroke;

  // Calculate rotation
  const range = max - min;
  const percentage = (value - min) / range;
  const rotation = -135 + (percentage * 270);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = isControlled ? controlledValue : internalValue;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || startYRef.current === null) return;

      const deltaY = startYRef.current - e.clientY;
      const sensitivity = (max - min) / 200; // Adjust sensitivity based on range
      const deltaValue = deltaY * sensitivity;

      let newValue = startValueRef.current + deltaValue;
      newValue = Math.max(min, Math.min(max, newValue));

      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      startYRef.current = null;
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  // SVG Calculation
  const circumference = 2 * Math.PI * r;
  const arcLength = 270 / 360 * circumference; // 270 degree arc

  return (
    <div className="flex flex-col items-center gap-1.5 select-none group">
      <div 
        className="relative cursor-ns-resize"
        style={{ width: w, height: w }}
        onMouseDown={handleMouseDown}
      >
        {/* Track Ring */}
        <svg className="w-full h-full transform pointer-events-none" style={{ transform: 'rotate(-135deg)' }}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="transparent"
            stroke="var(--knob-track)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>

        {/* Value Ring (Active) */}
        <svg className="absolute top-0 left-0 w-full h-full transform -rotate-90 pointer-events-none" style={{ transform: 'rotate(-135deg)' }}>
           <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="transparent"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={arcLength * (1 - percentage)}
            strokeLinecap="round"
            className="drop-shadow-sm transition-all duration-75"
          />
        </svg>

        {/* Knob Body/Indicator */}
        <div
          className="absolute top-1/2 left-1/2 rounded-full flex items-center justify-center transition-transform duration-75"
          style={{
            width: w * 0.6,
            height: w * 0.6,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            background: 'var(--overlay-hover)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.5)'
          }}
        >
          <div className="w-[2px] h-[30%] rounded-full absolute -top-[10%] left-1/2 -translate-x-1/2" style={{ background: 'var(--text-primary)', boxShadow: '0 0 4px rgba(255,255,255,0.3)' }}></div>
        </div>
      </div>
      
      {size !== 'sm' && (
        <div className="text-center -mt-0.5">
          <div className="text-[10px] font-bold uppercase tracking-widest transition-colors leading-none mb-1" style={{ color: 'var(--text-faint)' }}>{label}</div>
          <div className="text-[9px] font-mono leading-none" style={{ color: 'var(--text-faint)' }}>{formatValue(value)}</div>
        </div>
      )}
      {size === 'sm' && (
         <div className="text-center -mt-1">
          <div className="text-[9px] font-medium transition-colors leading-none" style={{ color: 'var(--text-faint)' }}>{label}</div>
        </div>
      )}
    </div>
  );
};

