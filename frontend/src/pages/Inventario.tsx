import { useEffect, useRef, useState } from 'react';
import {
  api,
  InventoryValidation,
  InventoryImport,
} from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Role, ROLE_LABEL } from '../types/domain';
import Spinner from '../components/Spinner';
import './inventario.css';

// =====================================================================
// Página: Importação de Inventário
// =====================================================================
// Duas áreas, conforme o papel:
//   - Envio (operador + líder): sobe a planilha, valida, cola o link do
//     Autentique e envia pra aprovação.
//   - Aprovação (líder + coordenador): vê os pedidos pendentes e
//     aprova/recusa.
// O inventário físico é oficializado por PDF assinado no Autentique
// (fora do Control); aqui registramos a importação e o vínculo.

interface Props {
  role: Role | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
};

const CATEGORY_LABEL: Record<string, string> = {
  Notebook: 'Notebooks',
  Desktop: 'Desktops',
  Celular: 'Celulares',
  Periferico: 'Periféricos',
};

function canApprove(role: Role | null): boolean {
  return role === 'LIDER_N1' || role === 'DIRETOR_TI';
}
function canSubmit(role: Role | null): boolean {
  return role === 'OPERADOR_N1' || role === 'LIDER_N1';
}

/** Formatos aceitos na importação (checagem por extensão do nome). */
function isAcceptedFile(f: File): boolean {
  const name = f.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.csv');
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Lê um File e devolve o conteúdo em base64 (sem o prefixo data URL). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result); // mandamos o data URL inteiro; o backend trata os dois
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export default function Inventario({ role }: Props) {
  const toast = useToast();

  // Lista de pedidos
  const [imports, setImports] = useState<InventoryImport[]>([]);
  const [loading, setLoading] = useState(true);

  // Envio
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [validation, setValidation] = useState<InventoryValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [autentiqueLink, setAutentiqueLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Drag & drop. Um contador de profundidade evita o "flicker" do estado
  // quando o cursor passa por cima de elementos filhos da dropzone
  // (cada filho dispara dragenter/dragleave próprios).
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (!canSubmit(role)) return;
    dragDepth.current += 1;
    setDragActive(true);
  }
  function handleDragOver(e: React.DragEvent) {
    // Necessário para que o "drop" seja permitido pelo navegador.
    e.preventDefault();
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (!canSubmit(role)) return;
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (!isAcceptedFile(dropped)) {
      toast.error('Formato não suportado. Envie um arquivo .xlsx ou .csv.');
      return;
    }
    handleFile(dropped);
  }

  // Aprovação/recusa
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function load() {
    try {
      setLoading(true);
      setImports(await api.listInventoryImports());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao carregar importações.');
    } finally {
      setLoading(false);
    }
  }

  // Carrega uma vez, na montagem. NÃO depender de `toast` aqui: o valor
  // do contexto muda de referência a cada toast, e usá-lo como dependência
  // recriava o efeito em loop (disparava o rate limit → 429).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(f: File | null) {
    setFile(f);
    setValidation(null);
    setFileBase64(null);
    if (!f) return;

    setValidating(true);
    try {
      const b64 = await fileToBase64(f);
      setFileBase64(b64);
      const result = await api.validateInventory(b64);
      setValidation(result);
      if (result.valid) {
        toast.success(`Planilha válida: ${result.summary.totalAssets} ativo(s) prontos para envio.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao validar a planilha.');
    } finally {
      setValidating(false);
    }
  }

  async function handleSubmit() {
    if (!fileBase64 || !validation?.valid) return;
    if (!autentiqueLink.trim()) {
      toast.error('Cole o link do documento assinado no Autentique.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createInventoryImport(fileBase64, autentiqueLink.trim());
      toast.success('Pedido de importação enviado para aprovação.');
      // Limpa o formulário
      setFile(null);
      setFileBase64(null);
      setValidation(null);
      setAutentiqueLink('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: number) {
    setResolvingId(id);
    try {
      const result = await api.approveInventoryImport(id);
      const skipped = result.skipped?.length ?? 0;
      if (skipped > 0) {
        toast.success(
          `Aprovado: ${result.createdCount} ativo(s) criado(s). ${skipped} item(ns) pulado(s) (já existiam).`,
        );
      } else {
        toast.success(`Aprovado: ${result.createdCount} ativo(s) criado(s).`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao aprovar.');
    } finally {
      setResolvingId(null);
    }
  }

  async function handleReject(id: number) {
    if (!rejectReason.trim()) {
      toast.error('Informe o motivo da recusa.');
      return;
    }
    setResolvingId(id);
    try {
      await api.rejectInventoryImport(id, rejectReason.trim());
      toast.success('Pedido recusado.');
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao recusar.');
    } finally {
      setResolvingId(null);
    }
  }

  const pendentes = imports.filter((i) => i.status === 'PENDENTE');
  const resolvidos = imports.filter((i) => i.status !== 'PENDENTE');

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Estoque</span>
        <h1>Importação de inventário</h1>
        <p>
          Traga os equipamentos do inventário oficial de TI para o Control.
          Suba a planilha validada e o link do documento assinado no
          Autentique; um gestor aprova antes da entrada no estoque.
        </p>
      </div>

      {/* ===== ENVIO (operador + líder) ===== */}
      {canSubmit(role) && (
        <section className="card inv-upload">
          <header className="inv-upload__head">
            <span className="eyebrow">Novo envio</span>
            <h2>Enviar planilha do inventário</h2>
          </header>

          <div
            className={`inv-dropzone${dragActive ? ' inv-dropzone--active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="inv-upload__file">
              <label className="btn" htmlFor="inv-file">
                {file ? 'Trocar planilha' : 'Escolher planilha (.xlsx ou .csv)'}
              </label>
              <input
                id="inv-file"
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {file && <span className="inv-upload__filename">{file.name}</span>}
              {validating && <Spinner />}
            </div>
            <p className="inv-dropzone__hint">
              {dragActive
                ? 'Solte o arquivo para carregar'
                : 'ou arraste e solte o arquivo aqui (.xlsx ou .csv)'}
            </p>
          </div>

          {/* Feedback de validação */}
          {validation && !validation.valid && (
            <div className="inv-errors">
              <p className="inv-errors__title">
                A planilha tem {validation.errors.length} problema(s). Corrija e
                envie de novo:
              </p>
              <ul className="inv-errors__list">
                {validation.errors.map((e, i) => (
                  <li key={i}>
                    <span className="inv-errors__row">
                      {e.row > 0 ? `Linha ${e.row}` : 'Arquivo'}
                    </span>
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validation?.valid && (
            <div className="inv-preview">
              <p className="inv-preview__title">
                Planilha válida — {validation.summary.totalAssets} ativo(s):
              </p>
              <ul className="inv-preview__cats">
                {Object.entries(validation.summary.byCategory).map(([cat, n]) => (
                  <li key={cat}>
                    <strong>{n}</strong> {CATEGORY_LABEL[cat] ?? cat}
                  </li>
                ))}
              </ul>

              <label className="inv-field">
                <span>Link do documento assinado (Autentique)</span>
                <input
                  type="url"
                  placeholder="https://painel.autentique.com.br/..."
                  value={autentiqueLink}
                  onChange={(e) => setAutentiqueLink(e.target.value)}
                />
              </label>

              <button
                className="btn accent"
                onClick={handleSubmit}
                disabled={submitting || !autentiqueLink.trim()}
              >
                {submitting ? 'Enviando…' : 'Enviar para aprovação'}
              </button>
            </div>
          )}
        </section>
      )}

      {/* ===== PENDENTES ===== */}
      <section className="inv-section">
        <h2 className="inv-section__title">
          Pendentes de aprovação
          {pendentes.length > 0 && (
            <span className="inv-badge">{pendentes.length}</span>
          )}
        </h2>

        {loading ? (
          <div className="card inv-empty">Carregando…</div>
        ) : pendentes.length === 0 ? (
          <div className="card inv-empty">Nenhum pedido pendente.</div>
        ) : (
          pendentes.map((imp) => (
            <article key={imp.id} className="card inv-card">
              <div className="inv-card__main">
                <div className="inv-card__info">
                  <span className="inv-status inv-status--pendente">
                    {STATUS_LABEL[imp.status]}
                  </span>
                  <span className="inv-card__count">
                    {imp.totalAssets} ativo(s)
                  </span>
                  <span className="inv-card__meta">
                    Enviado por {imp.submittedByName} ({ROLE_LABEL[imp.submittedByRole]})
                    {' · '}
                    {fmtDateTime(imp.submittedAt)}
                  </span>
                  <a
                    className="inv-card__link"
                    href={imp.autentiqueLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver documento assinado (Autentique) ↗
                  </a>
                </div>

                {canApprove(role) && (
                  <div className="inv-card__actions">
                    <button
                      className="btn accent"
                      onClick={() => handleApprove(imp.id)}
                      disabled={resolvingId === imp.id}
                    >
                      {resolvingId === imp.id ? 'Aprovando…' : 'Aprovar'}
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        setRejectingId(rejectingId === imp.id ? null : imp.id);
                        setRejectReason('');
                      }}
                      disabled={resolvingId === imp.id}
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </div>

              {/* Resumo por categoria */}
              <ul className="inv-card__cats">
                {Object.entries(
                  imp.validatedAssets.reduce<Record<string, number>>((acc, a) => {
                    acc[a.category] = (acc[a.category] ?? 0) + a.quantity;
                    return acc;
                  }, {}),
                ).map(([cat, n]) => (
                  <li key={cat}>
                    <strong>{n}</strong> {CATEGORY_LABEL[cat] ?? cat}
                  </li>
                ))}
              </ul>

              {/* Form de recusa (inline) */}
              {rejectingId === imp.id && canApprove(role) && (
                <div className="inv-reject">
                  <label className="inv-field">
                    <span>Motivo da recusa (o operador verá)</span>
                    <textarea
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Ex: planilha com equipamentos que não pertencem à TI."
                    />
                  </label>
                  <button
                    className="btn danger"
                    onClick={() => handleReject(imp.id)}
                    disabled={resolvingId === imp.id || !rejectReason.trim()}
                  >
                    Confirmar recusa
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      {/* ===== HISTÓRICO (resolvidos) ===== */}
      {resolvidos.length > 0 && (
        <section className="inv-section">
          <h2 className="inv-section__title">Histórico</h2>
          {resolvidos.map((imp) => (
            <article key={imp.id} className="card inv-card inv-card--resolved">
              <div className="inv-card__main">
                <div className="inv-card__info">
                  <span
                    className={`inv-status inv-status--${imp.status.toLowerCase()}`}
                  >
                    {STATUS_LABEL[imp.status]}
                  </span>
                  <span className="inv-card__count">
                    {imp.status === 'APROVADO' && imp.createdCount !== null
                      ? `${imp.createdCount} ativo(s) criado(s)`
                      : `${imp.totalAssets} ativo(s)`}
                  </span>
                  <span className="inv-card__meta">
                    {imp.resolvedByName
                      ? `${imp.status === 'APROVADO' ? 'Aprovado' : 'Recusado'} por ${imp.resolvedByName} · ${fmtDateTime(imp.resolvedAt)}`
                      : ''}
                  </span>
                  {imp.status === 'RECUSADO' && imp.rejectionReason && (
                    <span className="inv-card__reason">
                      Motivo: {imp.rejectionReason}
                    </span>
                  )}
                  {imp.status === 'APROVADO' &&
                    imp.skippedItems &&
                    imp.skippedItems.length > 0 && (
                      <span className="inv-card__skipped">
                        {imp.skippedItems.length} item(ns) pulado(s) (já existiam
                        no Control)
                      </span>
                    )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
