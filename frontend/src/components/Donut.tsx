interface Slice { label: string; value: number; color: string; }

// Donut SVG sem dependências. Usado na "Visão de Compras do Diretor"
// (distribuição Disponível vs Em Uso) e demais distribuições.
export default function Donut({ slices, size = 188 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 16;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="var(--bg-recess)" strokeWidth="18"
          />
          {slices.map((s) => {
            const len = (s.value / total) * c;
            const seg = (
              <circle
                key={s.label}
                cx={size / 2} cy={size / 2} r={r}
                fill="none" stroke={s.color} strokeWidth="18"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return seg;
          })}
        </g>
        <text
          x="50%" y="48%" textAnchor="middle"
          fill="var(--text-satin)" fontSize="28" fontWeight="600"
        >
          {total}
        </text>
        <text
          x="50%" y="60%" textAnchor="middle"
          fill="var(--text-muted)" fontSize="10"
          letterSpacing="0.12em"
        >
          ATIVOS
        </text>
      </svg>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {slices.map((s) => (
          <li key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 11, height: 11, borderRadius: 3, background: s.color,
            }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{s.label}</span>
            <strong style={{ marginLeft: 'auto', color: 'var(--text-primary)' }}>
              {s.value}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
