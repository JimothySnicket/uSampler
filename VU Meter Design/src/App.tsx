import React, { useState, useEffect, useRef } from 'react';
import { VUMeter } from './components/VUMeter';
import { VolumePaddle } from './components/VolumePaddle';

export default function App() {
  const [volume, setVolume] = useState(0.75); 
  const [levels, setLevels] = useState({ left: 0, right: 0 });
  
  const currentLevels = useRef({ left: 0, right: 0 });
  const targetLevels = useRef({ left: 0, right: 0 });
  const volumeRef = useRef(volume);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    const attackSmoothing = 0.5; 
    const decaySmoothing = 0.2;
    let signalPhase = 0;

    const loop = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      signalPhase += delta * 5;
      const baseL = (Math.sin(signalPhase) + 1) / 2; 
      const baseR = (Math.cos(signalPhase * 0.9) + 1) / 2;
      const beat = (Math.sin(time * 10) > 0.8) ? Math.random() : 0;
      
      const rawInputL = (baseL * 0.6 + Math.random() * 0.2 + beat * 0.5) * volumeRef.current;
      const rawInputR = (baseR * 0.6 + Math.random() * 0.2 + beat * 0.5) * volumeRef.current;

      targetLevels.current.left = Math.min(Math.max(rawInputL, 0), 2.0); 
      targetLevels.current.right = Math.min(Math.max(rawInputR, 0), 2.0);

      const applyBallistics = (current: number, target: number) => {
         const smoothing = target > current ? attackSmoothing : decaySmoothing;
         return current + (target - current) * smoothing;
      };

      currentLevels.current.left = applyBallistics(currentLevels.current.left, targetLevels.current.left);
      currentLevels.current.right = applyBallistics(currentLevels.current.right, targetLevels.current.right);

      setLevels({
        left: currentLevels.current.left,
        right: currentLevels.current.right
      });

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []); 

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 sm:p-8 font-sans text-neutral-200">
        <header className="mb-8 text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-400 tracking-[0.2em] uppercase mb-2">Studio Console</h1>
            <p className="text-neutral-600 text-xs sm:text-sm">Responsive Strip Layout</p>
        </header>

        {/* 
          Container for the 25% width test. 
          We'll use a responsive max-width container that mimics the user's request.
          On large screens, it will be narrow (like a 25% column). 
          On small screens, it takes up more space.
        */}
        <div className="w-full max-w-[320px] bg-[#1a1a1a] rounded-xl p-6 sm:p-8 shadow-2xl border border-neutral-800 relative overflow-hidden mx-auto">
            {/* Texture */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-felt.png')] opacity-20 pointer-events-none"></div>
            
            {/* Screws */}
            <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-neutral-800 shadow-inner flex items-center justify-center border border-neutral-900"><div className="w-full h-0.5 bg-neutral-950 rotate-45"></div></div>
            <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-neutral-800 shadow-inner flex items-center justify-center border border-neutral-900"><div className="w-full h-0.5 bg-neutral-950 rotate-12"></div></div>
            <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-neutral-800 shadow-inner flex items-center justify-center border border-neutral-900"><div className="w-full h-0.5 bg-neutral-950 rotate-90"></div></div>
            <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-neutral-800 shadow-inner flex items-center justify-center border border-neutral-900"><div className="w-full h-0.5 bg-neutral-950 rotate-[30deg]"></div></div>

            {/* Main Interface - Compact Grid/Flex */}
            <div className="relative z-10 flex flex-row items-stretch justify-between gap-2 h-[300px]">
                
                {/* Left Channel */}
                <div className="flex-1 flex justify-center min-w-0">
                    <VUMeter level={levels.left} channel="Left" className="h-full" />
                </div>

                {/* Center Control */}
                <div className="flex-[0.8] flex justify-center min-w-0 pt-4 pb-8">
                     <VolumePaddle volume={volume} onChange={setVolume} className="h-full" />
                </div>

                {/* Right Channel */}
                <div className="flex-1 flex justify-center min-w-0">
                    <VUMeter level={levels.right} channel="Right" className="h-full" />
                </div>

            </div>
            
            <div className="mt-8 text-center pt-3 border-t border-neutral-800/50">
               <span className="text-[8px] text-neutral-600 uppercase tracking-widest font-mono block">Stereo Bus • Model 76</span>
            </div>
        </div>
    </div>
  );
}
