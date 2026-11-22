// WaferClaw mark: a silicon wafer (disc with its orientation flat) raked by three claw cuts.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="WaferClaw">
      <defs>
        <clipPath id="wc-flat"><rect x="0" y="0" width="32" height="27.5" /></clipPath>
      </defs>
      <circle cx="16" cy="16" r="13.5" fill="#FF5A1F" clipPath="url(#wc-flat)" />
      <g fill="#100F0D">
        <path d="M12.6 3.5 Q11 15 5.4 26 Q12.6 16.5 15 4 Z" />
        <path d="M18.6 3.5 Q17 15 11.4 27.5 Q18.6 16.5 21 4 Z" />
        <path d="M24.6 5.5 Q23 16 17.4 27.5 Q24.6 17.5 27 7 Z" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-[27px] font-extrabold uppercase leading-none tracking-[0.04em] text-wc-bone">
      Wafer<span className="text-wc-hot">Claw</span>
    </span>
  );
}
