import Logo from './Logo';
import { Role, ROLE_LABEL } from '../types/domain';
import { visibleNav } from '../lib/rbac';
import './sidebar.css';

interface Props {
  role: Role;
  userName?: string;
  active: string;
  onNavigate: (key: string) => void;
  onLogout: () => void;
}

// Ícone de logout inline. Estilo Lucide/Heroicons: stroke fino,
// linha contínua, alinhado com a estética enxuta da plataforma.
// Representa "saída por uma porta" — universal, dispensa legenda.
function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export default function Sidebar({
  role,
  userName,
  active,
  onNavigate,
  onLogout,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo />
      </div>

      <nav className="sidebar__nav" aria-label="Navegação principal">
        {visibleNav(role).map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.key)}
            >
              <span className="nav-item__rail" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__user glass">
        <div className="sidebar__user-info">
          {userName ? (
            <>
              <span className="sidebar__name">{userName}</span>
              <span className="sidebar__role">{ROLE_LABEL[role]}</span>
            </>
          ) : (
            <>
              <span className="eyebrow">Sessão</span>
              <span className="sidebar__role">{ROLE_LABEL[role]}</span>
            </>
          )}
        </div>
        <button
          type="button"
          className="sidebar__logout"
          onClick={onLogout}
          aria-label="Encerrar sessão"
          title="Logout"
        >
          <LogoutIcon />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
