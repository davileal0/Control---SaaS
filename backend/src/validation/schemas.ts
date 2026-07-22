import { z } from 'zod';

// Validação de entrada (allowlist de tipo/tamanho/formato).
// Os identificadores de enum batem com o Prisma/domínio.

export const categorySchema = z.enum([
  'Notebook',
  'Desktop',
  'Celular',
  'AllInOne',
  'Periferico',
]);

export const statusSchema = z.enum(['Disponivel', 'EmUso', 'Danificado']);

const serial = z
  .string()
  .trim()
  .min(1, 'Número de série obrigatório.')
  .max(120);

// =====================================================================
// Cadastro de ativos — comporta 2 modos
// =====================================================================
// (1) INDIVIDUAL (Notebook/Celular/AllInOne/Desktop):
//     serialNumber + model + category obrigatórios.
//
// (2) BULK (Periférico):
//     peripheralType + quantity + category=Periferico.
//     SN sintético gerado pelo backend (operador não digita).
//
// Periféricos são commodities — operador cadastra 50 mouses de uma vez
// em vez de "Mouse Logitech B100" 50× (info que ninguém usa). Pro
// sistema, cada periférico continua sendo um Asset com SN único, mas
// o SN é interno (`MOUSE-A3F8D2`) e nunca exposto na UI normal.
export const createAssetSchema = z
  .object({
    category: categorySchema,
    // Modo INDIVIDUAL (categoria != Periférico)
    serialNumber: serial.optional(),
    model: z.string().trim().min(1).max(160).optional(),
    // Modo BULK (categoria = Periférico)
    peripheralType: z.string().trim().min(1).max(80).optional(),
    quantity: z
      .number()
      .int('Use número inteiro.')
      .positive('Quantidade precisa ser maior que zero.')
      .max(500, 'Quantidade excede o limite (500 por cadastro).')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.category === 'Periferico') {
      // BULK mode — exige peripheralType + quantity
      if (!data.peripheralType) {
        ctx.addIssue({
          code: 'custom',
          path: ['peripheralType'],
          message: 'Tipo do periférico obrigatório (ex.: Mouse, Teclado, Headset).',
        });
      }
      if (data.quantity === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'Quantidade obrigatória.',
        });
      }
    } else {
      // INDIVIDUAL mode — exige serialNumber + model
      if (!data.serialNumber) {
        ctx.addIssue({
          code: 'custom',
          path: ['serialNumber'],
          message: 'Número de série obrigatório.',
        });
      }
      if (!data.model) {
        ctx.addIssue({
          code: 'custom',
          path: ['model'],
          message: 'Modelo obrigatório.',
        });
      }
    }
  });

// Kit de periféricos entregue junto de uma atribuição. Cada item é um
// tipo (== Asset.model de um periférico) + quantidade. Consolidado e
// debitado do estoque na mesma transação da movimentação.
export const peripheralDeliveryItemSchema = z.object({
  type: z.string().trim().min(1, 'Tipo do periférico obrigatório.').max(120),
  quantity: z.number().int().positive().max(999),
});

export const transitionSchema = z
  .object({
    destinationStatus: statusSchema,
    ticketId: z.string().trim().max(60).optional(),
    endUserName: z.string().trim().max(160).optional(),
    managerName: z.string().trim().max(160).optional(),
    department: z.string().trim().max(120).optional(),
    invoiceNumber: z.string().trim().max(60).optional(),
    trackingCode: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(2000).optional(),
    // Motivo da atribuição: obrigatório QUANDO destinationStatus = EmUso.
    // Validado via refine abaixo. Pra outras transições é ignorado.
    assignmentReason: z.enum(['AUMENTO_QUADRO', 'SUBSTITUICAO']).optional(),
    // Sub-categoria/intenção da atribuição (opcional). Ex: "Upgrade IFS".
    assignmentReasonDetail: z.string().trim().max(120).optional(),
    // Periféricos entregues junto (opcional). Só faz sentido em EmUso.
    peripherals: z.array(peripheralDeliveryItemSchema).max(50).optional(),
  })
  .refine(
    (data) =>
      data.destinationStatus !== 'EmUso' || data.assignmentReason !== undefined,
    {
      message: 'Motivo da atribuição obrigatório (Aumento de quadro ou Substituição).',
      path: ['assignmentReason'],
    },
  );

export const discardSchema = z.object({
  // Justificativa é obrigatória no descarte (regra da especificação).
  notes: z.string().trim().min(5, 'Justificativa de descarte obrigatória.').max(2000),
});

// Campos editáveis de um lançamento (metadados do chamado/movimentação).
// origin/destination status NÃO são editáveis — alterar o trajeto do
// ciclo de vida seria uma nova movimentação, não uma correção.
export const editMovementSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Explique o motivo da edição (obrigatório).')
    .max(1000),
  fields: z
    .object({
      ticketId: z.string().trim().max(60).nullable().optional(),
      endUserName: z.string().trim().max(160).nullable().optional(),
      managerName: z.string().trim().max(160).nullable().optional(),
      department: z.string().trim().max(120).nullable().optional(),
      invoiceNumber: z.string().trim().max(60).nullable().optional(),
      trackingCode: z.string().trim().max(60).nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
    })
    .refine((f) => Object.keys(f).length > 0, {
      message: 'Informe ao menos um campo para editar.',
    }),
});

export const voidMovementSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Explique o motivo da remoção (obrigatório).')
    .max(1000),
});

export const logIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const serialParamSchema = z.object({
  serial: serial,
});

// Reaproveitamento direto: campos da nova atribuição (Fluxo A normal)
// + chamado opcional da devolução do anterior.
export const reassignSchema = z.object({
  returnTicketId: z.string().trim().max(60).optional(),
  newTicketId: z
    .string()
    .trim()
    .min(1, 'Chamado da nova atribuição obrigatório.')
    .max(60),
  endUserName: z
    .string()
    .trim()
    .min(1, 'Nome do colaborador obrigatório.')
    .max(160),
  managerName: z
    .string()
    .trim()
    .min(1, 'Nome do líder obrigatório.')
    .max(160),
  department: z
    .string()
    .trim()
    .min(1, 'Setor obrigatório.')
    .max(120),
  // Motivo da nova atribuição (a devolução do anterior não tem motivo).
  assignmentReason: z.enum(['AUMENTO_QUADRO', 'SUBSTITUICAO'], {
    message: 'Motivo da atribuição obrigatório (Aumento de quadro ou Substituição).',
  }),
  // Sub-categoria/intenção da nova atribuição (opcional).
  assignmentReasonDetail: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  // Periféricos entregues junto do reaproveitamento (opcional).
  peripherals: z.array(peripheralDeliveryItemSchema).max(50).optional(),
});

// Filtros aceitos na listagem de ativos. Todos opcionais.
// search faz match em SN, modelo e nome de colaborador (logs não-anulados).
export const listFiltersSchema = z.object({
  status: statusSchema.optional(),
  category: categorySchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;

/** Cadastro de equipamentos em massa via lista de SNs colada.
 *  Categoria e modelo são únicos pro lote; SNs vêm no texto bruto. */
export const createEquipmentsBulkSchema = z.object({
  category: z.enum(['Notebook', 'Desktop', 'Celular', 'AllInOne']),
  model: z.string().trim().min(1, 'Modelo obrigatório.').max(120),
  serialNumbersRaw: z
    .string()
    .min(1, 'Cole a lista de SNs.')
    .max(600000),
});
export type CreateEquipmentsBulkInput = z.infer<
  typeof createEquipmentsBulkSchema
>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type DiscardInput = z.infer<typeof discardSchema>;
export type EditMovementInput = z.infer<typeof editMovementSchema>;
export type VoidMovementInput = z.infer<typeof voidMovementSchema>;
export type ListFiltersInput = z.infer<typeof listFiltersSchema>;
export type ReassignInput = z.infer<typeof reassignSchema>;

// ---------------------------------------------------------------------
// Gerenciamento de usuários (RBAC: somente Diretor de TI)
// ---------------------------------------------------------------------

export const roleSchema = z.enum(['OPERADOR_N1', 'LIDER_N1', 'DIRETOR_TI']);

export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido.')
    .max(180),
  fullName: z
    .string()
    .trim()
    .min(2, 'Nome muito curto.')
    .max(160),
  role: roleSchema,
});

// Na edição, ambos os campos são opcionais — mas pelo menos UM precisa
// vir. A checagem do "pelo menos um" é feita no service pra dar uma
// mensagem mais clara que o erro padrão do zod.
export const updateUserSchema = z.object({
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid('ID de usuário inválido.'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ---------------------------------------------------------------------
// Relatório de Justificativa de Compra
// ---------------------------------------------------------------------

export const reportCategorySchema = z.enum([
  'Notebook',
  'Desktop',
  'Celular',
  'AllInOne',
  'Periferico',
]);

// Filtros do relatório vêm como query params (string), por isso o
// schema usa `coerce.date()` pra converter ISO strings em Date.
export const purchaseJustificationFiltersSchema = z
  .object({
    category: reportCategorySchema,
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    // Quantidade a solicitar — informada pelo Líder/Coordenador, que
    // julga quantos equipamentos repor (decisão deles, não cálculo
    // automático). coerce.number porque vem como query string.
    // Limite 1–300: repor poucos não compensa (equipamento demora
    // 30–40 dias pra chegar); 300 é teto defensivo.
    quantity: z.coerce
      .number({ message: 'Quantidade obrigatória.' })
      .int('Use número inteiro.')
      .min(1, 'Quantidade mínima é 1.')
      .max(300, 'Quantidade máxima é 300.'),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: 'periodStart deve ser anterior ou igual a periodEnd.',
    path: ['periodStart'],
  });

export type PurchaseJustificationFilters = z.infer<
  typeof purchaseJustificationFiltersSchema
>;

// =====================================================================
// Relatório de Defesa de Compra (multi-categoria) — para a Diretoria
// =====================================================================
// Sucede o relatório de justificativa simples. Multi-categoria: o
// usuário escolhe quais categorias incluir, e pra cada uma informa os
// dados que só ele/o Acelerato/o KACE sabem (fila, segurança, último
// lote). O Control gera do banco o que já tem (descartes, saldo).
//
// Vem por POST (body JSON), então usa tipos nativos (não coerce).

// Categoria de equipamento (sem Periférico — defesa de compra é de
// equipamento rastreável; acessórios entram em lista separada).
const defenseCategorySchema = z.enum([
  'Notebook',
  'Desktop',
  'Celular',
  'AllInOne',
]);

// Bloco por categoria — tudo que o usuário informa pra UMA categoria.
const defenseCategoryInputSchema = z.object({
  category: defenseCategorySchema,
  // Sugestão de compra: quantidade total a solicitar (1–2000; teto
  // alto porque defesa de compra cobre lotes grandes, ex: 200 notebooks)
  suggestedQuantity: z
    .number({ message: 'Informe a quantidade sugerida.' })
    .int()
    .min(1, 'Mínimo 1.')
    .max(2000, 'Máximo 2000 por categoria.'),
  // Fila do Acelerato (manual — o Control não conhece chamados externos)
  queueNewHires: z.number().int().min(0).max(2000), // novos colaboradores
  queueReplacement: z.number().int().min(0).max(2000), // substituição
  // Estoque de segurança (= reserva estratégica): qtd + raciocínio
  safetyStockQuantity: z.number().int().min(0).max(2000),
  safetyStockRationale: z.string().trim().max(300).optional(),
  // Último lote adquirido (contexto via KACE — só uma quantidade)
  lastBatchQuantity: z.number().int().min(0).max(5000),
  // Economia negociada DESTA categoria (cada categoria pode ter sua
  // própria negociação — ex: lote de 200 notebooks tem desconto, mas
  // os all-in-one não). Opcional; economia = desconto × lote.
  discountPerUnit: z.number().min(0).max(100000).optional(),
  discountLotSize: z.number().int().min(0).max(10000).optional(),
  // Lista de chamados do Acelerato (só usada no All in One por ora). É
  // uma COMPROVAÇÃO pro diretor — os números nominais dos chamados que
  // pediram All in One. Independente da fila (não altera as quantidades).
  // Vem como array de strings (números de chamado), já parseado no front.
  ticketNumbers: z.array(z.string().trim().min(1).max(40)).max(500).optional(),
});

// Acessório avulso (manual — não é ativo rastreado no Control)
const accessoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.').max(120),
  quantity: z.number().int().min(1).max(5000),
  note: z.string().trim().max(200).optional(),
});

// Seção agregada "Descarte e Doação — Parque Antigo" (todas as categorias
// somadas). DESCARTE vem do banco (real); DOAÇÃO e o KPI fixo "Fora do
// Padrão" são informados manualmente (o sistema não rastreia doação).
const disposalSectionSchema = z.object({
  // Quantidade destinada à doação no período (manual)
  donationQuantity: z.number().int().min(0).max(10000),
  // KPI fixo "Fora do Padrão" — critério de obsolescência (CPU abaixo
  // da 8ª geração). Informado manualmente (nem sempre escrito assim no
  // motivo do descarte).
  outOfStandardQuantity: z.number().int().min(0).max(10000),
});

export const purchaseDefenseReportSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    // Pelo menos uma categoria selecionada
    categories: z
      .array(defenseCategoryInputSchema)
      .min(1, 'Selecione ao menos uma categoria.')
      .max(4),
    // Acessórios opcionais (lista manual)
    accessories: z.array(accessoryInputSchema).max(20).optional(),
    // Seção de descarte/doação (opcional — se omitida, a seção não sai)
    disposal: disposalSectionSchema.optional(),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: 'Data inicial deve ser anterior ou igual à final.',
    path: ['periodStart'],
  });

export type PurchaseDefenseReportInput = z.infer<
  typeof purchaseDefenseReportSchema
>;
export type DefenseCategoryInput = z.infer<typeof defenseCategoryInputSchema>;
export type AccessoryInput = z.infer<typeof accessoryInputSchema>;

// =====================================================================
// Solicitações de Compra (SC) — validation schemas
// =====================================================================

/** Autorizar SC: Líder/Diretor decide comprar mais de um alvo. */
export const authorizePurchaseRequestSchema = z
  .object({
    targetKind: z.enum(['CATEGORY', 'PERIPHERAL_MODEL']),
    targetValue: z.string().trim().min(1).max(80),
    // Quantidade obrigatória > 0. Limite superior defensivo (10000) —
    // se alguém precisar de mais, é porque tem algo errado no input
    // ou é uma compra excepcional que merece atenção extra.
    quantity: z
      .number({ message: 'Quantidade obrigatória.' })
      .int('Use número inteiro.')
      .positive('Quantidade precisa ser maior que zero.')
      .max(10000, 'Quantidade excede o limite razoável (10.000).'),
    // Modelo específico do equipamento (ex: "Dell Latitude 3420").
    // Obrigatório pra S.C. de EQUIPAMENTO (CATEGORY); ignorado pra
    // periférico (targetValue já é o modelo). Validado no superRefine.
    equipmentModel: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.targetKind === 'CATEGORY' && !data.equipmentModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Informe o modelo do equipamento (ex: "Dell Latitude 3420").',
        path: ['equipmentModel'],
      });
    }
  });

/** Abrir SC: Heryck registra o número emitido no sistema da Unifique. */
export const openPurchaseRequestSchema = z.object({
  scNumber: z
    .string()
    .trim()
    .min(1, 'Número da SC obrigatório.')
    .max(40),
  notes: z.string().trim().max(500).optional(),
});

/** Fechar/cancelar SC.
 *  - MANUAL com SNs (equipamento): recebe o texto colado da planilha do
 *    almoxarifado. O service parseia, cria os ativos e fecha numa
 *    transação. serialNumbersRaw é o conteúdo bruto (tab/linha).
 *  - MANUAL sem SNs: fechamento simples (periférico, ou equipamento
 *    sem dar entrada agora).
 *  - CANCELED: cancelamento, nunca cria ativos. */
export const closePurchaseRequestSchema = z.object({
  reason: z.enum(['MANUAL', 'CANCELED']),
  notes: z.string().trim().max(500).optional(),
  // Texto bruto colado da planilha (SNs). Opcional — só no recebimento
  // de equipamento. Limite generoso (até ~10k SNs de ~50 chars).
  serialNumbersRaw: z.string().max(600000).optional(),
});

/** Filtros do GET /purchase-requests. */
export const purchaseRequestFiltersSchema = z.object({
  status: z
    .enum(['AGUARDANDO_ABERTURA', 'ABERTA', 'FECHADA', 'CANCELADA'])
    .optional(),
  targetValue: z.string().trim().max(80).optional(),
});

export const purchaseRequestIdParamSchema = z.object({
  id: z.string().uuid({ message: 'ID inválido.' }),
});

export type AuthorizePurchaseRequestInput = z.infer<
  typeof authorizePurchaseRequestSchema
>;
export type OpenPurchaseRequestInput = z.infer<
  typeof openPurchaseRequestSchema
>;
export type ClosePurchaseRequestInput = z.infer<
  typeof closePurchaseRequestSchema
>;
export type PurchaseRequestFilters = z.infer<
  typeof purchaseRequestFiltersSchema
>;

// Painel de Atividade dos Operadores — filtro de período. Ambas as
// datas são obrigatórias; o frontend manda o intervalo selecionado.
export const activityPeriodSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: 'periodStart deve ser anterior ou igual a periodEnd.',
    path: ['periodStart'],
  });

export type ActivityPeriod = z.infer<typeof activityPeriodSchema>;

// Importação de inventário (Fase 1): a planilha vem como base64 no corpo.
export const inventoryValidateSchema = z.object({
  fileBase64: z.string().min(1, 'Arquivo é obrigatório.'),
});

export type InventoryValidateInput = z.infer<typeof inventoryValidateSchema>;

// Criar pedido de importação: planilha (base64) + link do Autentique.
export const createImportSchema = z.object({
  fileBase64: z.string().min(1, 'Arquivo é obrigatório.'),
  autentiqueLink: z.string().url('Informe um link válido do Autentique.'),
});

// Recusar pedido de importação: motivo obrigatório.
export const rejectImportSchema = z.object({
  reason: z.string().trim().min(1, 'Informe o motivo da recusa.').max(500),
});

export type CreateImportInput = z.infer<typeof createImportSchema>;
export type RejectImportInput = z.infer<typeof rejectImportSchema>;

