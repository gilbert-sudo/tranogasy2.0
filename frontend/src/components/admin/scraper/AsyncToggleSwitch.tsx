'use client';

import React from 'react';

interface AsyncToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: 'sm' | 'md';
  syncing?: boolean;
  disabled?: boolean;
}

/**
 * Smooth optimistic toggle switch that responds visually immediately on click
 * without blocking pointer interactions while background persistence runs.
 */
export default function AsyncToggleSwitch({
  checked,
  onToggle,
  label,
  size = 'md',
  syncing = false,
  disabled = false,
}: AsyncToggleSwitchProps) {
  const trackSize = size === 'sm' ? 'w-10 h-5' : 'w-11 h-6';
  const thumbSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const thumbOffset = size === 'sm' ? 'translate-x-5' : 'translate-x-5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-out cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/60 disabled:opacity-50 disabled:cursor-not-allowed ${trackSize} ${
        checked ? 'bg-brand-green' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${thumbSize} ${
          checked ? thumbOffset : 'translate-x-0'
        }`}
      >
        {syncing && (
          <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
        )}
      </span>
    </button>
  );
}
