'use client';

import Image from 'next/image';

export interface JpTokenIconProps {
  size?: number;
  className?: string;
  glow?: boolean;
  priority?: boolean;
}

export default function JpTokenIcon({
  size = 24,
  className = '',
  glow = false,
  priority = false,
}: JpTokenIconProps) {
  const src = size <= 64 ? '/assets/jp-token-icon.png' : '/images/jp-token.png';

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 select-none rounded-full ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {glow && (
        <span
          className="absolute inset-0 rounded-full bg-amber-400/35 dark:bg-amber-400/25 blur-md pointer-events-none"
          aria-hidden="true"
        />
      )}
      <Image
        src={src}
        alt="Jeton JP TranoGasy"
        width={size}
        height={size}
        priority={priority}
        className="w-full h-full object-contain rounded-full drop-shadow-[0_2px_6px_rgba(228,172,60,0.28)]"
      />
    </span>
  );
}
