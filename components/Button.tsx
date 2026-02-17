import React from 'react';
import { clsx } from 'clsx';

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';
type ButtonVariant = 'default' | 'primary' | 'success' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

const sizeClasses: Record<ButtonSize, { button: string; icon: string }> = {
  xs: { button: 'px-1.5 py-0.5 text-[7px] gap-1', icon: 'w-2.5 h-2.5' },
  sm: { button: 'px-2 py-1 text-[9px] gap-1', icon: 'w-3 h-3' },
  md: { button: 'px-3 py-1.5 text-xs gap-1.5', icon: 'w-3.5 h-3.5' },
  lg: { button: 'px-4 py-2 text-sm gap-2', icon: 'w-4 h-4' },
};

const variantStyles: Record<ButtonVariant, {
  className: string;
  style: React.CSSProperties;
}> = {
  default: {
    className: 'font-medium hover:opacity-80',
    style: {
      background: 'var(--elevated)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    },
  },
  primary: {
    className: 'font-semibold hover:opacity-90',
    style: {
      background: 'var(--accent-indigo-strong)',
      color: 'var(--text-primary)',
      border: '1px solid var(--accent-indigo)',
    },
  },
  success: {
    className: 'font-semibold hover:opacity-90',
    style: {
      background: 'var(--success-muted)',
      color: 'var(--success)',
      border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
    },
  },
  danger: {
    className: 'font-semibold hover:opacity-90',
    style: {
      background: 'var(--danger-muted)',
      color: 'var(--danger)',
      border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
    },
  },
  ghost: {
    className: 'hover:opacity-80',
    style: {
      background: 'transparent',
      color: 'var(--text-muted)',
      border: '1px solid transparent',
    },
  },
};

export const Button: React.FC<ButtonProps> = ({
  size = 'sm',
  variant = 'default',
  icon,
  iconPosition = 'left',
  children,
  className,
  disabled,
  style: userStyle,
  ...props
}) => {
  const sz = sizeClasses[size];
  const v = variantStyles[variant];

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded cursor-pointer transition-opacity',
        sz.button,
        v.className,
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
      style={{ ...v.style, ...userStyle }}
      disabled={disabled}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <span className={clsx('shrink-0 inline-flex [&>svg]:w-full [&>svg]:h-full', sz.icon)}>{icon}</span>
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <span className={clsx('shrink-0 inline-flex [&>svg]:w-full [&>svg]:h-full', sz.icon)}>{icon}</span>
      )}
    </button>
  );
};
