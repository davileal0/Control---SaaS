# Control — Gestão de Ativos de TI (MVP)

Plataforma interna da Infraestrutura N1 para rastrear o ciclo de vida de
hardwares e periféricos corporativos, com trilha de auditoria e visões
analíticas para a diretoria.

## Estrutura

```
control/
├── backend/    API Node + Express + TypeScript + Prisma (PostgreSQL)
├── frontend/   SPA React + Vite + TypeScript (UI "Corporativo Premium")
└── docker-compose.yml   Postgres local para desenvolvimento
```

## Modelo de dados (resumo)

- **assets** — um ativo por `serial_number` (PK). `status` ∈ {Disponível, Em
  Uso, Danificado}; `is_archived` é exclusão lógica (descarte). Periféricos
  ficam na categoria macro `Periferico`, diferenciados pelo campo `model`
  (sem subcategorias).
- **movement_logs** — cada transição/atribuição gera uma linha.
  **Corrigível**: pode ser editada e anulada (`is_voided`) no caso de
  engano, mas nunca apagada fisicamente (trigger bloqueia DELETE).
- **movement_log_corrections** — trilha **append-only e imutável** (triggers
  bloqueiam UPDATE/DELETE). Cada edição/anulação registra autor, papel,
  motivo (obrigatório) e o diff campo-a-campo. É a fonte para os
  supervisores (líderes e acima).
- **discard_records** — snapshot de cada descarte (SN, modelo, categoria,
  último status, motivo, autor, data) usado pela exportação em planilha.

### Por que "corrigível + trilha imutável"?

O pedido foi permitir editar/remover lançamentos errados, mas com cada
mudança explicada e documentada aos supervisores. Apagar fisicamente o
lançamento destruiria justamente essa documentação. A solução move a
imutabilidade um nível acima: o lançamento operacional é corrigível, mas
**toda correção é registrada de forma inviolável**. "Remover" é anular
logicamente (some das visões operacionais, permanece auditável).

## Perfis (RBAC, negação por padrão)

| Ação                                   | Operador N1 | Líder N1 | Diretor TI |
|----------------------------------------|:-----------:|:--------:|:----------:|
| Cadastrar / movimentar / descartar     |     ✓       |    ✓     |            |
| Editar / anular lançamento             |     ✓       |    ✓     |            |
| Dashboard e auditoria (leitura)        |     ✓       |    ✓     |     ✓      |
| Relatórios: correções e descartados    |             |    ✓     |     ✓      |

A autorização é reimposta na API; o front apenas oculta o que o perfil não
pode fazer.

## Segurança aplicada

- Autenticação delegada ao SSO corporativo (JWT Bearer verificado; trocar
  por validação JWKS do IdP em produção). Falha fechada.
- Autoria das correções/descartes sempre derivada da identidade autenticada,
  nunca do corpo da requisição.
- Validação de entrada com Zod (allowlist de tipo/tamanho).
- Exportação `.xlsx` neutraliza injeção de fórmula (CWE-1236) nas células.
- `helmet`, CORS restrito à origem do front, rate limiting e handler de
  erros que não vaza stack trace.
- Usuário de aplicação do banco sem privilégio de DELETE (ver GRANTs na
  migração).

## Como rodar (desenvolvimento)

```bash
# 1. Banco
cp backend/.env.example backend/.env   # ajuste DATABASE_URL e AUTH_JWT_SECRET
docker compose up -d db

# 2. Back-end
cd backend
npm install
npm run prisma:generate     # requer acesso a binaries.prisma.sh
npm run prisma:migrate
npm run dev                 # http://localhost:4000

# token de teste (apenas dev):
npm run token -- diretor@empresa.com DIRETOR_TI

# 3. Front-end
cd ../frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

## Endpoints principais

| Método | Rota                              | Perfis             |
|--------|-----------------------------------|--------------------|
| POST   | `/api/assets`                     | Operador, Líder    |
| POST   | `/api/assets/:serial/movements`   | Operador, Líder    |
| PATCH  | `/api/assets/movements/:id`       | Operador, Líder    |
| POST   | `/api/assets/movements/:id/void`  | Operador, Líder    |
| POST   | `/api/assets/:serial/discard`     | Operador, Líder    |
| GET    | `/api/dashboard/metrics`          | Todos              |
| GET    | `/api/dashboard/peripherals`      | Todos              |
| GET    | `/api/audit/:serial`              | Todos              |
| GET    | `/api/reports/corrections`        | Líder, Diretor     |
| GET    | `/api/reports/discarded`          | Líder, Diretor     |
| GET    | `/api/reports/discarded.xlsx`     | Líder, Diretor     |

## Premissas assumidas

- Transição `Danificado → Disponível` (equipamento reparado retorna ao
  estoque). Se a regra rejeitar reaproveitamento pós-reparo, remova o par
  em `domain/assetStateMachine.ts`.
- `discard_records` registra **todos** os descartes, com coluna de último
  status; o filtro "apenas danificados" cobre o caso citado.
