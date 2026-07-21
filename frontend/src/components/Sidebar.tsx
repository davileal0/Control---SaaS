import Logo from './Logo';
import { Role, ROLE_LABEL } from '../types/domain';
import { groupedNav } from '../lib/rbac';
import './sidebar.css';

interface Props {
  role: Role;
  userName?: string;
  active: string;
  onNavigate: (key: string) => void;
  onLogout: () => void;
}

// Ícones da navegação. Estilo Lucide/Heroicons: stroke fino (1.6), linha
// contínua, herdam currentColor. Mantidos inline (sem dependência externa)
// e alinhados à estética enxuta da plataforma.
function NavGlyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="nav-item__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const NAV_ICONS: Record<string, JSX.Element> = {
  dashboard: (
    <NavGlyph>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </NavGlyph>
  ),
  assets: (
    <NavGlyph>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </NavGlyph>
  ),
  inventory: (
    <NavGlyph>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </NavGlyph>
  ),
  'purchase-requests': (
    <NavGlyph>
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M2 3h2l2.4 12.3a1 1 0 0 0 1 .7h9.2a1 1 0 0 0 1-.8L21 7H5.5" />
    </NavGlyph>
  ),
  audit: (
    <NavGlyph>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <polyline points="3 3 3 8 8 8" />
      <polyline points="12 8 12 12 15 14" />
    </NavGlyph>
  ),
  activity: (
    <NavGlyph>
      <polyline points="3 12 7 12 10 19 14 5 17 12 21 12" />
    </NavGlyph>
  ),
  discarded: (
    <NavGlyph>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </NavGlyph>
  ),
  reports: (
    <NavGlyph>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="11" width="3" height="6" rx="0.5" />
      <rect x="11" y="7" width="3" height="10" rx="0.5" />
      <rect x="16" y="13" width="3" height="4" rx="0.5" />
    </NavGlyph>
  ),
  settings: (
    <NavGlyph>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </NavGlyph>
  ),
};

// Ícone de logout inline. Representa "saída por uma porta" — universal.
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
        {groupedNav(role).map(({ group, items }) => (
          <div key={group.id} className="nav-group">
            <p className="nav-group__label">{group.label}</p>
            {items.map((item) => {
              const isActive = item.key === active;
              return (
                <button
                  key={item.key}
                  className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.hint}
                  onClick={() => onNavigate(item.key)}
                >
                  <span className="nav-item__rail" />
                  {NAV_ICONS[item.key]}
                  <span className="nav-item__label">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
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
