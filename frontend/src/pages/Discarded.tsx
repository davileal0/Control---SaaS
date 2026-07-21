import { useEffect, useState } from 'react';
import { api, downloadDiscardSheet } from '../lib/api';
import { DiscardRecord, STATUS_LABEL } from '../types/domain';
import './discarded.css';

// "Planilha de equipamentos descartados" — componente dedicado, com
// snapshot de SN + modelo de cada descarte e exportação para .xlsx.
export default function Discarded() {
  const [rows, setRows] = useState<DiscardRecord[]>([]);
  const [onlyDamaged, setOnlyDamaged] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .discarded(onlyDamaged)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError('Não foi possível carregar os descartados.'));
    return () => {
      alive = false;
    };
  }, [onlyDamaged]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadDiscardSheet(onlyDamaged);
    } catch {
      setError('Falha ao gerar a planilha.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Saída de inventário</span>
        <h1>Equipamentos descartados</h1>
        <p>Registro permanente dos ativos retirados do inventário.</p>
      </div>

      <div className="discard-toolbar">
        <label className="discard-filter">
          <input
            type="checkbox"
            checked={onlyDamaged}
            onChange={(e) => setOnlyDamaged(e.target.checked)}
          />
          Apenas danificados
        </label>
        <button className="btn accent" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Gerando…' : 'Exportar planilha'}
        </button>
      </div>

      {error && <p style={{ color: 'var(--text-muted)' }}>{error}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="discard-table">
          <thead>
            <tr>
              <th>Número de série</th>
              <th>Modelo</th>
              <th>Categoria</th>
              <th>Último status</th>
              <th>Descartado por</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="discard-empty">
                  Nenhum equipamento descartado ainda.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.serialNumber}</code></td>
                  <td>{r.model}</td>
                  <td>{r.category}</td>
                  <td>{STATUS_LABEL[r.lastStatus]}</td>
                  <td>{r.discardedByName}</td>
                  <td>{new Date(r.discardedAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
