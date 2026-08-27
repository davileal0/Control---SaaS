interface Props {
  label: string;
  value: number | string;
  accent?: boolean; // marca o destaque pedido pela Diretoria (Em Uso)
}

// Cartão de métrica de alto nível. O acento (filete LED) é reservado
// ao indicador-foco da Diretoria, conforme a especificação.
export default function StatCard({ label, value, accent }: Props) {
  return (
    <div className="card stat-card">
      <span className="eyebrow">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {accent && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--led)', boxShadow: '0 0 9px var(--led-glow)',
          }} />
        )}
        <strong style={{
          fontSize: 38, fontWeight: 600, color: 'var(--text-satin)',
          letterSpacing: '0.01em',
        }}>
          {value}
        </strong>
      </div>
    </div>
  );
}
