import { useState } from 'react';
import Sidebar from './components/Sidebar';
import ThemeToggle from './components/ThemeToggle';
import SettingsMenu from './components/SettingsMenu';
import TopProgressBar from './components/TopProgressBar';
import Dashboard from './pages/Dashboard';
import AuditTimeline from './pages/AuditTimeline';
import Discarded from './pages/Discarded';
import Assets from './pages/Assets';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Activity from './pages/Activity';
import PurchaseRequests from './pages/PurchaseRequests';
import LoginPage from './pages/LoginPage';
import { Role, ROLE_LABEL } from './types/domain';
import { visibleNav } from './lib/rbac';
import { setDevRole, setAuthToken } from './lib/api';
import { useTheme } from './lib/theme';
import { useGlass } from './lib/glass';
import { ToastProvider } from './contexts/ToastContext';
import './components/loading.css';
import './styles/global.css';
import './app.css';
import Inventario from './pages/Inventario';


const ROLES: Role[] = ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'];
// Chave do sessionStorage onde guardamos a sessão de dev. sessionStorage
// dura enquanto a aba está aberta — fechou, esquece. Mais adequado pra
// desenvolvimento que localStorage (que persistiria pra sempre).
const SESSION_KEY = 'control-dev-role';

function readPersistedRole(): Role | null {
  if (typeof window === 'undefined') return null;
  const saved = sessionStorage.getItem(SESSION_KEY);
  return saved && ROLES.includes(saved as Role) ? (saved as Role) : null;
}

// Decodifica o payload de um JWT (só a parte de leitura — a verificação
// de assinatura é feita no backend). Retorna o role se válido.
// Identidade extraída do JWT do SSO.
interface SsoIdentity {
  role: Role;
  name: string;
  isSso: true;
}

function identityFromJwt(token: string): SsoIdentity | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const r = payload.role as string;
    if (!ROLES.includes(r as Role)) return null;
    return {
      role: r as Role,
      name: (payload.name as string) || (payload.email as string) || '',
      isSso: true,
    };
  } catch {
    return null;
  }
}

// Captura o token do SSO no retorno do Azure. O backend redireciona pra
// /auth/callback#token=JWT — lemos o fragment (#), guardamos o token na
// api, extraímos a identidade e limpamos a URL. Também trata ?error=...
// vindo de falhas de login. Retorna a identidade autenticada (ou null).
function captureSsoLogin(): SsoIdentity | null {
  if (typeof window === 'undefined') return null;

  // Erro de login vindo do backend (?error=nao_autorizado etc.)
  const params = new URLSearchParams(window.location.search);
  const err = params.get('error');
  if (err) {
    // Limpa a URL; o LoginPage pode exibir a mensagem via sessionStorage.
    sessionStorage.setItem('control-sso-error', err);
    window.history.replaceState({}, '', window.location.pathname);
    return null;
  }

  const hash = window.location.hash;
  if (!hash.startsWith('#token=')) return null;

  const token = hash.slice('#token='.length);
  const identity = identityFromJwt(token);
  if (!token || !identity) return null;

  setAuthToken(token);
  sessionStorage.setItem(SESSION_KEY, identity.role);
  sessionStorage.setItem('control-user-name', identity.name);
  sessionStorage.setItem('control-is-sso', 'true');
  // Remove o token da URL (não fica no histórico nem visível).
  window.history.replaceState({}, '', window.location.pathname);
  return identity;
}

// Lê a identidade persistida (após reload). Distingue SSO de dev.
function readPersistedIdentity(): {
  role: Role;
  name: string;
  isSso: boolean;
} | null {
  const role = readPersistedRole();
  if (!role) return null;
  return {
    role,
    name: sessionStorage.getItem('control-user-name') ?? '',
    isSso: sessionStorage.getItem('control-is-sso') === 'true',
  };
}

export default function App() {
  // ToastProvider envolve TODA a app — fica disponível tanto na
  // LoginPage quanto na plataforma logada. Garante coerência se o
  // login passar a disparar notificações no futuro.
  //
  // TopProgressBar também é global (fora da AppInner) — a barra
  // fina LED no topo aparece durante qualquer request HTTP, em
  // login ou plataforma. Listener no tracker singleton evita
  // rerender da app inteira.
  return (
    <ToastProvider>
      <TopProgressBar />
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  // Identidade do usuário. null = não autenticado (mostra LoginPage).
  // Prioridade: 1) token SSO recém-chegado no #hash; 2) sessão persistida.
  const [identity, setIdentity] = useState<{
    role: Role;
    name: string;
    isSso: boolean;
  } | null>(() => captureSsoLogin() ?? readPersistedIdentity());
  const [active, setActive] = useState('dashboard');
  // useTheme aplica data-theme no <html> automaticamente e persiste.
  // Ativado aqui na raiz do app pra valer em TODA renderização —
  // tanto LoginPage quanto a plataforma logada.
  const { theme, toggle: toggleTheme } = useTheme();
  // useGlass aplica data-glass no <html> e persiste em localStorage.
  const { glass, setGlass } = useGlass();

  // Caminho 1: não autenticado → LoginPage cuida do fluxo de entrada
  if (!identity) {
    return (
      <LoginPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={(newRole) => {
          // Login via atalho de DEV (não-SSO). Só disponível em dev.
          sessionStorage.setItem(SESSION_KEY, newRole);
          sessionStorage.setItem('control-is-sso', 'false');
          sessionStorage.removeItem('control-user-name');
          setDevRole(newRole);
          setIdentity({ role: newRole, name: '', isSso: false });
        }}
      />
    );
  }

  const role = identity.role;

  // Caminho 2: autenticado → plataforma normal
  setDevRole(role);

  const allowed = visibleNav(role).map((n) => n.key);
  const current = allowed.includes(active) ? active : 'dashboard';

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('control-user-name');
    sessionStorage.removeItem('control-is-sso');
    setAuthToken(''); // limpa o Bearer da api (SSO ou dev)
    setIdentity(null);
    setActive('dashboard');
  }

  function handleRoleSwitch(newRole: Role) {
    // Só usado no modo dev (a barra "Visualizar como" só aparece em dev).
    sessionStorage.setItem(SESSION_KEY, newRole);
    setIdentity((prev) =>
      prev ? { ...prev, role: newRole } : { role: newRole, name: '', isSso: false },
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        role={role}
        userName={identity.name}
        active={current}
        onNavigate={setActive}
        onLogout={handleLogout}
      />
      <main className="content" key={current}>
        {/* Header da plataforma: role-switch (SÓ em dev) à esquerda,
            ThemeToggle SEMPRE à direita. No login real (SSO) o
            role-switch NÃO aparece — um operador não pode "virar" outro
            papel; isso burlaria o controle de acesso. */}
        <header className="content-header">
          {identity.isSso ? (
            <div />
          ) : (
            <div className="role-switch">
              <span className="eyebrow">Visualizar como</span>
              {ROLES.map((r) => (
                <button
                  key={r}
                  className={`role-chip ${r === role ? 'role-chip--on' : ''}`}
                  onClick={() => handleRoleSwitch(r)}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          )}
          <div className="header-actions">
            <SettingsMenu glass={glass} onGlassChange={setGlass} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        {current === 'dashboard' && <Dashboard role={role} onNavigate={setActive} />}
        {current === 'audit' && <AuditTimeline role={role} />}
        {current === 'discarded' && <Discarded />}
        {current === 'assets' && <Assets role={role} />}
        {current === 'purchase-requests' && <PurchaseRequests role={role} />}
        {current === 'settings' && <Settings />}
        {current === 'reports' && <Reports role={role} />}
        {current === 'activity' && <Activity />}
        {current === 'inventory' && <Inventario role={role} />}
      </main>
    </div>
  );
}
