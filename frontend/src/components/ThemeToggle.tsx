import { Theme } from '../lib/theme';
import './theme-toggle.css';

interface Props {
  theme: Theme;
  onToggle: () => void;
}

// Ícones inline. Sol detalhado, lua crescente. Stroke fino pra ficar
// elegante (linha de relógio de luxo, não de aplicativo de clima).
function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.8" />
      <line x1="12" y1="2.5" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="21.5" />
      <line x1="2.5" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="21.5" y2="12" />
      <line x1="5.2" y1="5.2" x2="6.6" y2="6.6" />
      <line x1="17.4" y1="17.4" x2="18.8" y2="18.8" />
      <line x1="5.2" y1="18.8" x2="6.6" y2="17.4" />
      <line x1="17.4" y1="6.6" x2="18.8" y2="5.2" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z" />
    </svg>
  );
}

// Botão circular minimalista pra alternar tema. Mostra o ícone do
// tema OPOSTO (em dark mostra sol = "vou ativar o claro"); intuitivo
// porque o ícone representa o destino do clique, não o estado atual.
export default function ThemeToggle({ theme, onToggle }: Props) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      <span className="theme-toggle__icon" key={theme /* re-render → fade */}>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}
