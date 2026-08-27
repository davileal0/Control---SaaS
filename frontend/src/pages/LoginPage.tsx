import { useState } from 'react';
import BrandIcon from '../components/BrandIcon';
import ThemeToggle from '../components/ThemeToggle';
import { Theme } from '../lib/theme';
import { Role, ROLE_LABEL } from '../types/domain';
import { API_BASE } from '../lib/api';
import './login.css';

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onLogin: (role: Role) => void;
}

// Logo oficial Microsoft 365 — 4 quadrados nas cores oficiais.
// Inline pra evitar dependência externa e garantir crisp em qualquer DPI.
function MicrosoftLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 23 23"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

// Detecta se estamos em build de desenvolvimento. Em build de produção
// (npm run build), o Vite avalia isso pra `false` e o tree-shaker remove
// toda a seção de dev do bundle final — zero pegada em produção.
const IS_DEV = import.meta.env.DEV;

// Tela de acesso à plataforma. Caminho principal: SSO via Microsoft 365.
// Em desenvolvimento, exibe também 3 atalhos pra simular login com cada
// papel (eles desaparecem completamente em build de produção).
export default function LoginPage({ theme, onToggleTheme, onLogin }: Props) {
  const [msPending, setMsPending] = useState(false);

  // Mensagem de erro vinda de uma tentativa de SSO que falhou (o backend
  // redireciona com ?error=... e o App guarda em sessionStorage).
  const ssoError =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('control-sso-error')
      : null;
  if (ssoError) sessionStorage.removeItem('control-sso-error');

  function errorMessage(code: string): string {
    switch (code) {
      case 'nao_autorizado':
        return 'Sua conta não está autorizada no Control. Fale com o administrador.';
      case 'sessao_expirada':
        return 'A sessão de login expirou. Tente novamente.';
      case 'sem_email':
        return 'Não foi possível obter seu e-mail da conta Microsoft.';
      default:
        return 'Não foi possível concluir o login. Tente novamente.';
    }
  }

  function handleMicrosoftLogin() {
    // Redireciona pro backend, que inicia o fluxo OIDC com o Azure AD.
    setMsPending(true);
    window.location.href = `${API_BASE}/auth/login`;
  }

  return (
    <div className="login-page">
      {/* Toggle de tema no canto superior direito */}
      <div className="login-theme-toggle">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      {/* Brasão da marca: BrandIcon grande + wordmark + eyebrow */}
      <div className="login-brand">
        <BrandIcon size={88} />
        <h1 className="login-brand__wordmark">
          <span className="login-brand__con">Con</span>
          <span className="login-brand__trol">trol</span>
        </h1>
        <span className="login-brand__eyebrow">Controle de ativos de TI</span>
      </div>

      {/* Card central de autenticação */}
      <section className="login-card glass" aria-label="Acesso à plataforma">
        <header className="login-card__head">
          <h2>Acesso à plataforma</h2>
          <p>
            Entre com sua conta corporativa Microsoft 365 para acessar o
            controle de ativos.
          </p>
        </header>

        {ssoError && (
          <div className="login-error" role="alert">
            {errorMessage(ssoError)}
          </div>
        )}

        {/* Caminho principal: SSO oficial */}
        <button
          type="button"
          className="btn-microsoft"
          onClick={handleMicrosoftLogin}
          disabled={msPending}
        >
          <MicrosoftLogo />
          <span>{msPending ? 'Conectando…' : 'Entrar com Microsoft 365'}</span>
        </button>

        {/* Atalhos de DEV — somem em build de produção via tree-shaking */}
        {IS_DEV && (
          <>
            <div className="login-divider" role="separator">
              <span>Atalhos de desenvolvimento</span>
            </div>

            <p className="login-dev-hint">
              Simula o login com um perfil específico. Disponível apenas no
              modo dev (DEV_NO_AUTH).
            </p>

            <div className="login-roles">
              {(['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className="btn-role"
                  onClick={() => onLogin(r)}
                >
                  <span className="btn-role__label">{ROLE_LABEL[r]}</span>
                  <span className="btn-role__hint">
                    {r === 'OPERADOR_N1' &&
                      'Operação completa do inventário.'}
                    {r === 'LIDER_N1' &&
                      'Operação + relatórios consolidados.'}
                    {r === 'DIRETOR_TI' &&
                      'Leitura: dashboards e auditoria.'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="login-footer">
        <span>Unifique Telecomunicações · Infraestrutura de TI · N1</span>
      </footer>
    </div>
  );
}
