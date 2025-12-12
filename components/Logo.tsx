import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * uSampler Logo Component
 * Displays the custom uSampler logo (U-shaped design)
 */
export const Logo: React.FC<LogoProps> = ({ className = '', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="128" height="128" fill="#0F172A" />
      <rect x="19" y="19" width="31" height="90" fill="#FACC15" />
      <rect x="78" y="19" width="31" height="90" fill="#FACC15" />
      <rect x="19" y="78" width="90" height="31" fill="#FACC15" />
    </svg>
  );
};





