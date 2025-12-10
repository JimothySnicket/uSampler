import React, { useMemo } from 'react';
import { LazyMotion, domAnimation, motion } from 'motion/react';

interface Band {
  name: string;
  gain: number;
  freq: number;
  q: number;
  color: string;
}

interface EQVisualizerProps {
  bands?: Band[];
}

export const EQVisualizer: React.FC<EQVisualizerProps> = ({ bands = [] }) => {
  // Calculate the EQ curve path
  const curvePath = useMemo(() => {
    if (bands.length === 0) return "";

    const points: [number, number][] = [];
    const width = 100;
    const height = 100; // working in 0-100 coordinates
    const minDb = -18;
    const maxDb = 18;
    const dbRange = maxDb - minDb;

    // Logarithmic frequency scale: 20Hz to 20kHz
    const minF = 20;
    const maxF = 20000;
    
    // Generate points
    for (let x = 0; x <= width; x++) {
      // Convert x (0-100) to Frequency
      const t = x / width;
      const f = minF * Math.pow(maxF / minF, t);
      
      let totalGain = 0;

      bands.forEach(band => {
        // Gaussian approximation on log scale for Peaking EQ
        // f0 = center freq
        // Q controls width
        const f0 = band.freq;
        const q = band.q;
        const gain = band.gain;

        // Log distance in octaves
        const octaves = Math.log2(f / f0);
        
        // Width factor: Higher Q -> Narrower curve
        // This constant is tuned for visual resemblance to standard EQ curves
        const sigma = 1 / (q * 1.2); 
        
        const response = gain * Math.exp(-(octaves * octaves) / (2 * sigma * sigma));
        totalGain += response;
      });

      const pxPerDb = height / dbRange;
      const y = (height / 2) - (totalGain * pxPerDb);
      
      points.push([x, y]);
    }

    // Construct SVG path
    return `M ${points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L ")}`;
  }, [bands]);

  // Create individual curve paths for each band (filled)
  const bandCurves = useMemo(() => {
    return bands.map(band => {
       const points: [number, number][] = [];
       const width = 100;
       const height = 100;
       const minF = 20;
       const maxF = 20000;
       const minDb = -18;
       const maxDb = 18;
       const dbRange = maxDb - minDb;
       const pxPerDb = height / dbRange;

       for (let x = 0; x <= width; x++) {
          const t = x / width;
          const f = minF * Math.pow(maxF / minF, t);
          const f0 = band.freq;
          const q = band.q;
          const gain = band.gain;
          const octaves = Math.log2(f / f0);
          const sigma = 1 / (q * 1.2);
          const response = gain * Math.exp(-(octaves * octaves) / (2 * sigma * sigma));
          
          const y = (height / 2) - (response * pxPerDb);
          points.push([x, y]);
       }
       
       const path = `M ${points.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" L ")}`;
       // Add closing points to make a filled area relative to center (0dB)
       const areaPath = `${path} L 100,50 L 0,50 Z`;
       
       return { color: band.color, areaPath, linePath: path };
    });
  }, [bands]);

  return (
    <LazyMotion features={domAnimation}>
      <div className="w-full h-40 bg-zinc-950 rounded-xl border border-zinc-800/50 overflow-hidden relative shadow-inner">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="w-full h-full" 
               style={{ 
                 backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)', 
                 backgroundSize: '20px 20px',
                 backgroundPosition: 'center'
               }}>
          </div>
          {/* Center line (0dB) */}
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/20"></div>
        </div>

        {/* SVG Container */}
        <div className="absolute inset-0">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            {/* Individual Band Fills (Subtle) */}
            {bandCurves.map((curve, i) => (
               <path 
                  key={`area-${i}`}
                  d={curve.areaPath}
                  fill={curve.color}
                  fillOpacity="0.1"
                  className="mix-blend-screen"
               />
            ))}

             {/* Individual Band Lines (Subtle) */}
            {bandCurves.map((curve, i) => (
               <path 
                  key={`line-${i}`}
                  d={curve.linePath}
                  fill="none"
                  stroke={curve.color}
                  strokeWidth="0.5"
                  strokeOpacity="0.3"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="2 2"
               />
            ))}

            {/* Master Curve */}
            <motion.path
              d={curvePath}
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
              initial={false}
              animate={{ d: curvePath }}
              transition={{ type: "tween", ease: "linear", duration: 0.1 }}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        
         {/* Simulated Audio Activity (Background) */}
        <div className="absolute bottom-0 left-0 right-0 h-full flex items-end justify-between px-2 gap-0.5 opacity-20 pointer-events-none -z-10 mix-blend-color-dodge">
          {Array.from({ length: 32 }).map((_, i) => (
            <motion.div
              key={i}
              className="flex-1 bg-white rounded-t-[1px]"
              animate={{ 
                height: ["5%", `${Math.random() * 40 + 10}%`, "5%"] 
              }}
              transition={{
                duration: Math.random() * 1.5 + 0.5,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: i * 0.05
              }}
            />
          ))}
        </div>
      </div>
    </LazyMotion>
  );
};

