// Ícone da marca Control — Direção B (radar/mira).
// Anel completo em titânio escovado + retículo interno (cruz com respiro
// no centro) + ponto LED vermelho fosco como assinatura. O ponto é o
// único elemento constante em todos os tamanhos; o retículo e os
// gradientes aparecem em tamanhos médios e grandes. Flutua sobre o
// fundo escuro da sidebar, sem caixa de fundo.

export default function BrandIcon({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Control"
      fill="none"
    >
      <defs>
        <linearGradient id="control-ti" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="brand-grad-1" />
          <stop offset="0.5" className="brand-grad-2" />
          <stop offset="0.78" className="brand-grad-3" />
          <stop offset="1" className="brand-grad-4" />
        </linearGradient>
        {/* Overlay sutil de metal escovado */}
        <linearGradient id="control-brush" x1="0" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {/* Anel em titânio + overlay escovado */}
      <circle cx="24" cy="24" r="20" stroke="url(#control-ti)" strokeWidth="3" />
      <circle cx="24" cy="24" r="20" stroke="url(#control-brush)" strokeWidth="3" />

      {/* Retículo de mira (cruz interna com respiro central) */}
      <line x1="8" y1="24" x2="20" y2="24" stroke="url(#control-ti)" strokeWidth="1" strokeLinecap="round" />
      <line x1="28" y1="24" x2="40" y2="24" stroke="url(#control-ti)" strokeWidth="1" strokeLinecap="round" />
      <line x1="24" y1="8" x2="24" y2="20" stroke="url(#control-ti)" strokeWidth="1" strokeLinecap="round" />
      <line x1="24" y1="28" x2="24" y2="40" stroke="url(#control-ti)" strokeWidth="1" strokeLinecap="round" />

      {/* Grupo do LED com animação de pulse — assinatura constante da marca.
          A classe led-pulse é definida em logo.css com keyframes que respeitam
          prefers-reduced-motion. */}
      <g className="led-pulse">
        {/* Halo do LED em duas camadas (fosco, atmosférico) */}
        <circle cx="24" cy="24" r="4" fill="var(--led)" fillOpacity="0.12" />
        <circle cx="24" cy="24" r="2.5" fill="var(--led)" fillOpacity="0.28" />
        {/* Ponto LED — assinatura constante da marca */}
        <circle cx="24" cy="24" r="1.5" fill="var(--led)" />
      </g>
    </svg>
  );
}
