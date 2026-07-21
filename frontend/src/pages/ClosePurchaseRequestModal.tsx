import { useEffect, useRef, useState, FormEvent } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { AlertIcon } from '../components/icons';
import HelpButton from '../components/HelpButton';
import {
  PurchaseRequest,
  PR_STATUS_LABEL,
  ReceivingReport,
} from '../types/domain';
import './asset-modal.css';

interface Props {
  request: PurchaseRequest;
  /** MANUAL = recebimento normal; CANCELED = correção de erro */
  reason: 'MANUAL' | 'CANCELED';
  onClose: () => void;
  onClosed: () => void;
}

// ┌─────────────────────────────────────────────────────────────────┐
// │ Modal: Fechar SC (wizard 2 passos)                              │
// ├─────────────────────────────────────────────────────────────────┤
// │ Step 1: form com motivo opcional                                │
// │   Cancelar │ Avançar para confirmação                           │
// │                                                                 │
// │ Step 2: confirmação final                                       │
// │   Voltar │ Confirmar fechamento                                 │
// └─────────────────────────────────────────────────────────────────┘
//
// Por que confirmação dupla:
//   D2 do alinhamento — Heryck (Operador N1) pode fechar SC em
//   qualquer estado (AGUARDANDO_ABERTURA ou ABERTA). Pra evitar
//   fechamento acidental, exige confirmação destrutiva.
//
//   Mesmo padrão do DiscardModal: 2 passos no MESMO modal pra evitar
//   triple-stacking visual.
//
// Sobre o motivo (`reason`):
//   - MANUAL    → status final = FECHADA (caso normal: recebimento)
//   - CANCELED  → status final = CANCELADA (correção de erro/desistência)
export default function ClosePurchaseRequestModal({
  request,
  reason,
  onClose,
  onClosed,
}: Props) {
  const toast = useToast();
  const [notes, setNotes] = useState('');
  // Texto colado da planilha do almoxarifado (SNs). Só usado em
  // fechamento MANUAL de equipamento (CATEGORY com modelo).
  const [serialsRaw, setSerialsRaw] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Relatório do recebimento (preenchido após fechar com SNs)
  const [report, setReport] = useState<ReceivingReport | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  // Lookups visuais conforme o motivo
  const isCancel = reason === 'CANCELED';
  // Recebimento com entrada: fechamento MANUAL de equipamento (CATEGORY)
  // que tem modelo definido. Periférico e cancelamento não recebem SNs.
  const isReceiving =
    !isCancel &&
    request.targetKind === 'CATEGORY' &&
    !!request.equipmentModel;
  const title = isCancel ? 'Cancelar SC' : 'Fechar SC';
  const verb = isCancel ? 'cancelamento' : 'fechamento';
  const finalAction = isCancel ? 'Confirmar cancelamento' : 'Confirmar fechamento';
  const successMsg = isCancel ? 'SC cancelada' : 'SC fechada';

  useEffect(() => {
    if (step === 'form') firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        // Esc no step 2 = voltar pro form; Esc no step 1 = fechar modal.
        if (step === 'confirm') setStep('form');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting, step]);

  function handleAdvance(e: FormEvent) {
    e.preventDefault();
    // Motivo é opcional, mas se digitar precisa ter conteúdo mínimo
    const text = notes.trim();
    if (text && text.length < 3) {
      setError('Observação muito curta (mínimo 3 caracteres) ou deixe em branco.');
      return;
    }
    setError(null);
    setStep('confirm');
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.closePurchaseRequest(request.id, {
        reason,
        notes: notes.trim() || undefined,
        // Só manda SNs em recebimento de equipamento com texto preenchido
        serialNumbersRaw:
          isReceiving && serialsRaw.trim() ? serialsRaw : undefined,
      });
      // Se houve recebimento, mostra o relatório antes de fechar o modal
      if (result.receiving) {
        setReport(result.receiving);
        setStep('done');
        setSubmitting(false);
        toast.success(
          `${result.receiving.created} equipamento(s) dado(s) entrada`,
        );
      } else {
        toast.success(successMsg);
        onClosed();
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : `Falha ao executar ${verb}.`;
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
      setStep('form');
    }
  }

  return (
    <div
      className="modal-backdrop modal-backdrop--stacked"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal movement-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'form' ? (
          <>
            <header className="modal__head">
              <div>
                <span className="eyebrow">
                  {isCancel ? 'Cancelamento manual' : 'Recebimento ou fechamento'}
                </span>
                <h2>{title}</h2>
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

            <div className="movement-context">
              <div className="movement-context__asset">
                <span className="movement-context__model">
                  {request.targetKind === 'CATEGORY' ? 'Categoria' : 'Modelo'}
                </span>
                <code className="movement-context__serial">
                  {request.targetValue}
                  {request.equipmentModel ? ` · ${request.equipmentModel}` : ''}
                  {' · '}
                  {request.quantity}{' '}
                  {request.quantity === 1 ? 'unidade' : 'unidades'}
                </code>
              </div>
              <div className="movement-context__transition">
                <span className="pill">{PR_STATUS_LABEL[request.status]}</span>
                <span className="movement-context__arrow">→</span>
                <span className="pill pill--Descartado">
                  {isCancel ? 'Cancelada' : 'Fechada'}
                </span>
              </div>
            </div>

            {request.scNumber && (
              <div className="discard-warning" role="note">
                <strong>SC nº {request.scNumber}</strong> já registrada.
                Após {verb}, a compra sai do ciclo ativo.
              </div>
            )}

            <form onSubmit={handleAdvance} className="asset-form">
              {isReceiving && (
                <div className="form-field">
                  <span
                    className="form-label form-label--with-help"
                    id="sc-serials-label"
                  >
                    SNs recebidas (cole a lista do almoxarifado)
                    <HelpButton
                      label="Ajuda sobre recebimento de SC"
                      title="Receber uma Solicitação de Compra"
                    >
                      <p>
                        <strong>Fechar uma SC de equipamento é dar entrada
                        nele no estoque.</strong> Ao colar os números de série
                        (SN) recebidos, o Control cadastra cada equipamento
                        automaticamente e encerra a solicitação — tudo de uma
                        vez.
                      </p>

                      <h4>Passo a passo</h4>
                      <ol>
                        <li>
                          Confira no topo a <strong>categoria/modelo</strong> e
                          a <strong>quantidade</strong> que a SC previa.
                        </li>
                        <li>
                          <strong>Cole a lista de SNs</strong> recebidas, uma
                          por linha (veja o formato abaixo).
                        </li>
                        <li>
                          Clique em <strong>Avançar para confirmação</strong> e
                          confirme.
                        </li>
                      </ol>

                      <h4>De onde vem a lista?</h4>
                      <p>
                        Da planilha do <strong>almoxarifado</strong> — os SNs
                        dos equipamentos que chegaram fisicamente. Pode copiar a
                        coluna inteira e colar direto.
                      </p>

                      <h4>Formato esperado</h4>
                      <p>Uma SN por linha:</p>
                      <div className="help-example">{`ABC123
DEF456
GHI789`}</div>
                      <p>
                        Cabeçalho e uma eventual coluna de modelo ao lado são{' '}
                        <strong>ignorados automaticamente</strong>.
                      </p>

                      <h4>Bom saber</h4>
                      <ul>
                        <li>
                          Todos os equipamentos entram com o modelo definido na
                          SC — você não digita o modelo aqui.
                        </li>
                        <li>
                          SNs <strong>já cadastradas</strong> são{' '}
                          <strong>puladas</strong> (sem duplicata). O relatório
                          final mostra quantas entraram e quantas foram puladas.
                        </li>
                        <li>
                          A quantidade colada <strong>pode divergir</strong> da
                          prevista na SC (ex.: chegou parcial). O sistema aceita
                          e registra o que você colou.
                        </li>
                        <li>
                          Pra encerrar a SC <strong>sem</strong> dar entrada
                          (ex.: equipamento veio por outro fluxo), deixe a lista{' '}
                          <strong>vazia</strong>.
                        </li>
                      </ul>
                    </HelpButton>
                  </span>
                  <textarea
                    className="field field--mono"
                    aria-labelledby="sc-serials-label"
                    value={serialsRaw}
                    onChange={(e) => setSerialsRaw(e.target.value)}
                    placeholder={
                      'Cole as SNs aqui (uma por linha).\nPode colar direto do Excel — cabeçalho e coluna de modelo são ignorados.\n\nABC123\nDEF456\nGHI789'
                    }
                    rows={6}
                  />
                  <span className="form-hint">
                    Todos entram como <strong>{request.equipmentModel}</strong>.
                    SNs já existentes são puladas. Deixe vazio pra fechar sem dar
                    entrada.
                  </span>
                </div>
              )}

              <label className="form-field">
                <span className="form-label">Observação (opcional)</span>
                <textarea
                  ref={firstFieldRef}
                  className="field"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    isCancel
                      ? 'ex.: SC duplicada, equipamento veio de outro fluxo, decisão revisada'
                      : 'ex.: Equipamentos recebidos no almoxarifado dia 14/06'
                  }
                  rows={3}
                />
              </label>

              {error && <p className="form-error">{error}</p>}

              <footer className="form-footer">
                <button type="button" className="btn" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="btn warning">
                  Avançar para confirmação
                </button>
              </footer>
            </form>
          </>
        ) : step === 'confirm' ? (
          /* ======== STEP 2 — Confirmação ======== */
          <>
            <header className="modal__head">
              <div>
                <span className="eyebrow">Última etapa</span>
                <h2>Confirmar {verb}</h2>
              </div>
              <button
                className="btn"
                onClick={() => !submitting && setStep('form')}
                type="button"
                disabled={submitting}
              >
                Voltar
              </button>
            </header>

            <div className="discard-confirm-warning" role="alert">
              <span className="discard-confirm-warning__icon" aria-hidden>
                <AlertIcon size={20} />
              </span>
              <div className="discard-confirm-warning__text">
                <strong>
                  {isCancel
                    ? 'A SC será cancelada definitivamente.'
                    : 'A SC será fechada e sairá do ciclo ativo.'}
                </strong>
                <span>
                  Após confirmar, esta operação fica registrada no histórico
                  e não pode ser desfeita.
                </span>
              </div>
            </div>

            <dl className="discard-confirm-summary">
              <div>
                <dt>
                  {request.targetKind === 'CATEGORY' ? 'Categoria' : 'Modelo'}
                </dt>
                <dd>{request.targetValue}</dd>
              </div>
              <div>
                <dt>Quantidade</dt>
                <dd>
                  {request.quantity}{' '}
                  {request.quantity === 1 ? 'unidade' : 'unidades'}
                </dd>
              </div>
              <div>
                <dt>Status atual</dt>
                <dd>{PR_STATUS_LABEL[request.status]}</dd>
              </div>
              {request.scNumber && (
                <div>
                  <dt>Número da SC</dt>
                  <dd>
                    <code>{request.scNumber}</code>
                  </dd>
                </div>
              )}
              {notes.trim() && (
                <div>
                  <dt>Observação</dt>
                  <dd className="discard-confirm-summary__reason">
                    {notes.trim()}
                  </dd>
                </div>
              )}
            </dl>

            {error && <p className="form-error">{error}</p>}

            <footer className="form-footer">
              <button
                type="button"
                className="btn"
                onClick={() => !submitting && setStep('form')}
                disabled={submitting}
              >
                Voltar
              </button>
              <button
                type="button"
                className="btn warning"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? 'Processando…' : finalAction}
              </button>
            </footer>
          </>
        ) : null}

        {step === 'done' && report && (
          <>
            <header className="modal__head">
              <div>
                <span className="eyebrow">Recebimento concluído</span>
                <h2>Entrada no estoque</h2>
              </div>
            </header>

            <div
              className="discard-confirm-warning"
              role="status"
              style={{
                background: 'color-mix(in srgb, #2ea357 10%, transparent)',
                borderColor: 'color-mix(in srgb, #2ea357 30%, transparent)',
              }}
            >
              <div className="discard-confirm-warning__text">
                <strong>
                  {report.created} {report.created === 1 ? 'equipamento' : 'equipamentos'}{' '}
                  {report.created === 1 ? 'entrou' : 'entraram'} no estoque
                </strong>
                <span>
                  {report.model} · {report.category}
                </span>
              </div>
            </div>

            <dl className="discard-confirm-summary">
              <div>
                <dt>Criados</dt>
                <dd>{report.created}</dd>
              </div>
              <div>
                <dt>Esperado (SC)</dt>
                <dd>
                  {report.expectedQuantity}
                  {report.quantityMismatch && (
                    <span className="receiving-mismatch"> ⚠ divergência</span>
                  )}
                </dd>
              </div>
              {report.skippedExisting > 0 && (
                <div>
                  <dt>SNs já existentes (puladas)</dt>
                  <dd>{report.skippedExisting}</dd>
                </div>
              )}
              {report.duplicatesInPaste > 0 && (
                <div>
                  <dt>Duplicadas na lista (ignoradas)</dt>
                  <dd>{report.duplicatesInPaste}</dd>
                </div>
              )}
            </dl>

            {report.quantityMismatch && (
              <div className="discard-warning" role="note">
                A quantidade recebida ({report.created}) difere da SC
                ({report.expectedQuantity}). Normal quando o pedido chega
                em lotes ou com divergência do fornecedor.
              </div>
            )}

            {report.skippedExisting > 0 && (
              <details className="receiving-skipped">
                <summary>
                  Ver {report.skippedExisting} SN(s) pulada(s)
                </summary>
                <ul>
                  {report.skippedExistingSerials.map((sn) => (
                    <li key={sn}>
                      <code>{sn}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <footer className="form-footer">
              <button
                type="button"
                className="btn primary"
                onClick={onClosed}
              >
                Concluir
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
