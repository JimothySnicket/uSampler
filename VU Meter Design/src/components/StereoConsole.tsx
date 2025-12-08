import React, { useState, useEffect, useRef } from 'react';
import { VUMeter } from './VUMeter';
import { DBFSDisplay } from './DBFSDisplay';
import { VolumeFader } from './VolumeFader';

export const StereoConsole = () => {
  const [volume, setVolume] = useState(0.7);
  const [leftLevel, setLeftLevel] = useState(0);
  const [rightLevel, setRightLevel] = useState(0);

  // Audio simulation loop
  useEffect(() => {
    let animationFrameId: number;
    let time = 0;

    const animate = () => {
      time += 0.05;
      
      // Simulate somewhat realistic audio levels with perlin-ish noise
      // Base signal
      const baseSignal = (Math.sin(time) * 0.5 + 0.5) * (Math.cos(time * 0.3) * 0.5 + 0.5);
      
      // Add transient spikes (beats)
      const beat = Math.pow(Math.abs(Math.sin(time * 4)), 8);
      
      // Combine
      let rawLeft = (baseSignal * 0.7 + beat * 0.3) + (Math.random() * 0.05);
      let rawRight = (baseSignal * 0.7 + beat * 0.3) + (Math.random() * 0.05);

      // Add slight stereo separation/drift
      rawLeft *= 0.9 + (Math.sin(time * 1.5) * 0.1);
      rawRight *= 0.9 + (Math.cos(time * 1.2) * 0.1);

      // Apply master volume curve (logarithmic-ish feel)
      const outputGain = Math.pow(volume, 2); 
      
      setLeftLevel(Math.min(rawLeft * outputGain, 1.2)); // Allow slight over peak for visual effect
      setRightLevel(Math.min(rawRight * outputGain, 1.2));

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => cancelAnimationFrame(animationFrameId);
  }, [volume]);

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#1a1a1a] rounded-xl shadow-2xl border-t border-gray-700 min-h-[500px]">
      
      {/* Header */}
      <div className="w-full flex justify-between items-center mb-8 px-4 border-b border-gray-800 pb-4">
        <h1 className="text-gray-400 font-bold tracking-widest text-sm uppercase">Stereo Master Bus</h1>
        <div className="flex gap-2">
           <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
           <span className="text-xs text-green-500 font-mono">POWER</span>
        </div>
      </div>

      <div className="flex flex-row items-end gap-12">
        {/* Left Channel */}
        <div className="flex flex-col items-center gap-6">
          <VUMeter level={leftLevel} label="LEFT CHANNEL" />
          <DBFSDisplay level={leftLevel} />
        </div>

        {/* Center Volume Control */}
        <div className="flex flex-col items-center h-full justify-end pb-0">
          <div className="text-gray-500 text-xs font-mono mb-2 tracking-wider">MAIN LEVEL</div>
          <VolumeFader value={volume} onChange={setVolume} />
        </div>

        {/* Right Channel */}
        <div className="flex flex-col items-center gap-6">
          <VUMeter level={rightLevel} label="RIGHT CHANNEL" />
          <DBFSDisplay level={rightLevel} />
        </div>
      </div>

      {/* Footer Branding */}
      <div className="mt-12 text-gray-600 font-serif italic text-sm">
        Analog Simulation Series • Model 76
      </div>
    </div>
  );
};
