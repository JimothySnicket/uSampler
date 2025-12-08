import React from 'react';

interface DBFSDisplayProps {
  level: number; // 0 to 1 linear
}

export const DBFSDisplay: React.FC<DBFSDisplayProps> = ({ level }) => {
  // Calculate dBFS
  // Assuming 1.0 = 0 dBFS
  let dbfs = 20 * Math.log10(Math.max(level, 0.00001));
  if (dbfs < -96) dbfs = -Infinity;

  const displayValue = dbfs === -Infinity ? "-INF" : dbfs.toFixed(1);
  
  // Color calculation for the text
  let color = "text-green-500";
  if (dbfs > -3) color = "text-yellow-500";
  if (dbfs > -0.1) color = "text-red-500";

  return (
    <div className="bg-black border border-gray-700 rounded p-2 w-32 flex flex-col items-center shadow-inner">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">dBFS Peak</span>
      <div className={`font-mono text-xl ${color} font-bold tabular-nums tracking-tighter leading-none shadow-glow`}>
        {displayValue}
      </div>
    </div>
  );
};
