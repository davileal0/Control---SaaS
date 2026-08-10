import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import HelpButton from '../components/HelpButton';
import { PERIPHERAL_TYPES } from '../lib/peripheralTypes';
import { isValidImei } from '../lib/imei';
import { Unit } from '../types/domain';
import './peripherals-modal.css'; // reusa .modal-backdrop / .modal / .modal__head
import './asset-modal.css';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

// Categorias disponíveis. Periférico é o único modo BULK; o resto é INDIVIDUAL.
type Category = 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne' | 'Periferico';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'Notebook', label: 'Notebook' },
  { value: 'Desktop', label: 'Desktop' },
  { value: 'Celular', label: 'Celular' },
  { value: 'AllInOne', label: 'All-in-One' },
  { value: 'Periferico', label: 'Periférico' },
];

// Parser local pro PREVIEW (espelha serialParser.ts do backend). O
// backend reparse e é a fonte de verdade; isto é só pra mostrar ao
// operador o que será criado antes de confirmar.
const HEADER_HINTS = [
  'sn', 'serial', 'serialnumber', 'serial number',
  'numerodeserie', 'numero de serie', 'número de série', 'n/s', 'ns',
];
function parseSerialsPreview(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const seen = new Set<string>();
  const serials: string[] = [];
  lines.forEach((line, index) => {
    let sn = line;
    for (const sep of ['\t', ';', ',']) {
      if (line.includes(sep)) {
        sn = line.split(sep)[0];
        break;
      }
    }
    sn = sn.trim();
    if (sn.length === 0) return;
    if (index === 0 && HEADER_HINTS.includes(sn.toLowerCase())) return;
    if (seen.has(sn)) return;
    seen.add(sn);
    serials.push(sn);
  });
  return serials;
}

// =====================================================================
// Modal de cadastro de ativo — 2 modos UX (selecionados pela categoria)
// =====================================================================
//
// INDIVIDUAL (Notebook/Desktop/Celular/AllInOne):
//   SN + Modelo + Categoria → cria 1 ativo
//
// BULK (Periférico):
//   Tipo + Quantidade + Categoria → cria N ativos com SN sintético
//
// Periférico é commodity — não tem sentido cadastrar mouse por mouse
// digitando "Mouse Logitech B100" em cada. O sistema gera SNs internos
// (MOUSE-A3F8D2) que o operador nunca digita nem precisa ver.
export default function AssetCreateModal({ onClose, onCreated }: Props) {
  const toast = useToast();
  const [category, setCategory] = useState<Category>('Notebook');

  // Modo de cadastro de EQUIPAMENTO: individual (1 SN) ou massa (lista).
  // Periférico ignora isso (sempre bulk sintético).
  const [equipMode, setEquipMode] = useState<'individual' | 'massa'>(
    'individual',
  );

  // Campos do modo INDIVIDUAL
  const [serialNumber, setSerialNumber] = useState('');
  const [model, setModel] = useState('');
  // IMEI — só pra celular (rastreio secundário além do SN).
  const [imei, setImei] = useState('');

  // Campos do modo MASSA (equipamento via lista de SNs)
  const [bulkModel, setBulkModel] = useState('');
  const [bulkSerialsRaw, setBulkSerialsRaw] = useState('');
  // Preview: SNs parseadas localmente antes de confirmar
  const [preview, setPreview] = useState<string[] | null>(null);
  // Relatório pós-cadastro
  const [bulkReport, setBulkReport] = useState<{
    created: number;
    skippedExisting: number;
    skippedExistingSerials: string[];
    duplicatesInPaste: number;
    model: string;
  } | null>(null);

  // Campos do modo BULK (periférico)
  const [peripheralType, setPeripheralType] = useState('');
  const [quantity, setQuantity] = useState('');

  // Unidade (filial) — aplica a equipamento (não a periférico).
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const isBulk = category === 'Periferico';
  // Modo massa só vale pra equipamento (não periférico)
  const isMassa = !isBulk && equipMode === 'massa';

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Carrega as unidades ativas pro seletor (equipamento).
  useEffect(() => {
    api.listUnits().then(setUnits).catch(() => setUnits([]));
  }, []);

  // Reseta preview/erro ao trocar categoria ou modo
  useEffect(() => {
    setError(null);
    setPreview(null);
  }, [category, equipMode]);

  // Gera o preview local (passo 1 do modo massa)
  function handlePreview() {
    setError(null);
    const md = bulkModel.trim();
    if (!md) {
      setError('Informe o modelo do equipamento.');
      return;
    }
    if (!bulkSerialsRaw.trim()) {
      setError('Cole a lista de SNs.');
      return;
    }
    const serials = parseSerialsPreview(bulkSerialsRaw);
    if (serials.length === 0) {
      setError('Nenhuma SN válida encontrada. Verifique o formato.');
      return;
    }
    setPreview(serials);
  }

  // Confirma e envia ao backend (passo 2 do modo massa)
  async function handleBulkConfirm() {
    if (units.length > 0 && !unitId) {
      setError('Selecione a unidade onde os ativos ficarão.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createEquipmentsBulk({
        category: category as 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne',
        model: bulkModel.trim(),
        serialNumbersRaw: bulkSerialsRaw,
        ...(unitId ? { unitId } : {}),
      });
      setBulkReport({
        created: result.created,
        skippedExisting: result.skippedExisting,
        skippedExistingSerials: result.skippedExistingSerials,
        duplicatesInPaste: result.duplicatesInPaste,
        model: result.model,
      });
      toast.success(
        `${result.created} ${result.created === 1 ? 'equipamento cadastrado' : 'equipamentos cadastrados'}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao cadastrar em massa.';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (isBulk) {
        const type = peripheralType.trim();
        const qty = Number(quantity);
        if (!type) {
          setError('Tipo do periférico obrigatório.');
          setSubmitting(false);
          return;
        }
        if (!Number.isInteger(qty) || qty < 1) {
          setError('Quantidade obrigatória (mínimo 1).');
          setSubmitting(false);
          return;
        }
        if (qty > 500) {
          setError('Quantidade excede o limite (500 por cadastro).');
          setSubmitting(false);
          return;
        }
        const res = await api.createAsset({
          category: 'Periferico',
          peripheralType: type,
          quantity: qty,
        });
        if (res.mode === 'bulk') {
          toast.success(
            `${res.count} ${res.type.toLowerCase()}${res.count === 1 ? '' : 's'} cadastrado${res.count === 1 ? '' : 's'} no inventário`,
          );
        }
        onCreated();
      } else {
        const sn = serialNumber.trim();
        const md = model.trim();
        if (!sn || !md) {
          setError('Preencha número de série e modelo.');
          setSubmitting(false);
          return;
        }
        // Celular exige IMEI válido (15 dígitos + Luhn).
        const im = imei.trim();
        if (category === 'Celular') {
          if (!im) {
            setError('Informe o IMEI do celular.');
            setSubmitting(false);
            return;
          }
          if (!isValidImei(im)) {
            setError('IMEI inválido — precisa ter 15 dígitos e dígito verificador correto.');
            setSubmitting(false);
            return;
          }
        }
        if (units.length > 0 && !unitId) {
          setError('Selecione a unidade onde o ativo ficará.');
          setSubmitting(false);
          return;
        }
        const res = await api.createAsset({
          category,
          serialNumber: sn,
          model: md,
          ...(category === 'Celular' ? { imei: im } : {}),
          ...(unitId ? { unitId } : {}),
        });
        if (res.mode === 'individual') {
          toast.success(`${res.asset.model} cadastrado no inventário`);
        }
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao cadastrar.');
      toast.error('Não foi possível cadastrar. Verifique os dados.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal asset-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Cadastrar novo ativo"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Ingestão</span>
            <h2>Cadastrar ativo</h2>
          </div>
          <button className="btn" onClick={onClose} type="button" disabled={submitting}>
            Fechar
          </button>
        </header>

        {/* Quando o cadastro em massa termina, mostra o RELATÓRIO no
            lugar do form (não dá pra "continuar editando"). */}
        {bulkReport ? (
          <div className="asset-form">
            <div
              className="discard-warning"
              role="status"
              style={{
                background: 'color-mix(in srgb, #2ea357 10%, transparent)',
                borderColor: 'color-mix(in srgb, #2ea357 30%, transparent)',
              }}
            >
              <strong>
                {bulkReport.created}{' '}
                {bulkReport.created === 1
                  ? 'equipamento cadastrado'
                  : 'equipamentos cadastrados'}
              </strong>{' '}
              — {bulkReport.model}
            </div>

            <dl className="discard-confirm-summary">
              <div>
                <dt>Criados</dt>
                <dd>{bulkReport.created}</dd>
              </div>
              {bulkReport.skippedExisting > 0 && (
                <div>
                  <dt>SNs já existentes (puladas)</dt>
                  <dd>{bulkReport.skippedExisting}</dd>
                </div>
              )}
              {bulkReport.duplicatesInPaste > 0 && (
                <div>
                  <dt>Duplicadas na lista (ignoradas)</dt>
                  <dd>{bulkReport.duplicatesInPaste}</dd>
                </div>
              )}
            </dl>

            {bulkReport.skippedExisting > 0 && (
              <details className="receiving-skipped">
                <summary>
                  Ver {bulkReport.skippedExisting} SN(s) pulada(s)
                </summary>
                <ul>
                  {bulkReport.skippedExistingSerials.map((sn) => (
                    <li key={sn}>
                      <code>{sn}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <footer className="form-footer">
              <button type="button" className="btn primary" onClick={onCreated}>
                Concluir
              </button>
            </footer>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="asset-form">
            {/* Categoria primeiro — controla o que aparece embaixo */}
            <label className="form-field">
              <span className="form-label">Categoria</span>
              <select
                className="field"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                disabled={!!preview}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Toggle Individual | Em massa — só pra equipamento */}
            {!isBulk && (
              <div className="mode-toggle-row">
                <div
                  className="mode-toggle"
                  role="tablist"
                  aria-label="Modo de cadastro"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={equipMode === 'individual'}
                    className={`mode-toggle__btn ${equipMode === 'individual' ? 'is-active' : ''}`}
                    onClick={() => setEquipMode('individual')}
                    disabled={!!preview}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={equipMode === 'massa'}
                    className={`mode-toggle__btn ${equipMode === 'massa' ? 'is-active' : ''}`}
                    onClick={() => setEquipMode('massa')}
                    disabled={!!preview}
                  >
                    Em massa (lista)
                  </button>
                </div>

                <HelpButton
                  label="Ajuda sobre cadastro em massa"
                  title="Cadastrar ativos em massa"
                >
                  <p>
                    O modo <strong>Em massa</strong> cadastra vários
                    equipamentos de uma vez a partir de uma lista de números
                    de série (SN) — útil quando chega um lote do mesmo modelo.
                  </p>

                  <h4>Passo a passo</h4>
                  <ol>
                    <li>
                      Escolha a <strong>categoria</strong> (Notebook, Desktop
                      etc.) no topo.
                    </li>
                    <li>
                      Clique em <strong>Em massa (lista)</strong>.
                    </li>
                    <li>
                      Informe o <strong>modelo</strong>. Ele vale para{' '}
                      <strong>todos</strong> os equipamentos da lista — então
                      cadastre um modelo por vez.
                    </li>
                    <li>
                      <strong>Cole a lista de SNs</strong>, uma por linha (veja
                      o formato abaixo).
                    </li>
                    <li>
                      Clique em <strong>Pré-visualizar</strong> para conferir o
                      que será cadastrado.
                    </li>
                    <li>
                      Revise a prévia e clique em <strong>Confirmar</strong>.
                    </li>
                  </ol>

                  <h4>De onde vem a lista?</h4>
                  <p>
                    Normalmente de uma planilha (Excel/Google Sheets) — por
                    exemplo a coluna de SNs da nota fiscal ou do recebimento.
                    Você pode <strong>copiar a coluna inteira e colar direto</strong>.
                  </p>

                  <h4>Formato esperado</h4>
                  <p>Uma SN por linha:</p>
                  <div className="help-example">{`SN
ABC123
DEF456
GHI789`}</div>
                  <p>
                    O cabeçalho (<code>SN</code>) e uma eventual coluna de
                    modelo ao lado são <strong>ignorados automaticamente</strong>.
                    Linhas em branco e espaços extras também são limpos.
                  </p>

                  <h4>Bom saber</h4>
                  <ul>
                    <li>
                      SNs <strong>já cadastradas</strong> no estoque são{' '}
                      <strong>puladas</strong> — não geram duplicata. A prévia e
                      o relatório final mostram quantas foram puladas.
                    </li>
                    <li>
                      SNs <strong>repetidas dentro da própria lista</strong>{' '}
                      contam só uma vez.
                    </li>
                    <li>
                      Todos entram como <strong>Disponível</strong> e geram um
                      registro de ingestão no histórico.
                    </li>
                  </ul>
                </HelpButton>
              </div>
            )}

            {/* Unidade (localização) — só pra equipamento rastreável. */}
            {!isBulk && (
              <label className="form-field">
                <span className="form-label">Unidade (localização)</span>
                {units.length === 0 ? (
                  <span className="form-hint">
                    Nenhuma unidade cadastrada. Crie em Configurações →
                    Unidades para localizar o ativo.
                  </span>
                ) : (
                  <select
                    className="field"
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    required
                  >
                    <option value="">Selecione…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}

            {isBulk ? (
              /* ============ MODO BULK (Periférico) ============ */
              <>
                <label className="form-field">
                  <span className="form-label">Tipo do periférico</span>
                  <input
                    ref={firstFieldRef}
                    className="field"
                    value={peripheralType}
                    onChange={(e) => setPeripheralType(e.target.value)}
                    placeholder="ex.: Mouse, Teclado, Headset"
                    list="peripheral-types"
                    autoComplete="off"
                    required
                  />
                  {/* Sugere os tipos canônicos (mesma lista do kit de
                      atribuição) pra manter o estoque alinhado, sem
                      travar cadastros de tipos novos. */}
                  <datalist id="peripheral-types">
                    {PERIPHERAL_TYPES.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </label>

                <label className="form-field">
                  <span className="form-label">Quantidade</span>
                  <input
                    type="number"
                    className="field"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="ex.: 50"
                    min={1}
                    max={500}
                    step={1}
                    required
                  />
                </label>

                <div className="discard-warning" role="note">
                  <strong>Cadastro em massa.</strong> Cada periférico recebe um
                  identificador interno único gerado automaticamente — você não
                  precisa digitar nenhum número de série. Eles aparecerão
                  agrupados em "Periféricos com estoque baixo" no Dashboard.
                </div>
              </>
            ) : isMassa ? (
              /* ============ MODO MASSA (equipamento via lista) ============ */
              <>
                <label className="form-field">
                  <span className="form-label">Modelo (único pro lote)</span>
                  <input
                    className="field"
                    value={bulkModel}
                    onChange={(e) => setBulkModel(e.target.value)}
                    placeholder="ex.: Dell Latitude 3420"
                    autoComplete="off"
                    disabled={!!preview}
                  />
                  <span className="form-hint">
                    Todos os equipamentos da lista entram com este modelo.
                  </span>
                </label>

                {!preview ? (
                  <label className="form-field">
                    <span className="form-label">
                      Lista de SNs (cole da planilha)
                    </span>
                    <textarea
                      className="field field--mono"
                      value={bulkSerialsRaw}
                      onChange={(e) => setBulkSerialsRaw(e.target.value)}
                      placeholder={
                        'Formato esperado — uma SN por linha:\n\nSN\nABC123\nDEF456\nGHI789\n\n(cabeçalho "SN" e coluna de modelo são ignorados)'
                      }
                      rows={7}
                    />
                    <span className="form-hint">
                      <strong>Formato:</strong> uma SN por linha. Pode colar
                      direto do Excel — o cabeçalho (<code>SN</code>) e uma
                      eventual coluna de modelo são ignorados automaticamente.
                    </span>
                  </label>
                ) : (
                  /* PREVIEW — passo 2 antes de confirmar */
                  <div className="bulk-preview">
                    <div className="bulk-preview__head">
                      <strong>{preview.length}</strong> equipamento(s) serão
                      cadastrados como <strong>{bulkModel.trim()}</strong> (
                      {CATEGORIES.find((c) => c.value === category)?.label})
                    </div>
                    <ul className="bulk-preview__list">
                      {preview.map((sn) => (
                        <li key={sn}>
                          <code>{sn}</code>
                        </li>
                      ))}
                    </ul>
                    <span className="form-hint">
                      Confira a lista. SNs já existentes no estoque serão
                      puladas automaticamente.
                    </span>
                  </div>
                )}
              </>
            ) : (
              /* ============ MODO INDIVIDUAL ============ */
              <>
                <label className="form-field">
                  <span className="form-label">Número de série</span>
                  <input
                    ref={firstFieldRef}
                    className="field"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="ex.: 5CD2419ABC"
                    autoComplete="off"
                    required
                  />
                </label>

                <label className="form-field">
                  <span className="form-label">Modelo</span>
                  <input
                    className="field"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="ex.: Dell Vostro 3520"
                    autoComplete="off"
                    required
                  />
                </label>

                {/* IMEI — só pra celular. Rastreio secundário além do SN. */}
                {category === 'Celular' && (
                  <label className="form-field">
                    <span className="form-label">IMEI</span>
                    <input
                      className="field"
                      value={imei}
                      onChange={(e) => setImei(e.target.value)}
                      placeholder="ex.: 490154203237518 (15 dígitos)"
                      inputMode="numeric"
                      maxLength={15}
                      autoComplete="off"
                      required
                    />
                    <span className="form-hint">
                      15 dígitos. Encontrável discando *#06# no aparelho.
                    </span>
                  </label>
                )}
              </>
            )}

            {error && <p className="form-error">{error}</p>}

            <footer className="form-footer">
              <button
                type="button"
                className="btn"
                onClick={preview ? () => setPreview(null) : onClose}
                disabled={submitting}
              >
                {preview ? 'Voltar' : 'Cancelar'}
              </button>

              {isMassa ? (
                preview ? (
                  <button
                    type="button"
                    className="btn accent"
                    onClick={handleBulkConfirm}
                    disabled={submitting}
                  >
                    {submitting
                      ? 'Cadastrando…'
                      : `Cadastrar ${preview.length}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn accent"
                    onClick={handlePreview}
                    disabled={submitting}
                  >
                    Pré-visualizar
                  </button>
                )
              ) : (
                <button
                  type="submit"
                  className="btn accent"
                  disabled={submitting}
                >
                  {submitting
                    ? 'Salvando…'
                    : isBulk
                      ? 'Cadastrar em massa'
                      : 'Cadastrar'}
                </button>
              )}
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
