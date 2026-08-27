import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { User, ROLE_LABEL } from '../types/domain';
import Spinner from '../components/Spinner';
import { useToast } from '../contexts/ToastContext';
import UserModal from './UserModal';
import UnitsCard from './UnitsCard';
import './settings.css';

// Tela de Configurações → Usuários.
// Acessível apenas para Diretor de TI (filtragem em rbac.ts +
// reimposição no backend via canManageUsers).
export default function Settings() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  // Alterna isActive sem precisar abrir modal — operação direta de
  // 1-clique. window.confirm continua como barreira de segurança
  // contra cliques acidentais.
  async function toggleActive(user: User) {
    const action = user.isActive ? 'desativar' : 'reativar';
    if (!window.confirm(`Deseja ${action} ${user.fullName}?`)) return;

    setBusyUserId(user.id);
    try {
      await api.updateUser(user.id, { isActive: !user.isActive });
      await reload();
      toast.success(
        user.isActive
          ? `${user.fullName} desativado`
          : `${user.fullName} reativado`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Falha ao ${action} usuário.`,
      );
    } finally {
      setBusyUserId(null);
    }
  }

  function handleConfirmed() {
    setCreating(false);
    setEditingUser(null);
    reload();
  }

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Administração</span>
        <h1>Usuários</h1>
        <p>
          Em produção, os usuários são provisionados automaticamente no
          primeiro login via SSO (Microsoft 365), com o papel atribuído
          conforme o grupo do Azure AD ao qual pertencem. Esta tela permite
          consultar os usuários que já acessaram a plataforma e, se
          necessário, sobrescrever o papel atribuído.
        </p>
      </div>

      <div className="users-toolbar">
        <button
          className="btn accent"
          onClick={() => setCreating(true)}
          type="button"
        >
          Cadastrar usuário
        </button>
      </div>

      {loading && (
        <div className="spinner-center">
          <Spinner size={28} />
          <span>Carregando…</span>
        </div>
      )}
      {error && <p className="users-empty">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <p className="users-empty">
          Nenhum usuário cadastrado. Use o botão "Cadastrar usuário" para
          adicionar o primeiro.
        </p>
      )}

      {!loading && !error && users.length > 0 && (
        <section className="card users-card">
          <table className="users-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Status</th>
                <th className="users-table__actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={u.isActive ? '' : 'users-row--inactive'}
                >
                  <td>{u.fullName}</td>
                  <td>
                    <code className="users-email">{u.email}</code>
                  </td>
                  <td>
                    <span className={`role-pill role-pill--${u.role}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td>
                    {u.isActive ? (
                      <span className="status-dot status-dot--on">Ativo</span>
                    ) : (
                      <span className="status-dot status-dot--off">Inativo</span>
                    )}
                  </td>
                  <td className="users-table__actions">
                    <button
                      type="button"
                      className="log-action"
                      onClick={() => setEditingUser(u)}
                      disabled={busyUserId === u.id}
                    >
                      Alterar papel
                    </button>
                    <button
                      type="button"
                      className="log-action"
                      onClick={() => toggleActive(u)}
                      disabled={busyUserId === u.id}
                    >
                      {u.isActive ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {creating && (
        <UserModal
          onClose={() => setCreating(false)}
          onConfirmed={handleConfirmed}
        />
      )}
      {editingUser && (
        <UserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onConfirmed={handleConfirmed}
        />
      )}

      {/* Gestão de unidades (filiais) — localização dos ativos. */}
      <UnitsCard />
    </>
  );
}
