import { Fragment, useEffect, useState } from 'react';
import { api, AssetListFilters } from '../lib/api';
import Spinner from '../components/Spinner';
import {
  AssetListItem,
  STATUS_LABEL,
  CATEGORY_LABEL,
  Role,
} from '../types/domain';
import { canWrite } from '../lib/rbac';
import AssetCreateModal from './AssetCreateModal';
import AssetDetailModal from './AssetDetailModal';
import './assets.css';

type StatusFilter = 'Todos' | 'Disponivel' | 'EmUso' | 'Danificado';
type CategoryFilter =
  | 'Todas'
  | 'Notebook'
  | 'Desktop'
  | 'Celular'
  | 'AllInOne'
  | 'Periferico';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: 'Disponivel', label: 'Disponível' },
  { value: 'EmUso', label: 'Em uso' },
  { value: 'Danificado', label: 'Danificados' },
];

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'Todas', label: 'Todas categorias' },
  { value: 'Notebook', label: 'Notebook' },
  { value: 'Desktop', label: 'Desktop' },
  { value: 'Celular', label: 'Celular' },
  { value: 'AllInOne', label: 'All-in-One' },
  { value: 'Periferico', label: 'Periférico' },
];

export default function Assets({ role }: { role: Role }) {
  const [status, setStatus] = useState<StatusFilter>('Todos');
  const [category, setCategory] = useState<CategoryFilter>('Todas');
  const [search, setSearch] = useState('');
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [viewingSerial, setViewingSerial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Grupos de periféricos expandidos (chave = model name).
  // Por padrão, todos os grupos começam COLAPSADOS — a tabela mostra
  // só agregados, expandir é opt-in.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(model: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  async function reload() {
    setLoading(true);
    try {
      const filters: AssetListFilters = {};
      if (status !== 'Todos') filters.status = status;
      if (category !== 'Todas') filters.category = category;
      if (search.trim()) filters.search = search.trim();
      setAssets(await api.listAssets(filters));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar ativos.');
    } finally {
      setLoading(false);
    }
  }

  // Debounce de 250ms na busca — evita uma request por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => {
      reload();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, search]);

  function currentLocation(asset: AssetListItem): string {
    if (asset.status === 'Disponivel') return 'Em estoque';
    if (asset.status === 'Danificado') return 'Em assistência';
    // Em Uso — pega o colaborador do último log não-anulado
    const latest = asset.movementLogs?.[0];
    if (!latest || !latest.endUserName) return '—';
    return latest.department
      ? `${latest.endUserName} · ${latest.department}`
      : latest.endUserName;
  }

  // ---------------------------------------------------------------------
  // Agrupamento de periféricos
  // ---------------------------------------------------------------------
  //
  // Periférico é commodity — 50 teclados idênticos não precisam aparecer
  // em 50 linhas separadas. Agrupa por `model` (= tipo: Mouse, Teclado).
  // Não-periféricos (Notebook/Celular/Desktop/AllInOne) continuam linha
  // por linha, já que cada um é identificado por SN e tem destino próprio.
  //
  // A função abaixo separa as duas listas. A ordem do retorno preserva
  // a ordem do backend (createdAt desc).

  type Group = { kind: 'group'; model: string; items: AssetListItem[] };
  type Individual = { kind: 'individual'; asset: AssetListItem };
  type Row = Group | Individual;

  function buildRows(): Row[] {
    const peripheralGroups = new Map<string, AssetListItem[]>();
    const rows: Row[] = [];

    for (const asset of assets) {
      if (asset.category === 'Periferico') {
        if (!peripheralGroups.has(asset.model)) {
          peripheralGroups.set(asset.model, []);
          // Reserva a posição do grupo na ordem em que apareceu
          rows.push({ kind: 'group', model: asset.model, items: [] });
        }
        peripheralGroups.get(asset.model)!.push(asset);
      } else {
        rows.push({ kind: 'individual', asset });
      }
    }
    // Preenche os items dos grupos depois (mantém referência viva)
    for (const row of rows) {
      if (row.kind === 'group') {
        row.items = peripheralGroups.get(row.model) ?? [];
      }
    }
    return rows;
  }

  function groupSummary(items: AssetListItem[]): {
    total: number;
    disponivel: number;
    emUso: number;
    danificado: number;
  } {
    return {
      total: items.length,
      disponivel: items.filter((i) => i.status === 'Disponivel').length,
      emUso: items.filter((i) => i.status === 'EmUso').length,
      danificado: items.filter((i) => i.status === 'Danificado').length,
    };
  }

  function groupLocation(items: AssetListItem[]): string {
    const s = groupSummary(items);
    const parts: string[] = [];
    if (s.disponivel) parts.push(`${s.disponivel} em estoque`);
    if (s.emUso) parts.push(`${s.emUso} em uso`);
    if (s.danificado) parts.push(`${s.danificado} em assistência`);
    return parts.join(' · ') || '—';
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Inventário</span>
        <h1>Ativos</h1>
        <p>
          Cadastre e gerencie o parque de equipamentos rastreados pela N1. Clique
          em qualquer ativo para ver o histórico completo dele.
        </p>
      </div>

      <div className="assets-toolbar">
        <div className="assets-filters">
          <div className="filter-group" role="tablist" aria-label="Filtrar por status">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                role="tab"
                aria-selected={status === opt.value}
                className={`filter-pill ${status === opt.value ? 'filter-pill--on' : ''}`}
                onClick={() => setStatus(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            className="filter-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
            aria-label="Filtrar por categoria"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="assets-actions">
          <input
            className="field assets-search"
            placeholder="Buscar por SN, modelo ou colaborador…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar ativos"
          />
          {canWrite(role) && (
            <button className="btn accent" onClick={() => setCreating(true)}>
              Cadastrar ativo
            </button>
          )}
        </div>
      </div>

      {error && <p className="assets-empty">{error}</p>}

      <div className="card assets-list">
        {loading ? (
          <div className="spinner-center">
            <Spinner size={28} />
            <span>Carregando ativos…</span>
          </div>
        ) : assets.length === 0 ? (
          <p className="assets-empty">
            Nenhum ativo encontrado com esses filtros.
            {canWrite(role) && ' Use o botão "Cadastrar ativo" pra começar.'}
          </p>
        ) : (
          <table className="assets-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Modelo</th>
                <th>Número de série</th>
                <th>Categoria</th>
                <th>Onde está</th>
              </tr>
            </thead>
            <tbody>
              {buildRows().map((row) => {
                if (row.kind === 'individual') {
                  const asset = row.asset;
                  return (
                    <tr
                      key={asset.serialNumber}
                      className="assets-row"
                      onClick={() => setViewingSerial(asset.serialNumber)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setViewingSerial(asset.serialNumber);
                        }
                      }}
                    >
                      <td>
                        <span className={`pill pill--${asset.status}`}>
                          {STATUS_LABEL[asset.status]}
                        </span>
                      </td>
                      <td className="cell-model">{asset.model}</td>
                      <td className="cell-serial">
                        <code>{asset.serialNumber}</code>
                      </td>
                      <td>{CATEGORY_LABEL[asset.category] ?? asset.category}</td>
                      <td className="cell-loc">{currentLocation(asset)}</td>
                    </tr>
                  );
                }
                // Grupo de periféricos
                const isExpanded = expandedGroups.has(row.model);
                const summary = groupSummary(row.items);
                return (
                  <Fragment key={`group-${row.model}`}>
                    <tr
                      className="assets-row assets-row--group"
                      onClick={() => toggleGroup(row.model)}
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleGroup(row.model);
                        }
                      }}
                    >
                      <td>
                        <span className="pill pill--group">
                          {summary.total} {summary.total === 1 ? 'unid' : 'unid'}
                        </span>
                      </td>
                      <td className="cell-model">
                        <span className={`group-chevron${isExpanded ? ' group-chevron--open' : ''}`} aria-hidden="true">
                          ▶
                        </span>
                        {row.model}
                      </td>
                      <td className="cell-serial">
                        {summary.total} {summary.total === 1 ? 'unidade' : 'unidades'}
                      </td>
                      <td>Periférico</td>
                      <td className="cell-loc">{groupLocation(row.items)}</td>
                    </tr>
                    {isExpanded &&
                      row.items.map((asset) => (
                        <tr
                          key={asset.serialNumber}
                          className="assets-row assets-row--group-item"
                          onClick={() => setViewingSerial(asset.serialNumber)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setViewingSerial(asset.serialNumber);
                            }
                          }}
                        >
                          <td>
                            <span className={`pill pill--${asset.status}`}>
                              {STATUS_LABEL[asset.status]}
                            </span>
                          </td>
                          <td className="cell-model">
                            <span className="group-indent" aria-hidden="true">↳</span>
                            {asset.model}
                          </td>
                          <td className="cell-serial">
                            <code>{asset.serialNumber}</code>
                          </td>
                          <td>{CATEGORY_LABEL[asset.category] ?? asset.category}</td>
                          <td className="cell-loc">{currentLocation(asset)}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <AssetCreateModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {viewingSerial && (
        <AssetDetailModal
          serial={viewingSerial}
          role={role}
          onClose={() => setViewingSerial(null)}
          onChange={reload}
        />
      )}
    </>
  );
}
