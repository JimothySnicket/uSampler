import React, { useState } from 'react';

interface ProcessButtonProps {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
}

export const ProcessButton: React.FC<ProcessButtonProps> = ({ label, icon, onClick, disabled }) => {
    const [isActive, setIsActive] = useState(false);

    const handleClick = () => {
        if (disabled) return;
        setIsActive(true);
        onClick();
        setTimeout(() => setIsActive(false), 600);
    };

    return (
        <button
            onClick={handleClick}
            disabled={disabled}
            className="flex items-center gap-1 px-2 py-1 rounded text-[8px] font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-default"
            style={{
                background: isActive ? 'var(--accent-indigo-strong)' : 'var(--elevated)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${isActive ? 'var(--accent-indigo)' : 'var(--border)'}`,
                transform: isActive ? 'scale(0.96)' : 'scale(1)',
            }}
        >
            <span className="w-3 h-3 flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full">{icon}</span>
            {label}
        </button>
    );
};
