interface SpinnerProps {
  /** Tamanho em pixels — default 24. Recomendado 20-32. */
  size?: number;
  /** Cor (CSS color). Default usa --text-muted. */
  color?: string;
  /** Label acessível pra leitores de tela. Default 'Carregando'. */
  label?: string;
  /** Espessura do traço — default 2. */
  strokeWidth?: number;
}

/**
 * Spinner sutil pra estados de carregamento de áreas específicas
 * (cards, listas, modais). Visual: arco de 3/4 de círculo girando
 * em loop suave.
 *
 * Princípios:
 *  - Cor herda de currentColor (default: --text-muted) — sem dominar
 *    a área visual
 *  - 1.2s por volta — não-frenético, ritmo sereno
 *  - SVG inline, zero deps
 *  - Animação respeita prefers-reduced-motion (param-se a girar
 *    visualmente, mas mantém o ícone como indicação estática)
 *
 * Uso típico:
 *   <Spinner /> Carregando ativos…
 *   <Spinner size={32} label="Buscando histórico" />
 */
export default function Spinner({
  size = 24,
  color,
  label = 'Carregando',
  strokeWidth = 2,
}: SpinnerProps) {
  return (
    <svg
      className="spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
      style={color ? { color } : undefined}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        // 3/4 de círculo visível, 1/4 vazio — visual "loop com gap"
        strokeDasharray="42 100"
        fill="none"
      />
    </svg>
  );
}
