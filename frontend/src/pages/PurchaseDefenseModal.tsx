import { useEffect, useState, FormEvent } from 'react';
import {
  downloadPurchaseDefense,
  DefenseCategory,
  DefenseCategoryInput,
  DefenseAccessoryInput,
} from '../lib/api';
import { Role } from '../types/domain';
import HelpButton from '../components/HelpButton';
import './peripherals-modal.css';
import './asset-modal.css';

interface Props {
  role: Role;
  onClose: () => void;
}

const CATEGORIES: { value: DefenseCategory; label: string }[] = [
  { value: 'Notebook', label: 'Notebooks' },
  { value: 'Desktop', label: 'Desktops' },
  { value: 'Celular', label: 'Celulares' },
  { value: 'AllInOne', label: 'All in One' },
];

// Estado editável de uma categoria (strings nos números pra controlar
// campos vazios; convertidos na submissão).
interface CatState {
  selected: boolean;
  suggestedQuantity: string;
  queueNewHires: string;
  queueReplacement: string;
  safetyStockQuantity: string;
  safetyStockRationale: string;
  lastBatchQuantity: string;
  discountPerUnit: string;
  discountLotSize: string;
  ticketsRaw: string;
}

function emptyCat(): CatState {
  return {
    selected: false,
    suggestedQuantity: '',
    queueNewHires: '',
    queueReplacement: '',
    safetyStockQuantity: '',
    safetyStockRationale: '',
    lastBatchQuantity: '',
    discountPerUnit: '',
    discountLotSize: '',
    ticketsRaw: '',
  };
}

interface AccessoryState {
  name: string;
  quantity: string;
  note: string;
}

type Preset = '6m' | '12m' | 'ytd' | 'custom';

function rangeFromPreset(preset: Preset): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today);
  switch (preset) {
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '12m':
      start.setMonth(start.getMonth() - 12);
      break;
    case 'ytd':
      start.setMonth(0, 1);
      break;
    case 'custom':
      start.setMonth(start.getMonth() - 6);
      break;
  }
  return { start: start.toISOString().slice(0, 10), end };
}

export default function PurchaseDefenseModal({ role, onClose }: Props) {
  const [preset, setPreset] = useState<Preset>('6m');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Estado por categoria (mapa fixo nas 4 categorias)
  const [cats, setCats] = useState<Record<DefenseCategory, CatState>>({
    Notebook: emptyCat(),
    Desktop: emptyCat(),
    Celular: emptyCat(),
    AllInOne: emptyCat(),
  });

  const [accessories, setAccessories] = useState<AccessoryState[]>([]);
  // Seção agregada Descarte e Doação (doação + fora do padrão manuais)
  const [includeDisposal, setIncludeDisposal] = useState(false);
  const [donationQuantity, setDonationQuantity] = useState('');
  const [outOfStandardQuantity, setOutOfStandardQuantity] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOperator = role === 'OPERADOR_N1';

  useEffect(() => {
    const r = rangeFromPreset(preset);
    setPeriodStart(r.start);
    setPeriodEnd(r.end);
  }, [preset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  function updateCat(cat: DefenseCategory, patch: Partial<CatState>) {
    setCats((prev) => ({ ...prev, [cat]: { ...prev[cat], ...patch } }));
  }

  function addAccessory() {
    setAccessories((prev) => [...prev, { name: '', quantity: '', note: '' }]);
  }
  function updateAccessory(idx: number, patch: Partial<AccessoryState>) {
    setAccessories((prev) =>
      prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
  }
  function removeAccessory(idx: number) {
    setAccessories((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!periodStart || !periodEnd) {
      setError('Defina o período inicial e final.');
      return;
    }
    if (periodStart > periodEnd) {
      setError('A data inicial deve ser anterior à data final.');
      return;
    }

    // Monta as categorias selecionadas, validando os campos
    const selectedCats = (Object.keys(cats) as DefenseCategory[]).filter(
      (c) => cats[c].selected,
    );
    if (selectedCats.length === 0) {
      setError('Selecione ao menos uma categoria.');
      return;
    }

    const categoryInputs: DefenseCategoryInput[] = [];
    for (const c of selectedCats) {
      const s = cats[c];
      const sugg = Number(s.suggestedQuantity);
      if (!s.suggestedQuantity.trim() || !Number.isInteger(sugg) || sugg < 1) {
        setError(
          `Informe a quantidade sugerida para ${CATEGORIES.find((x) => x.value === c)?.label}.`,
        );
        return;
      }
      categoryInputs.push({
        category: c,
        suggestedQuantity: sugg,
        queueNewHires: Number(s.queueNewHires) || 0,
        queueReplacement: Number(s.queueReplacement) || 0,
        safetyStockQuantity: Number(s.safetyStockQuantity) || 0,
        safetyStockRationale: s.safetyStockRationale.trim() || undefined,
        lastBatchQuantity: Number(s.lastBatchQuantity) || 0,
        discountPerUnit: s.discountPerUnit.trim()
          ? Number(s.discountPerUnit)
          : undefined,
        discountLotSize: s.discountLotSize.trim()
          ? Number(s.discountLotSize)
          : undefined,
        // Chamados do Acelerato — só All in One por ora. Limpa a lista
        // colada: uma por linha, remove vazios e duplicatas, mantém ordem.
        ticketNumbers:
          c === 'AllInOne' && s.ticketsRaw.trim()
            ? Array.from(
                new Set(
                  s.ticketsRaw
                    .split(/[\n,;\t]+/)
                    .map((t) => t.trim())
                    .filter((t) => t.length > 0),
                ),
              )
            : undefined,
      });
    }

    // Acessórios (só os com nome e quantidade válidos)
    const accessoryInputs: DefenseAccessoryInput[] = [];
    for (const a of accessories) {
      if (!a.name.trim()) continue;
      const qty = Number(a.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        setError(`Quantidade inválida no acessório "${a.name}".`);
        return;
      }
      accessoryInputs.push({
        name: a.name.trim(),
        quantity: qty,
        note: a.note.trim() || undefined,
      });
    }

    // Seção de descarte/doação (opcional)
    const disposal = includeDisposal
      ? {
          donationQuantity: Number(donationQuantity) || 0,
          outOfStandardQuantity: Number(outOfStandardQuantity) || 0,
        }
      : undefined;

    setSubmitting(true);
    try {
      await downloadPurchaseDefense({
        periodStart,
        periodEnd,
        categories: categoryInputs,
        accessories: accessoryInputs.length ? accessoryInputs : undefined,
        disposal,
      });
      setTimeout(() => onClose(), 300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar relatório.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal asset-modal glass defense-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Gerar relatório de defesa de compra"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div className="modal__head-title">
            <div>
              <span className="eyebrow">Geração de relatório</span>
              <h2>Defesa de Compra</h2>
            </div>
            <HelpButton
              label="Ajuda sobre o relatório de defesa de compra"
              title="Como preencher a Defesa de Compra"
            >
              <p>
                Este relatório é o documento que vai à diretoria para{' '}
                <strong>aprovar a compra de equipamentos</strong>. Ele reúne, num
                só PDF, o que o sistema já sabe (descartes, saldo) e o que{' '}
                <strong>você informa</strong> (fila, estoque de segurança,
                economia). Escolha uma ou mais categorias e preencha os campos
                de cada uma.
              </p>

              <h4>Período</h4>
              <p>
                Define a janela usada para puxar os <strong>descartes reais</strong>{' '}
                do sistema (que entram na seção de descarte/doação). Use os
                atalhos (6 meses, 12 meses, ano) ou um intervalo personalizado.
              </p>

              <h4>Por categoria</h4>
              <p>
                Marque as categorias que entram nesta compra (Notebook, Desktop
                etc.). Para cada uma, preencha:
              </p>
              <ul>
                <li>
                  <strong>Sugestão de compra</strong> — quantos equipamentos
                  você está solicitando no total para a categoria.
                </li>
                <li>
                  <strong>Fila (novos colaboradores / substituição)</strong> —
                  os chamados em aberto no <strong>Acelerato</strong> aguardando
                  equipamento. Separe quantos são para novos colaboradores e
                  quantos para substituição. (É informado manualmente porque a
                  fila vive no Acelerato, não no Control.)
                </li>
                <li>
                  <strong>Estoque de segurança</strong> — a reserva estratégica
                  que você quer manter além da fila (ex.: cobertura para
                  imprevistos ou demanda sazonal). Informe a quantidade e o{' '}
                  <strong>raciocínio</strong> (o "porquê", ex.: "reserva para o
                  período do El Niño").
                </li>
                <li>
                  <strong>Último lote (KACE)</strong> — quantas unidades vieram
                  no lote anterior. É só um número de referência/contexto,
                  consultado no <strong>KACE</strong>.
                </li>
                <li>
                  <strong>Desconto e tamanho do lote</strong> — se houve economia
                  negociada com o fornecedor para esta categoria. A economia
                  total (desconto × lote) é calculada e destacada. Deixe vazio se
                  não há desconto.
                </li>
              </ul>

              <h4>Acessórios (opcional)</h4>
              <p>
                Itens avulsos que acompanham a compra (carregadores, fontes
                etc.). Entrada manual: nome, quantidade e uma observação.
              </p>

              <h4>Seção Descarte e Doação (opcional)</h4>
              <p>
                Marque para incluir a seção do "parque antigo". Aqui é{' '}
                <strong>híbrido</strong>:
              </p>
              <ul>
                <li>
                  Os <strong>descartes e seus motivos</strong> vêm{' '}
                  <strong>automaticamente</strong> do sistema, no período
                  escolhido (agrupados por motivo).
                </li>
                <li>
                  A <strong>doação</strong> e a quantidade <strong>"Fora do
                  padrão"</strong> são informadas por você (o sistema não
                  rastreia doação; "fora do padrão" é o critério de obsolescência,
                  ex.: CPU abaixo da 8ª geração).
                </li>
              </ul>

              <h4>Bom saber</h4>
              <ul>
                <li>
                  Os números <strong>não são validados entre si</strong> — você é
                  responsável por conferir que a fila + segurança batem com a
                  sugestão. Revisar o relatório gerado é parte do processo.
                </li>
                <li>
                  O resultado é um <strong>PDF</strong> com capa, uma seção por
                  categoria, a seção de descarte/doação e um resumo consolidado
                  com a economia total.
                </li>
              </ul>
            </HelpButton>
          </div>
          <button
            className="btn"
            onClick={onClose}
            type="button"
            disabled={submitting}
          >
            Fechar
          </button>
        </header>

        {isOperator && (
          <div className="report-note" role="note">
            <strong>Atenção.</strong> Este relatório é normalmente gerado pelo
            Líder N1 ou Coordenador de TI, que o apresenta à diretoria. Você tem
            acesso para fins de teste e manutenção.
          </div>
        )}

        <form onSubmit={handleSubmit} className="asset-form">
          {/* Período */}
          <fieldset className="role-radio-group">
            <legend className="form-label">Período de análise</legend>
            <div className="report-pills">
              {(['6m', '12m', 'ytd', 'custom'] as Preset[]).map((p) => (
                <label
                  key={p}
                  className={`report-pill ${preset === p ? 'report-pill--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={preset === p}
                    onChange={() => setPreset(p)}
                  />
                  <span>
                    {p === '6m'
                      ? 'Últimos 6 meses'
                      : p === '12m'
                        ? 'Últimos 12 meses'
                        : p === 'ytd'
                          ? 'Ano corrente'
                          : 'Personalizado'}
                  </span>
                </label>
              ))}
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
              <label className="form-field">
                <span className="form-label">Início</span>
                <input
                  type="date"
                  className="field"
                  value={periodStart}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriodStart(e.target.value);
                  }}
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Fim</span>
                <input
                  type="date"
                  className="field"
                  value={periodEnd}
                  onChange={(e) => {
                    setPreset('custom');
                    setPeriodEnd(e.target.value);
                  }}
                  disabled={submitting}
                />
              </label>
            </div>
          </fieldset>

          {/* Categorias — checkbox + campos quando selecionada */}
          <fieldset className="role-radio-group">
            <legend className="form-label">
              Categorias a incluir no relatório
            </legend>
            <div className="defense-cats">
              {CATEGORIES.map((c) => {
                const s = cats[c.value];
                return (
                  <div
                    key={c.value}
                    className={`defense-cat ${s.selected ? 'defense-cat--open' : ''}`}
                  >
                    <label className="defense-cat__toggle">
                      <input
                        type="checkbox"
                        checked={s.selected}
                        onChange={(e) =>
                          updateCat(c.value, { selected: e.target.checked })
                        }
                        disabled={submitting}
                      />
                      <span>{c.label}</span>
                    </label>

                    {s.selected && (
                      <div className="defense-cat__fields">
                        <label className="form-field">
                          <span className="form-label">
                            Sugestão de compra (qtd)
                          </span>
                          <input
                            type="number"
                            className="field"
                            value={s.suggestedQuantity}
                            onChange={(e) =>
                              updateCat(c.value, {
                                suggestedQuantity: e.target.value,
                              })
                            }
                            placeholder="ex.: 200"
                            min={1}
                            disabled={submitting}
                          />
                        </label>

                        <div className="form-row">
                          <label className="form-field">
                            <span className="form-label">
                              Fila — novos colaboradores
                            </span>
                            <input
                              type="number"
                              className="field"
                              value={s.queueNewHires}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  queueNewHires: e.target.value,
                                })
                              }
                              placeholder="ex.: 73"
                              min={0}
                              disabled={submitting}
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">
                              Fila — substituição
                            </span>
                            <input
                              type="number"
                              className="field"
                              value={s.queueReplacement}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  queueReplacement: e.target.value,
                                })
                              }
                              placeholder="ex.: 80"
                              min={0}
                              disabled={submitting}
                            />
                          </label>
                        </div>

                        <div className="form-row">
                          <label className="form-field">
                            <span className="form-label">
                              Estoque de segurança (qtd)
                            </span>
                            <input
                              type="number"
                              className="field"
                              value={s.safetyStockQuantity}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  safetyStockQuantity: e.target.value,
                                })
                              }
                              placeholder="ex.: 47"
                              min={0}
                              disabled={submitting}
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">
                              Último lote (KACE)
                            </span>
                            <input
                              type="number"
                              className="field"
                              value={s.lastBatchQuantity}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  lastBatchQuantity: e.target.value,
                                })
                              }
                              placeholder="ex.: 126"
                              min={0}
                              disabled={submitting}
                            />
                          </label>
                        </div>

                        <label className="form-field">
                          <span className="form-label">
                            Raciocínio do estoque de segurança
                          </span>
                          <input
                            type="text"
                            className="field"
                            value={s.safetyStockRationale}
                            onChange={(e) =>
                              updateCat(c.value, {
                                safetyStockRationale: e.target.value,
                              })
                            }
                            placeholder="ex.: reserva para o período do El Niño"
                            disabled={submitting}
                          />
                        </label>

                        <div className="form-row">
                          <label className="form-field">
                            <span className="form-label">
                              Desconto por unidade (R$, opcional)
                            </span>
                            <input
                              type="number"
                              className="field"
                              value={s.discountPerUnit}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  discountPerUnit: e.target.value,
                                })
                              }
                              placeholder="ex.: 1000"
                              min={0}
                              disabled={submitting}
                            />
                          </label>
                          <label className="form-field">
                            <span className="form-label">
                              Tamanho do lote (un.)
                            </span>
                            <input
                              type="number"
                              className="field"
                              value={s.discountLotSize}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  discountLotSize: e.target.value,
                                })
                              }
                              placeholder="ex.: 200"
                              min={0}
                              disabled={submitting}
                            />
                          </label>
                        </div>
                        <span className="form-label__hint">
                          Economia (desconto × lote) é calculada e aparece no
                          relatório. Deixe vazio se esta categoria não tem
                          desconto negociado.
                        </span>

                        {c.value === 'AllInOne' && (
                          <label className="form-field">
                            <span className="form-label">
                              Chamados do Acelerato (cole a lista)
                            </span>
                            <textarea
                              className="field field--mono"
                              value={s.ticketsRaw}
                              onChange={(e) =>
                                updateCat(c.value, {
                                  ticketsRaw: e.target.value,
                                })
                              }
                              placeholder={
                                'Cole os números dos chamados (um por linha).\n\n322655\n330818\n348296'
                              }
                              rows={5}
                            />
                            <span className="form-label__hint">
                              A diretoria pede os chamados que originaram a
                              compra de All in One. Eles aparecem no relatório
                              como comprovação — não alteram a fila informada
                              acima. Duplicados e linhas vazias são ignorados.
                            </span>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* Acessórios */}
          <fieldset className="role-radio-group">
            <legend className="form-label">Acessórios (opcional)</legend>
            {accessories.map((a, idx) => (
              <div key={idx} className="defense-accessory">
                <label className="form-field defense-accessory__name">
                  <span className="form-label">Acessório</span>
                  <input
                    type="text"
                    className="field"
                    value={a.name}
                    onChange={(e) =>
                      updateAccessory(idx, { name: e.target.value })
                    }
                    placeholder="ex.: Carregador USB-C 120 W"
                    disabled={submitting}
                  />
                </label>
                <label className="form-field defense-accessory__qty">
                  <span className="form-label">Qtd.</span>
                  <input
                    type="number"
                    className="field"
                    value={a.quantity}
                    onChange={(e) =>
                      updateAccessory(idx, { quantity: e.target.value })
                    }
                    placeholder="ex.: 4"
                    min={1}
                    disabled={submitting}
                  />
                </label>
                <label className="form-field defense-accessory__note">
                  <span className="form-label">Observação</span>
                  <input
                    type="text"
                    className="field"
                    value={a.note}
                    onChange={(e) =>
                      updateAccessory(idx, { note: e.target.value })
                    }
                    placeholder="ex.: 1 por workstation"
                    disabled={submitting}
                  />
                </label>
                <button
                  type="button"
                  className="btn defense-accessory__remove"
                  onClick={() => removeAccessory(idx)}
                  disabled={submitting}
                  aria-label="Remover acessório"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn defense-add-btn"
              onClick={addAccessory}
              disabled={submitting}
            >
              + Adicionar acessório
            </button>
          </fieldset>

          {/* Seção agregada Descarte e Doação */}
          <fieldset className="role-radio-group">
            <legend className="form-label">
              Seção Descarte e Doação (opcional)
            </legend>
            <label className="defense-cat__toggle" style={{ padding: '4px 0' }}>
              <input
                type="checkbox"
                checked={includeDisposal}
                onChange={(e) => setIncludeDisposal(e.target.checked)}
                disabled={submitting}
              />
              <span>Incluir seção de descarte e doação do parque antigo</span>
            </label>

            {includeDisposal && (
              <>
                <div className="form-row" style={{ marginTop: 8 }}>
                  <label className="form-field">
                    <span className="form-label">Doação no período (qtd)</span>
                    <input
                      type="number"
                      className="field"
                      value={donationQuantity}
                      onChange={(e) => setDonationQuantity(e.target.value)}
                      placeholder="ex.: 37"
                      min={0}
                      disabled={submitting}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">
                      Fora do padrão (qtd)
                    </span>
                    <input
                      type="number"
                      className="field"
                      value={outOfStandardQuantity}
                      onChange={(e) => setOutOfStandardQuantity(e.target.value)}
                      placeholder="ex.: 87"
                      min={0}
                      disabled={submitting}
                    />
                  </label>
                </div>
                <span className="form-label__hint">
                  Os descartes e seus motivos vêm automaticamente do sistema
                  (agrupados por motivo). Você informa apenas a doação e a
                  quantidade "Fora do padrão" (CPU abaixo da 8ª geração), que
                  vira um indicador fixo no relatório.
                </span>
              </>
            )}
          </fieldset>

          {error && <p className="form-error">{error}</p>}

          <footer className="form-footer">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn accent" disabled={submitting}>
              {submitting ? 'Gerando…' : 'Gerar e baixar PDF'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
