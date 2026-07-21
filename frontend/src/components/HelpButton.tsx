import { useEffect, useState, ReactNode } from 'react';
import './help-panel.css';

// =====================================================================
// Ajuda contextual — botão "?" + painel deslizante.
// =====================================================================
// Reaproveitável: cada fluxo complexo passa seu próprio conteúdo. O
// botão fica ao lado do título/seção; ao clicar, abre um painel lateral
// (não um modal central) com o passo-a-passo daquele fluxo.
//
// Acessibilidade + sensibilidade vestibular: a abertura usa SOMENTE
// opacidade (fade), sem deslize/zoom. Respeita prefers-reduced-motion.

interface HelpButtonProps {
  /** Rótulo acessível (ex.: "Ajuda sobre cadastro em massa") */
  label: string;
  /** Título exibido no topo do painel */
  title: string;
  /** Conteúdo do painel (JSX livre) */
  children: ReactNode;
}

export default function HelpButton({ label, title, children }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="help-trigger"
        aria-label={label}
        title={label}
        onClick={(e) => {
          // stopPropagation: quando o "?" fica DENTRO de um <label>
          // (ao lado do texto do campo), o clique no label dispararia
          // foco no input associado. Paramos a propagação pra abrir só
          // a ajuda. preventDefault reforça (label não "ativa" o campo).
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {/* Ícone "?" em círculo — stroke fino, estilo Lucide */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {open && (
        <div
          className="help-overlay"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <aside
            className="help-panel glass"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="help-panel__head">
              <h3>{title}</h3>
              <button
                type="button"
                className="help-panel__close"
                onClick={() => setOpen(false)}
                aria-label="Fechar ajuda"
              >
                ✕
              </button>
            </header>
            <div className="help-panel__body">{children}</div>
          </aside>
        </div>
      )}
    </>
  );
}
