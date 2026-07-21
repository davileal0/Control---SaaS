import { useState } from 'react';
import { Role } from '../types/domain';
import PurchaseDefenseModal from './PurchaseDefenseModal';
// Modal antigo (justificativa simples) mantido como FALLBACK adormecido.
// Não está em uso na UI — pra religar, troque PurchaseDefenseModal por
// este no JSX abaixo.
import PurchaseJustificationModal from './PurchaseJustificationModal';
import './reports.css';

// Referência morta: evita erro de "import não usado" sem apagar o
// fallback. Não tem efeito em runtime.
void PurchaseJustificationModal;

interface Props {
  role: Role;
}

// Hub de relatórios da plataforma. O card de Aquisição agora gera o
// relatório de DEFESA DE COMPRA (multi-categoria, formato diretoria).
export default function Reports({ role }: Props) {
  const [showDefense, setShowDefense] = useState(false);

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Relatórios</span>
        <h1>Relatórios</h1>
        <p>
          Documentos consolidados para apresentação à diretoria e análise
          gerencial.
        </p>
      </div>

      <div className="reports-grid">
        <article className="report-card">
          <header className="report-card__head">
            <span className="eyebrow">Aquisição</span>
            <h2>Defesa de Compra</h2>
          </header>
          <p className="report-card__desc">
            Relatório completo para a diretoria aprovar aquisições. Multi-categoria:
            reúne descartes e saldo do sistema, fila de chamados, estoque de
            segurança, último lote e a economia negociada — num documento
            consolidado.
          </p>
          <ul className="report-card__features">
            <li>Múltiplas categorias num só relatório</li>
            <li>Composição do lote: fila + estoque de segurança</li>
            <li>Resumo consolidado com condição comercial</li>
          </ul>
          <button
            type="button"
            className="btn accent report-card__btn"
            onClick={() => setShowDefense(true)}
          >
            Gerar relatório
          </button>
        </article>

        {/* Espaço pra novos relatórios no futuro */}
        <article className="report-card report-card--placeholder">
          <header className="report-card__head">
            <span className="eyebrow">Em breve</span>
            <h2>Relatório de Correções</h2>
          </header>
          <p className="report-card__desc">
            Auditoria das correções e anulações feitas no período. Útil pra
            supervisão revisar trabalho da equipe.
          </p>
        </article>
      </div>

      {showDefense && (
        <PurchaseDefenseModal role={role} onClose={() => setShowDefense(false)} />
      )}
    </>
  );
}
