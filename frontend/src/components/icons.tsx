/**
 * Biblioteca de ícones SVG inline, estilo Lucide/Heroicons.
 *
 * Princípios:
 *  - stroke fino (1.5–1.6), linhas contínuas, sem preenchimento
 *  - currentColor — herdam a cor do contexto pai via CSS (text-primary,
 *    text-muted, etc) — funcionam em ambos os temas sem override
 *  - prop `size` controla largura E altura (sempre quadrados)
 *  - aria-hidden por padrão (decorativos); use aria-label no pai se
 *    o ícone for o único conteúdo de um botão.
 *
 * Por que centralizar aqui:
 *  - Coerência visual: todos os ícones têm o mesmo stroke, mesma
 *    métrica, mesmo "peso visual"
 *  - Reaproveitamento: cards de categoria, item de periférico,
 *    botões de ação, todos puxam daqui
 *  - Trocar todos os ícones de notebook em 1 só lugar
 */

interface IconProps {
  className?: string;
  size?: number;
}

const STROKE = '1.6';

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
}

/** Notebook / laptop — usado pra categoria Notebook */
export function NotebookIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

/** Smartphone — categoria Celular */
export function PhoneIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

/** Monitor com base — categoria All-in-One */
export function MonitorIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

/** Mouse — pra item de periférico (genérico) */
export function MouseIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="6" y="2" width="12" height="20" rx="6" ry="6" />
      <line x1="12" y1="6" x2="12" y2="10" />
    </svg>
  );
}

/** Triângulo de alerta — estoque crítico */
export function AlertIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/** Check em círculo — sucesso (toasts) */
export function CheckCircleIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

/** X em círculo — erro (toasts) */
export function XCircleIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/** Info em círculo — info neutra (toasts) */
export function InfoCircleIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/** Escudo — sinaliza integridade/imutabilidade da auditoria */
export function ShieldIcon({ className, size = 20 }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
