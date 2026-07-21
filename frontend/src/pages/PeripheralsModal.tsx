import { useEffect, useRef } from 'react';
import { PeripheralBreakdown } from '../lib/api';
import { LOW_STOCK_THRESHOLD } from '../lib/constants';
import './peripherals-modal.css';

interface Props {
  data: PeripheralBreakdown;
  onClose: () => void;
}

// Modal moderno: contagem individual de cada item de periférico pelo
// `model` (Mouses, Teclados, Mochilas…), evitando poluir o dashboard.
//
// Legenda no topo deixa explícito o significado dos pills numéricos
// em cada linha — substituindo a dependência exclusiva de tooltips
// (que não funcionam em touch e não ajudam na primeira visualização).
//
// "Danificado" não aparece na legenda: na operação Unifique, peri-
// férico com qualquer dano vai DIRETO pra descarte (não passa por
// assistência). O pill --dmg continua sendo renderizado nas linhas
// caso > 0 — cobertura defensiva pra casos raros (recebimento já
// danificado, transição em andamento).
export default function PeripheralsModal({ data, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bar mostra o TOTAL por modelo (todos os status somados)
  const max = Math.max(...data.items.map((i) => i.total), 1);

  // Ordena por disponível ascendente — o operador vê primeiro o que
  // precisa repor (consistente com o card no dashboard).
  const sorted = [...data.items].sort((a, b) => a.available - b.available);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal glass"
        role="dialog"
        aria-modal="true"
        aria-label="Periféricos gerais"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">Estoque ativo</span>
            <h2>Periféricos gerais</h2>
          </div>
          <button ref={closeRef} className="btn" onClick={onClose}>
            Fechar
          </button>
        </header>

        {/* Legenda visível — explica o que os pills numéricos significam */}
        <div className="periph-legend" aria-label="Legenda dos números">
          <span className="periph-legend__item">
            <span className="periph-legend__dot periph-legend__dot--avail" aria-hidden />
            Disponível
          </span>
          <span className="periph-legend__item">
            <span className="periph-legend__dot periph-legend__dot--inuse" aria-hidden />
            Em uso
          </span>
          <span className="periph-legend__sep" aria-hidden>|</span>
          <span className="periph-legend__item periph-legend__item--total">
            Total
          </span>
        </div>

        <ul className="periph-list">
          {sorted.map((item) => {
            const isAlert = item.available <= LOW_STOCK_THRESHOLD;
            return (
              <li key={item.model} className={`periph-row ${isAlert ? 'periph-row--alert' : ''}`}>
                <span className="periph-row__name">{item.model}</span>
                <span className="periph-row__bar">
                  <span
                    className="periph-row__fill"
                    style={{ width: `${(item.total / max) * 100}%` }}
                  />
                </span>
                <span className="periph-row__breakdown">
                  <span className="periph-row__pill periph-row__pill--avail" title="Disponível">
                    {item.available}
                  </span>
                  <span className="periph-row__pill periph-row__pill--inuse" title="Em uso">
                    {item.inUse}
                  </span>
                  {/* Pill de danificado: só aparece em casos raros — não está
                      na legenda porque na operação real periféricos danificados
                      são descartados de imediato. */}
                  {item.damaged > 0 && (
                    <span className="periph-row__pill periph-row__pill--dmg" title="Danificado">
                      {item.damaged}
                    </span>
                  )}
                </span>
                <strong className="periph-row__count">{item.total}</strong>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
