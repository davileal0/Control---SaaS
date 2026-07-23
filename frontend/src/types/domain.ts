export type Role = 'OPERADOR_N1' | 'LIDER_N1' | 'DIRETOR_TI';

export type AssetStatus = 'Disponivel' | 'EmUso' | 'Danificado';

export interface Asset {
  serialNumber: string;
  model: string;
  category: string;
  status: AssetStatus;
  isArchived: boolean;
  createdAt: string;
}

export interface Correction {
  id: number;
  operation: 'EDIT' | 'VOID';
  reason: string;
  changes?: Record<string, { before: unknown; after: unknown }> | null;
  actorName: string;
  actorRole: Role;
  createdAt: string;
}

export type AssignmentReason = 'AUMENTO_QUADRO' | 'SUBSTITUICAO';

export const ASSIGNMENT_REASON_LABEL: Record<AssignmentReason, string> = {
  AUMENTO_QUADRO: 'Aumento de quadro',
  SUBSTITUICAO: 'Substituição',
};

export interface MovementLog {
  id: number;
  assetSerialNumber: string;
  originStatus: AssetStatus | null;
  destinationStatus: AssetStatus;
  ticketId?: string | null;
  endUserName?: string | null;
  managerName?: string | null;
  department?: string | null;
  invoiceNumber?: string | null;
  trackingCode?: string | null;
  notes?: string | null;
  /** Preenchido apenas em logs de atribuição (transição → EmUso) */
  assignmentReason?: AssignmentReason | null;
  isVoided: boolean;
  voidedAt?: string | null;
  timestamp: string;
  corrections?: Correction[];
}

export interface DiscardRecord {
  id: number;
  serialNumber: string;
  model: string;
  category: string;
  lastStatus: AssetStatus;
  reason: string;
  discardedByName: string;
  discardedAt: string;
}

// Item retornado pela listagem com o ÚLTIMO log não-anulado anexado,
// usado pra exibir "Onde está agora" (colaborador/setor) na tabela.
export interface AssetListItem extends Asset {
  movementLogs?: MovementLog[];
}

export const CATEGORY_LABEL: Record<string, string> = {
  Notebook: 'Notebook',
  Desktop: 'Desktop',
  Celular: 'Celular',
  AllInOne: 'All-in-One',
  Periferico: 'Periférico',
};

// Rótulos legíveis (com acento) — os enums internos não têm acento.
export const STATUS_LABEL: Record<AssetStatus, string> = {
  Disponivel: 'Disponível',
  EmUso: 'Em Uso',
  Danificado: 'Danificado',
};

export const ROLE_LABEL: Record<Role, string> = {
  OPERADOR_N1: 'Operador N1',
  LIDER_N1: 'Líder N1',
  // Rótulo VISÍVEL = "Coordenador de TI". A chave interna permanece
  // DIRETOR_TI (no enum, banco, JWT e RBAC) — só o texto exibido mudou.
  // Coordenador de TI (frontend) === DIRETOR_TI (backend).
  DIRETOR_TI: 'Coordenador de TI',
};

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

// =====================================================================
// Solicitações de Compra (SC)
// =====================================================================

export type PurchaseRequestStatus =
  | 'AGUARDANDO_ABERTURA'
  | 'ABERTA'
  | 'FECHADA'
  | 'CANCELADA';

export type PurchaseRequestTargetKind = 'CATEGORY' | 'PERIPHERAL_MODEL';

export type PurchaseRequestCloseReason =
  | 'STOCK_NORMALIZED'
  | 'MANUAL'
  | 'CANCELED';

export interface PurchaseRequest {
  id: string;
  targetKind: PurchaseRequestTargetKind;
  targetValue: string;
  quantity: number;
  equipmentModel: string | null;
  status: PurchaseRequestStatus;

  authorizedByUserId: string;
  authorizedByName: string;
  authorizedByRole: Role;
  authorizedAt: string;

  scNumber: string | null;
  openedByUserId: string | null;
  openedByName: string | null;
  openedByRole: Role | null;
  openedAt: string | null;

  closedByUserId: string | null;
  closedByName: string | null;
  closedByRole: Role | null;
  closedAt: string | null;
  closeReason: PurchaseRequestCloseReason | null;

  notes: string | null;
  createdAt: string;
}

/** Relatório do recebimento de equipamentos ao fechar uma SC com SNs. */
export interface ReceivingReport {
  created: number;
  skippedExisting: number;
  skippedExistingSerials: string[];
  duplicatesInPaste: number;
  skippedLines: number;
  expectedQuantity: number;
  quantityMismatch: boolean;
  model: string;
  category: string;
}

/** Resultado de fechar uma SC: a SC atualizada + relatório de
 *  recebimento (null quando fechamento simples / cancelamento). */
export interface ClosePurchaseRequestResult {
  request: PurchaseRequest;
  receiving: ReceivingReport | null;
}

export const PR_STATUS_LABEL: Record<PurchaseRequestStatus, string> = {
  AGUARDANDO_ABERTURA: 'Aguardando abertura',
  ABERTA: 'Em compra',
  FECHADA: 'Fechada',
  CANCELADA: 'Cancelada',
};

export const PR_CLOSE_REASON_LABEL: Record<PurchaseRequestCloseReason, string> = {
  STOCK_NORMALIZED: 'Estoque normalizou',
  MANUAL: 'Recebimento manual',
  CANCELED: 'Cancelada',
};

// =====================================================================
// Métricas operacionais (KPIs) — espelha metricsService.ts
// =====================================================================

export type CategorySaturation = {
  category: 'Notebook' | 'Celular' | 'AllInOne' | 'Periferico';
  total: number;
  inUse: number;
  percentage: number;
};

export type StuckInRepair = {
  serialNumber: string;
  model: string;
  category: string;
  daysInRepair: number;
  enteredAt: string;
};

export type ActivePurchaseRequestsSummary = {
  total: number;
  aguardando: number;
  aberta: number;
};

export type AssignmentIntentStat = {
  reason: AssignmentReason;
  detail: string;
  count: number;
};

export type AssignmentReasonsSummary = {
  aumentoQuadro: number;
  substituicao: number;
  total: number;
  /** Principais intenções (sub-categorias) do mês, mais frequentes 1º. */
  topIntents: AssignmentIntentStat[];
};

export type StockBreakdown = {
  available: {
    total: number;
    byCategory: Array<{ category: string; count: number }>;
  };
  inRepair: number;
  inUse: number;
};

export type PeripheralProjection = {
  model: string;
  currentStock: number;
  consumed30d: number;
  daysRemaining: number | null;
};

export type MovementKind =
  | 'INGESTAO'
  | 'ATRIBUICAO'
  | 'DEVOLUCAO'
  | 'ENVIO_ASSISTENCIA'
  | 'RETORNO_ASSISTENCIA'
  | 'OUTRO';

export interface ActivityFeedItem {
  id: number;
  kind: MovementKind;
  timestamp: string;
  serialNumber: string;
  model: string;
  category: string;
  endUserName: string | null;
  managerName: string | null;
  department: string | null;
  ticketId: string | null;
  invoiceNumber: string | null;
  trackingCode: string | null;
  notes: string | null;
  assignmentReason: string | null;
  assignmentReasonDetail: string | null;
  originStatus: string | null;
  destinationStatus: string;
  isVoided: boolean;
}

export type EquipmentOverview = {
  category: 'Notebook' | 'Desktop' | 'Celular' | 'AllInOne';
  available: number;
  inRepair: number;
  inUse: number;
};

export type PeripheralOverview = {
  model: string;
  available: number;
  consumed30d: number;
  daysRemaining: number | null;
};

export interface OperatorMetrics {
  availableForAssignment: number;
  inRepair: number;
  movementsToday: number;
  movementsSparkline7d: number[];
  activePurchaseRequests: ActivePurchaseRequestsSummary;
  stockBreakdown: StockBreakdown;
  peripheralProjections: PeripheralProjection[];
  equipmentsOverview: EquipmentOverview[];
  peripheralsOverview: PeripheralOverview[];
}

export interface LeaderMetrics {
  movementsLast7Days: number;
  movementsSparkline7d: number[];
  averageRepairTimeDays: number | null;
  stuckInRepair: StuckInRepair[];
  saturationByCategory: CategorySaturation[];
  activePurchaseRequests: ActivePurchaseRequestsSummary;
  assignmentReasonsThisMonth: AssignmentReasonsSummary;
  stockBreakdown: StockBreakdown;
  peripheralProjections: PeripheralProjection[];
  equipmentsOverview: EquipmentOverview[];
  peripheralsOverview: PeripheralOverview[];
}

export interface DirectorMetrics {
  movementsThisMonth: number;
  movementsSparkline7d: number[];
  saturationByCategory: CategorySaturation[];
  activePurchaseRequests: ActivePurchaseRequestsSummary;
  assignmentReasonsThisMonth: AssignmentReasonsSummary;
  stockBreakdown: StockBreakdown;
  peripheralProjections: PeripheralProjection[];
  equipmentsOverview: EquipmentOverview[];
  peripheralsOverview: PeripheralOverview[];
}

export const CATEGORY_LABEL_SHORT: Record<
  CategorySaturation['category'],
  string
> = {
  Notebook: 'Notebook',
  Celular: 'Celular',
  AllInOne: 'All-in-One',
  Periferico: 'Periférico',
};
