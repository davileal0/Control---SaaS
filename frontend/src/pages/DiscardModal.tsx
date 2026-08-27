import { useEffect, useRef, useState, FormEvent } from 'react';
import { api, AuditResult } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { STATUS_LABEL } from '../types/domain';
import { AlertIcon } from '../components/icons';
import AssetLocation from '../components/AssetLocation';
import './peripherals-modal.css';
import './audit.css'; // pill styles
import './asset-modal.css';

interface Props {
  asset: AuditResult;
  onClose: () => void;
  onConfirmed: () => void;
}

// ┌─────────────────────────────────────────────────────────────────┐
// │ Modal de descarte — 2 passos                                    │
// ├─────────────────────────────────────────────────────────────────┤
// │ Step 1 (form): preenche motivo                                  │
// │   Cancelar │ Avançar para confirmação                           │
// │                                                                 │
// │ Step 2 (confirm): revisa e confirma                             │
// │   Voltar │ Confirmar descarte (vermelho LED)                    │
// └─────────────────────────────────────────────────────────────────┘
//
// Por que 2 passos em vez de submit direto:
//   Descarte é a única operação IRREVERSÍVEL da plataforma. Sem
//   confirmação explícita extra, um clique errado vira arquivamento
//   permanente. O passo 2 obriga o operador a:
//     - Confirmar conscientemente a ação (não basta clicar no botão)
//     - Revisar uma vez mais o motivo que digitou
//     - Ter a chance de voltar atrás sem perder o que escreveu
//
// Por que NÃO digitar SN pra confirmar (padrão GitHub/Stripe):
//   Periféricos não têm SN consistente, e quando o ativo tem SN, ele
//   está visível literalmente na tela — digitar vira copy-paste
//   sem valor real (não testa atenção, só burocratiza). Confirmação
//   simples é mais honesta com a UX.
//
// Por que MESMO modal em vez de modal separado:
//   Triplo-empilhamento (AssetDetail → Discard → Confirm) acumularia
//   ~52% de escurecimento do backdrop — próximo da "caverna" feia que
//   já tínhamos eliminado. Visualmente o usuário sente o step 2 como
//   "outra tela" mesmo sendo tecnicamente o mesmo modal.
export default function DiscardModal({ asset, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (step === 'form') firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        // Esc no step 2 volta pro form (não fecha). Esc no form fecha.
        if (step === 'confirm') setStep('form');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting, step]);

  // Step 1 → 2: valida motivo e avança
  function handleAdvance(e: FormEvent) {
    e.preventDefault();
    const motivo = reason.trim();
    if (motivo.length < 5) {
      setError('Motivo obrigatório (mínimo 5 caracteres).');
      return;
    }
    setError(null);
    setStep('confirm');
  }

  // Step 2: dispara o descarte de verdade
  async function handleConfirm() {
    const motivo = reason.trim();
    setSubmitting(true);
    setError(null);
    try {
      await api.discardAsset(asset.serialNumber, { notes: motivo });
      toast.success('Equipamento descartado');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao descartar o ativo.');
      toast.error('Não foi possível descartar o ativo.');
      setSubmitting(false);
      // Volta pro form pra deixar o usuário revisar
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
        aria-label="Descartar ativo definitivamente"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'form' ? (
          /* ============================================================
             STEP 1 — Form de motivo
             ============================================================ */
          <>
            <header className="modal__head">
              <div>
                <span className="eyebrow">Saída definitiva do inventário</span>
                <h2>Descartar ativo</h2>
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
                <AssetLocation unit={asset.currentUnit} />
                <span className="movement-context__model">{asset.model}</span>
                <code className="movement-context__serial">
                  {asset.serialNumber}
                </code>
              </div>
              <div
                className="movement-context__transition"
                aria-label="Estado atual"
              >
                <span className={`pill pill--${asset.status}`}>
                  {STATUS_LABEL[asset.status]}
                </span>
                <span className="movement-context__arrow">→</span>
                <span className="pill pill--archived">Arquivado</span>
              </div>
            </div>

            <div className="discard-warning" role="alert">
              <strong>Operação irreversível.</strong> O ativo será arquivado,
              removido das contagens ativas (Dashboard, listas, métricas) e
              registrado na <em>planilha de equipamentos descartados</em>. O
              histórico permanece consultável pela Auditoria buscando pelo
              número de série.
            </div>

            <form onSubmit={handleAdvance} className="asset-form">
              <label className="form-field">
                <span className="form-label">Motivo do descarte</span>
                <textarea
                  ref={firstFieldRef}
                  className="field"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="ex.: Spectra condenou o equipamento (laudo técnico anexo no chamado X) / Perda durante mudança de unidade / Roubo registrado em BO"
                  rows={4}
                  required
                />
              </label>

              {error && <p className="form-error">{error}</p>}

              <footer className="form-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn warning">
                  Avançar para confirmação
                </button>
              </footer>
            </form>
          </>
        ) : (
          /* ============================================================
             STEP 2 — Confirmação final
             ============================================================ */
          <>
            <header className="modal__head">
              <div>
                <span className="eyebrow">Última etapa</span>
                <h2>Confirmar descarte</h2>
              </div>
              <button
                className="btn"
                onClick={() => !submitting && setStep('form')}
                type="button"
                disabled={submitting}
                aria-label="Voltar para o formulário"
              >
                Voltar
              </button>
            </header>

            {/* Bloco crítico de aviso — visual mais forte que o do step 1
                porque agora estamos a 1 clique do irreversível */}
            <div className="discard-confirm-warning" role="alert">
              <span className="discard-confirm-warning__icon" aria-hidden>
                <AlertIcon size={20} />
              </span>
              <div className="discard-confirm-warning__text">
                <strong>Esta ação não pode ser desfeita.</strong>
                <span>
                  O ativo será arquivado em definitivo e removido das listas
                  ativas. Revise os dados abaixo antes de confirmar.
                </span>
              </div>
            </div>

            {/* Resumo do que vai ser descartado — modelo + SN (se houver) */}
            <dl className="discard-confirm-summary">
              <div>
                <dt>Modelo</dt>
                <dd>{asset.model}</dd>
              </div>
              <div>
                <dt>Número de série</dt>
                <dd>
                  <code>{asset.serialNumber}</code>
                </dd>
              </div>
              <div>
                <dt>Motivo informado</dt>
                <dd className="discard-confirm-summary__reason">
                  {reason.trim()}
                </dd>
              </div>
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
                {submitting ? 'Descartando…' : 'Confirmar descarte'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
