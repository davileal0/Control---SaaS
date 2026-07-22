import {
  Asset,
  MovementLog,
  DiscardRecord,
  AssetListItem,
  User,
  PurchaseRequest,
  ClosePurchaseRequestResult,
  PurchaseRequestStatus,
  PurchaseRequestTargetKind,
  OperatorMetrics,
  LeaderMetrics,
  DirectorMetrics,
  ActivityFeedItem,
  Role,
} from '../types/domain';

// Base da API. O token (Bearer) vem do fluxo de SSO; aqui só o anexamos.
const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

// Raiz do servidor (sem o /api) — usada pelas rotas de SSO (/auth/*),
// que ficam fora do prefixo /api protegido. Deriva do BASE removendo
// o sufixo /api, então respeita a mesma env var em produção.
export const API_BASE = BASE.replace(/\/api\/?$/, '');

let authToken: string | null = null;
export function setAuthToken(token: string) {
  authToken = token;
}

// Modo de desenvolvimento: o backend (com DEV_NO_AUTH=true) usa este
// header como identidade no lugar do JWT. App.tsx sincroniza esse valor
// com o seletor "Visualizar como". Em produção, esse header é ignorado
// pelo backend (fluxo de JWT continua valendo).
let devRole: string | null = null;
export function setDevRole(role: string | null) {
  devRole = role;
}

import { trackRequestStart, trackRequestEnd } from './loadingTracker';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Sinaliza pro TopProgressBar global. finally garante decremento
  // mesmo se fetch ou parse falharem.
  trackRequestStart();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(devRole ? { 'x-dev-role': devRole } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Erro ${res.status}`);
    }
    return res.json() as Promise<T>;
  } finally {
    trackRequestEnd();
  }
}

export interface CategoryStats {
  Disponivel: number;
  EmUso: number;
  Danificado: number;
}

export interface Metrics {
  byStatus: CategoryStats;
  // Breakdown por categoria — usado pelos cards de destaque do
  // dashboard novo. Todas as categorias sempre presentes (com zeros
  // se vazias), evita checks de optional chaining no frontend.
  byCategory: {
    Notebook: CategoryStats;
    Celular: CategoryStats;
    AllInOne: CategoryStats;
    Desktop: CategoryStats;
    Periferico: CategoryStats;
  };
  total: number;
}

export interface PeripheralItem {
  model: string;
  available: number;   // status Disponivel
  inUse: number;       // status EmUso
  damaged: number;     // status Danificado
  total: number;       // soma dos três
}

export interface PeripheralBreakdown {
  total: number;
  items: PeripheralItem[];
}
export interface AuditResult extends Asset {
  movementLogs: MovementLog[];
}

export interface AssetListFilters {
  status?: 'Disponivel' | 'EmUso' | 'Danificado';
  category?: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne' | 'Periferico';
  search?: string;
}

// Input para descarte definitivo. Justificativa é obrigatória no backend
// (mínimo 5 caracteres) — replicada na validação local.
export interface DiscardInput {
  notes: string;
}

// Input para reaproveitamento direto: chamado opcional da devolução do
// anterior + campos obrigatórios da nova atribuição (Fluxo A normal).
// Item de kit de periférico entregue junto de uma atribuição.
export interface PeripheralDelivery {
  type: string;
  quantity: number;
}

// Estoque disponível por tipo de periférico (painel de entrega).
export interface PeripheralTypeStock {
  type: string;
  available: number;
}

export interface ReassignInput {
  returnTicketId?: string;
  newTicketId: string;
  endUserName: string;
  managerName: string;
  department: string;
  /** Motivo da nova atribuição — obrigatório */
  assignmentReason: 'AUMENTO_QUADRO' | 'SUBSTITUICAO';
  /** Sub-categoria/intenção da atribuição (opcional) */
  assignmentReasonDetail?: string;
  notes?: string;
  /** Periféricos entregues junto (opcional) */
  peripherals?: PeripheralDelivery[];
}

// Sugestão de intenção para o autocomplete (detalhe + frequência).
export interface AssignmentIntentSuggestion {
  detail: string;
  count: number;
}

// Diff de campos editáveis. Cada chave é opcional — só envia o que mudou.
// Valor `null` significa "limpar o campo" (passar de preenchido pra vazio).
export interface EditableFields {
  ticketId?: string | null;
  endUserName?: string | null;
  managerName?: string | null;
  department?: string | null;
  invoiceNumber?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
}

export interface EditLogInput {
  reason: string;
  fields: EditableFields;
}

export interface VoidLogInput {
  reason: string;
}

// Gerenciamento de usuários (somente Diretor de TI)
export interface CreateUserInput {
  fullName: string;
  email: string;
  role: 'OPERADOR_N1' | 'LIDER_N1' | 'DIRETOR_TI';
}

export interface UpdateUserInput {
  role?: 'OPERADOR_N1' | 'LIDER_N1' | 'DIRETOR_TI';
  isActive?: boolean;
}

// Modo individual: Notebook/Celular/AllInOne/Desktop com SN + modelo
export interface CreateAssetIndividualInput {
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne';
  serialNumber: string;
  model: string;
}

// Modo bulk: Periférico em massa — só tipo + quantidade
export interface CreateAssetBulkInput {
  category: 'Periferico';
  peripheralType: string;
  quantity: number;
}

export type CreateAssetInput = CreateAssetIndividualInput | CreateAssetBulkInput;

// Resposta do POST /assets — formato varia conforme o modo
export interface CreateAssetIndividualResult {
  mode: 'individual';
  asset: Asset;
}

export interface CreateAssetBulkResult {
  mode: 'bulk';
  count: number;
  type: string;
}

export type CreateAssetResult =
  | CreateAssetIndividualResult
  | CreateAssetBulkResult;

/** Relatório do cadastro de equipamentos em massa (lista de SNs). */
export interface EquipmentBulkResult {
  mode: 'equipment-bulk';
  created: number;
  skippedExisting: number;
  skippedExistingSerials: string[];
  duplicatesInPaste: number;
  skippedLines: number;
  model: string;
  category: string;
}

// Input para registrar uma movimentação (transição de status). Os campos
// obrigatórios variam pela transição — a validação cabe ao backend
// (assertTransition + zod schema). O frontend só envia o que coletou.
export interface RegisterMovementInput {
  destinationStatus: 'Disponivel' | 'EmUso' | 'Danificado';
  ticketId?: string;
  endUserName?: string;
  managerName?: string;
  department?: string;
  invoiceNumber?: string;
  trackingCode?: string;
  /** Motivo da atribuição — obrigatório quando destinationStatus === 'EmUso' */
  assignmentReason?: 'AUMENTO_QUADRO' | 'SUBSTITUICAO';
  /** Sub-categoria/intenção da atribuição (opcional) */
  assignmentReasonDetail?: string;
  notes?: string;
  /** Periféricos entregues junto (só em atribuição, EmUso) */
  peripherals?: PeripheralDelivery[];
}

// ===== Painel de Atividade dos Operadores =====

export type ActivityActionType =
  | 'cadastro'
  | 'atribuicao'
  | 'devolucao'
  | 'descarte'
  | 'outro';

export interface OperatorActivitySummary {
  actorUserId: string;
  actorName: string;
  actorRole: string;
  total: number;
  byType: Record<ActivityActionType, number>;
  lastActivity: string | null;
  dailyCounts: { date: string; count: number }[];
}

export interface ActivityLogEntry {
  id: number;
  type: ActivityActionType;
  assetSerialNumber: string;
  destinationStatus: string;
  endUserName: string | null;
  notes: string | null;
  timestamp: string;
}

export interface OperatorActivityDetail {
  actorName: string;
  actorRole: string;
  entries: ActivityLogEntry[];
}

export const api = {
  metrics: () => request<Metrics>('/dashboard/metrics'),
  peripherals: () => request<PeripheralBreakdown>('/dashboard/peripherals'),
  listAssets: (filters: AssetListFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    const qs = params.toString();
    return request<AssetListItem[]>(`/assets${qs ? `?${qs}` : ''}`);
  },
  createAsset: (input: CreateAssetInput) =>
    request<CreateAssetResult>('/assets', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createEquipmentsBulk: (input: {
    category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne';
    model: string;
    serialNumbersRaw: string;
  }) =>
    request<EquipmentBulkResult>('/assets/bulk-equipment', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  registerMovement: (serial: string, input: RegisterMovementInput) =>
    request<MovementLog>(
      `/assets/${encodeURIComponent(serial)}/movements`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  discardAsset: (serial: string, input: DiscardInput) =>
    request<MovementLog>(
      `/assets/${encodeURIComponent(serial)}/discard`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  reassignAsset: (serial: string, input: ReassignInput) =>
    request<{ returnLog: MovementLog; newAssignmentLog: MovementLog }>(
      `/assets/${encodeURIComponent(serial)}/reassign`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  peripheralTypeStock: () =>
    request<PeripheralTypeStock[]>('/assets/peripherals/stock'),
  assignmentIntents: (reason?: 'AUMENTO_QUADRO' | 'SUBSTITUICAO') =>
    request<AssignmentIntentSuggestion[]>(
      `/assets/assignment-intents${reason ? `?reason=${reason}` : ''}`,
    ),
  editMovement: (logId: number, input: EditLogInput) =>
    request<MovementLog>(
      `/assets/movements/${logId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  voidMovement: (logId: number, input: VoidLogInput) =>
    request<MovementLog>(
      `/assets/movements/${logId}/void`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  listUsers: () => request<User[]>('/users'),

  // ===== Solicitações de Compra (SC) =====

  listPurchaseRequests: (filters?: {
    status?: PurchaseRequestStatus;
    targetValue?: string;
  }) => {
    const q = new URLSearchParams();
    if (filters?.status) q.set('status', filters.status);
    if (filters?.targetValue) q.set('targetValue', filters.targetValue);
    const qs = q.toString();
    return request<PurchaseRequest[]>(
      `/purchase-requests${qs ? `?${qs}` : ''}`,
    );
  },

  /** Autoriza nova SC (Líder/Diretor). */
  authorizePurchaseRequest: (input: {
    targetKind: PurchaseRequestTargetKind;
    targetValue: string;
    quantity: number;
    equipmentModel?: string;
    notes?: string;
  }) =>
    request<PurchaseRequest>('/purchase-requests', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** Registra número da SC (Heryck) — transição AGUARDANDO → ABERTA. */
  openPurchaseRequest: (id: string, input: { scNumber: string; notes?: string }) =>
    request<PurchaseRequest>(`/purchase-requests/${id}/open`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  /** Fecha (MANUAL) ou cancela (CANCELED) uma SC.
   *  serialNumbersRaw: texto colado da planilha do almoxarifado — quando
   *  presente em fechamento MANUAL de equipamento, dá entrada nos ativos. */
  closePurchaseRequest: (
    id: string,
    input: {
      reason: 'MANUAL' | 'CANCELED';
      notes?: string;
      serialNumbersRaw?: string;
    },
  ) =>
    request<ClosePurchaseRequestResult>(`/purchase-requests/${id}/close`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  // ===== Métricas (KPIs por papel) =====

  getOperatorMetrics: () => request<OperatorMetrics>('/metrics/operator'),
  getLeaderMetrics: () => request<LeaderMetrics>('/metrics/leader'),
  getDirectorMetrics: () => request<DirectorMetrics>('/metrics/director'),
  getActivityFeed: (limit = 6) =>
    request<ActivityFeedItem[]>(`/metrics/activity-feed?limit=${limit}`),
  createUser: (input: CreateUserInput) =>
    request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateUser: (id: string, input: UpdateUserInput) =>
    request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  audit: (serial: string) =>
    request<AuditResult>(`/audit/${encodeURIComponent(serial)}`),
  discarded: (onlyDamaged = false) =>
    request<DiscardRecord[]>(`/reports/discarded${onlyDamaged ? '?damaged=true' : ''}`),

  // ===== Painel de Atividade dos Operadores =====

  getTeamActivity: (periodStart: string, periodEnd: string) =>
    request<OperatorActivitySummary[]>(
      `/activity/team?periodStart=${periodStart}&periodEnd=${periodEnd}`,
    ),
  getOperatorActivity: (
    actorUserId: string,
    periodStart: string,
    periodEnd: string,
  ) =>
    request<OperatorActivityDetail>(
      `/activity/operator/${encodeURIComponent(actorUserId)}?periodStart=${periodStart}&periodEnd=${periodEnd}`,
    ),
     validateInventory: (fileBase64: string) =>
    request<InventoryValidation>('/inventory/validate', {
      method: 'POST',
      body: JSON.stringify({ fileBase64 }),
    }),
  createInventoryImport: (fileBase64: string, autentiqueLink: string) =>
    request<InventoryImport>('/inventory', {
      method: 'POST',
      body: JSON.stringify({ fileBase64, autentiqueLink }),
    }),
  listInventoryImports: (status?: string) =>
    request<InventoryImport[]>(
      `/inventory${status ? `?status=${status}` : ''}`,
    ),
  getInventoryImport: (id: number) =>
    request<InventoryImport>(`/inventory/${id}`),
  approveInventoryImport: (id: number) =>
    request<{ createdCount: number; skipped: { identifier: string; model: string }[] }>(
      `/inventory/${id}/approve`,
      { method: 'POST' },
    ),
  rejectInventoryImport: (id: number, reason: string) =>
    request<InventoryImport>(`/inventory/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

/** Baixa a planilha de descartados (.xlsx) respeitando o Bearer token. */
export async function downloadDiscardSheet(onlyDamaged = false): Promise<void> {
  const res = await fetch(
    `${BASE}/reports/discarded.xlsx${onlyDamaged ? '?damaged=true' : ''}`,
    {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(devRole ? { 'x-dev-role': devRole } : {}),
      },
    },
  );
  if (!res.ok) throw new Error('Falha ao gerar a planilha.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `equipamentos-descartados-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================================
// Relatório de Justificativa de Compra
// =====================================================================

export interface PurchaseJustificationFilters {
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne' | 'Periferico';
  periodStart: string; // ISO date (YYYY-MM-DD)
  periodEnd: string;
  quantity: number; // quantidade a solicitar (1–300), informada pelo gestor
}

/** Baixa o relatório (PDF ou XLSX) e dispara download no navegador. */
export async function downloadPurchaseJustification(
  filters: PurchaseJustificationFilters,
  format: 'pdf' | 'xlsx',
): Promise<void> {
  const params = new URLSearchParams({
    category: filters.category,
    periodStart: filters.periodStart,
    periodEnd: filters.periodEnd,
    quantity: String(filters.quantity),
  });
  const res = await fetch(
    `${BASE}/reports/purchase-justification.${format}?${params}`,
    {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(devRole ? { 'x-dev-role': devRole } : {}),
      },
    },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status} ao gerar relatório.`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `justificativa-compra-${filters.category}-${stamp}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// Relatório de Defesa de Compra (multi-categoria)
// ---------------------------------------------------------------------

export type DefenseCategory = 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne';

export interface DefenseCategoryInput {
  category: DefenseCategory;
  suggestedQuantity: number;
  queueNewHires: number;
  queueReplacement: number;
  safetyStockQuantity: number;
  safetyStockRationale?: string;
  lastBatchQuantity: number;
  discountPerUnit?: number;
  discountLotSize?: number;
  ticketNumbers?: string[];
}

export interface DefenseAccessoryInput {
  name: string;
  quantity: number;
  note?: string;
}

export interface DefenseDisposalInput {
  donationQuantity: number;
  outOfStandardQuantity: number;
}

export interface PurchaseDefenseInput {
  periodStart: string; // ISO YYYY-MM-DD
  periodEnd: string;
  categories: DefenseCategoryInput[];
  accessories?: DefenseAccessoryInput[];
  disposal?: DefenseDisposalInput;
}

/** Gera o relatório de defesa (POST) e dispara o download do PDF. */
export async function downloadPurchaseDefense(
  input: PurchaseDefenseInput,
): Promise<void> {
  const res = await fetch(`${BASE}/reports/purchase-defense.pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(devRole ? { 'x-dev-role': devRole } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status} ao gerar relatório.`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `defesa-compra-${stamp}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface InventoryParsedAsset {
  category: 'Notebook' | 'Desktop' | 'Celular' | 'Periferico';
  identifier: string | null;
  model: string;
  quantity: number;
  rowNumber: number;
}

export interface InventoryRowError {
  row: number;
  message: string;
}

export interface InventoryValidation {
  valid: boolean;
  errors: InventoryRowError[];
  assets: InventoryParsedAsset[];
  summary: {
    totalRows: number;
    totalAssets: number;
    byCategory: Record<string, number>;
  };
}

export type InventoryImportStatus = 'PENDENTE' | 'APROVADO' | 'RECUSADO';

export interface InventoryImport {
  id: number;
  status: InventoryImportStatus;
  autentiqueLink: string;
  validatedAssets: InventoryParsedAsset[];
  totalAssets: number;
  submittedByUserId: string;
  submittedByName: string;
  submittedByRole: Role;
  submittedAt: string;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  resolvedByRole: Role | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  createdCount: number | null;
  skippedItems: { identifier: string; model: string }[] | null;
}
