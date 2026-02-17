import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * uSampler Logo Component
 * Displays the custom uSampler logo (U-shaped design)
 */
export const Logo: React.FC<LogoProps> = ({ className = '', size = 24, color }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="128" height="128" fill={color ? 'transparent' : 'var(--logo-bg)'} />
      <rect x="19" y="19" width="31" height="90" fill={color || 'var(--logo-accent)'} />
      <rect x="78" y="19" width="31" height="90" fill={color || 'var(--logo-accent)'} />
      <rect x="19" y="78" width="90" height="31" fill={color || 'var(--logo-accent)'} />
    </svg>
  );
};







