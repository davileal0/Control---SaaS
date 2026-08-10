import { useEffect, useState, FormEvent } from 'react';
import { api } from '../lib/api';
import { Unit } from '../types/domain';
import { useToast } from '../contexts/ToastContext';
import Spinner from '../components/Spinner';

// Gestão de Unidades (filiais) em Configurações. Listar, criar e
// ativar/desativar. Unidade nunca é apagada — desativada, pra preservar
// referências históricas dos ativos.
export default function UnitsCard() {
  const toast = useToast();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      // includeInactive=true: gestão precisa ver as desativadas também.
      setUnits(await api.listUnits(true));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar unidades.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await api.createUnit(name);
      setNewName('');
      await reload();
      toast.success(`Unidade "${name}" criada`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao criar unidade.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(unit: Unit) {
    const action = unit.isActive ? 'desativar' : 'reativar';
    if (!window.confirm(`Deseja ${action} a unidade "${unit.name}"?`)) return;
    setBusyId(unit.id);
    try {
      await api.updateUnit(unit.id, { isActive: !unit.isActive });
      await reload();
      toast.success(
        unit.isActive ? `"${unit.name}" desativada` : `"${unit.name}" reativada`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Falha ao ${action}.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head" style={{ marginTop: 36 }}>
        <span className="eyebrow">Localização</span>
        <h1>Unidades</h1>
        <p>
          As filiais onde os equipamentos ficam. Usadas para localizar cada
          ativo e atualizar a posição a cada movimentação.
        </p>
      </div>

      <form className="units-toolbar" onSubmit={handleCreate}>
        <input
          className="field"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="ex.: Unidade de Timbó"
          maxLength={80}
          autoComplete="off"
        />
        <button
          className="btn accent"
          type="submit"
          disabled={creating || !newName.trim()}
        >
          {creating ? 'Adicionando…' : 'Adicionar unidade'}
        </button>
      </form>

      {loading ? (
        <div className="spinner-center">
          <Spinner size={24} />
          <span>Carregando…</span>
        </div>
      ) : units.length === 0 ? (
        <p className="users-empty">
          Nenhuma unidade cadastrada. Adicione a primeira acima.
        </p>
      ) : (
        <section className="card users-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Unidade</th>
                <th>Status</th>
                <th className="users-table__actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'users-row--inactive'}>
                  <td>{u.name}</td>
                  <td>
                    {u.isActive ? (
                      <span className="status-dot status-dot--on">Ativa</span>
                    ) : (
                      <span className="status-dot status-dot--off">Inativa</span>
                    )}
                  </td>
                  <td className="users-table__actions">
                    <button
                      type="button"
                      className="log-action"
                      onClick={() => toggleActive(u)}
                      disabled={busyId === u.id}
                    >
                      {u.isActive ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
