import { useEffect, useRef, useState, FormEvent } from 'react';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { Role, User, ROLE_LABEL } from '../types/domain';
import './peripherals-modal.css';
import './asset-modal.css';

interface Props {
  /** Quando presente, o modal opera em modo de EDIÇÃO (só papel é
   *  editável). Quando ausente, opera em modo de CRIAÇÃO (form completo). */
  user?: User;
  onClose: () => void;
  onConfirmed: () => void;
}

const ROLES: Role[] = ['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI'];

// Modal de criação OU edição de usuário. Mesma estética dos demais
// modais empilhados. Diferenças visuais:
//  - Modo CRIAÇÃO: campos Nome, E-mail, Papel
//  - Modo EDIÇÃO: só seletor de Papel (nome/email são imutáveis;
//    a desativação tem botão próprio na linha da tabela)
export default function UserModal({ user, onClose, onConfirmed }: Props) {
  const toast = useToast();
  const isEdit = !!user;

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'OPERADOR_N1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!isEdit) {
      const name = fullName.trim();
      const mail = email.trim();
      if (!name || !mail) {
        setError('Nome e e-mail são obrigatórios.');
        return;
      }
      // Validação local básica de e-mail. Backend faz a validação real.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        setError('E-mail em formato inválido.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && user) {
        // Só envia se o papel realmente mudou
        if (role === user.role) {
          setError('O papel selecionado é o mesmo já atribuído.');
          setSubmitting(false);
          return;
        }
        await api.updateUser(user.id, { role });
        toast.success(`Papel atualizado para ${ROLE_LABEL[role]}`);
      } else {
        await api.createUser({
          fullName: fullName.trim(),
          email: email.trim(),
          role,
        });
        toast.success(`${fullName.trim()} cadastrado`);
      }
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar usuário.');
      toast.error(isEdit ? 'Não foi possível atualizar o usuário.' : 'Não foi possível cadastrar o usuário.');
      setSubmitting(false);
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
        aria-label={isEdit ? 'Editar papel do usuário' : 'Adicionar usuário'}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="eyebrow">
              {isEdit ? 'Alteração de papel' : 'Cadastro de usuário'}
            </span>
            <h2>{isEdit ? 'Editar usuário' : 'Adicionar usuário'}</h2>
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

        {isEdit && user && (
          <div className="movement-context">
            <div className="movement-context__asset">
              <span className="movement-context__model">{user.fullName}</span>
              <code className="movement-context__serial">{user.email}</code>
            </div>
          </div>
        )}

        <p className="movement-hint">
          {isEdit
            ? 'Você pode alterar o papel do usuário. Nome e e-mail são imutáveis (vinculados ao SSO corporativo em produção).'
            : 'Cadastre uma conta com o e-mail corporativo da pessoa. Em produção, o login real virá pelo SSO — esta tela apenas atribui o papel que ela terá dentro da plataforma.'}
        </p>

        <form onSubmit={handleSubmit} className="asset-form">
          {!isEdit && (
            <>
              <label className="form-field">
                <span className="form-label">Nome completo</span>
                <input
                  ref={firstFieldRef}
                  className="field"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome conforme aparece no SSO"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="form-field">
                <span className="form-label">E-mail corporativo</span>
                <input
                  type="email"
                  className="field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex.: davi.pinheiro@unifique.com.br"
                  autoComplete="off"
                  required
                />
              </label>
            </>
          )}

          <fieldset className="role-radio-group">
            <legend className="form-label">Papel na plataforma</legend>
            {ROLES.map((r) => (
              <label key={r} className="role-radio">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                />
                <div className="role-radio__content">
                  <span className="role-radio__title">{ROLE_LABEL[r]}</span>
                  <span className="role-radio__desc">
                    {r === 'OPERADOR_N1' &&
                      'Cadastra ativos, registra movimentações, descarta.'}
                    {r === 'LIDER_N1' &&
                      'Tudo do Operador, mais acesso aos relatórios consolidados.'}
                    {r === 'DIRETOR_TI' &&
                      'Somente leitura. Dashboards, auditoria, relatórios.'}
                  </span>
                </div>
              </label>
            ))}
          </fieldset>

          {error && <p className="form-error">{error}</p>}

          <footer className="form-footer">
            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button type="submit" className="btn accent" disabled={submitting}>
              {submitting
                ? 'Salvando…'
                : isEdit
                  ? 'Salvar alteração'
                  : 'Cadastrar usuário'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
