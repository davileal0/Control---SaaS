// Mini-gráfico de tendência (sparkline) em SVG inline.
//
// Sem dependências externas — desenha um polyline simples normalizado
// pelos extremos do array. Pra Control, alimenta o card "Movimentações
// hoje" mostrando o ritmo dos últimos 7 dias.

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Se true, preenche a área embaixo da curva (gradient sutil) */
  filled?: boolean;
}

export default function Sparkline({
  data,
  width = 80,
  height = 28,
  color = 'currentColor',
  filled = true,
}: SparklineProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  // Mapeia cada ponto pra coordenada SVG
  const points = data.map((value, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    // Inverte Y porque SVG cresce pra baixo
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });

  const pathLine = points.reduce(
    (acc, p, i) => acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`),
    '',
  );

  // Área preenchida: linha + descida até o eixo X + fechamento
  const pathArea =
    pathLine + ` L ${points[points.length - 1].x} ${height} L 0 ${height} Z`;

  const gradientId = `spark-grad-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', color }}
      aria-hidden="true"
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={pathArea} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={pathLine}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
