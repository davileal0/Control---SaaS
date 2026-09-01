import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '../src/db/prisma';
import { parseUniitCsv, UniitAssetRecord } from '../src/services/uniitTransform';

// =====================================================================
// Carga em massa do inventário do Uniit (KACE) → ativos da Control
// =====================================================================
// Uso:
//   npx tsx scripts/importUniit.ts <caminho-do-csv> [--dry-run] [--limit=N]
//
//   --dry-run   Só analisa e imprime o resumo. NÃO toca no banco.
//   --limit=N   Processa apenas as N primeiras linhas (teste).
//
// Regras de mapeamento (ver src/services/uniitTransform.ts):
//   • Escopo    : só linhas com Serial Number.
//   • Chave     : Serial Number; serial duplicado/placeholder cai pro Hostname.
//   • Categoria : Desktop.
//   • Modelo    : "Desconhecido" + processador.
//   • Observação: host, responsável, SO, último logon.
//
// Idempotente: usa upsert por serialNumber (a chave). Rodar de novo:
//   • cria os ativos novos;
//   • nos que já existem, ATUALIZA só a observação (refresca contexto/
//     último logon) e NÃO sobrescreve modelo, categoria, status, unidade
//     nem arquivamento — protege ajustes manuais e o histórico.
//
// "Desativado" no Uniit NÃO arquiva o ativo (isArchived permanece false).

interface Args {
  file: string;
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  let dryRun = false;
  let limit: number | null = null;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--limit=')) limit = Number(a.slice('--limit='.length));
    else positionals.push(a);
  }
  return { file: positionals[0] ?? '', dryRun, limit };
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Uso: npx tsx scripts/importUniit.ts <csv> [--dry-run] [--limit=N]');
    process.exit(1);
  }

  const buffer = readFileSync(args.file);
  const { records, skipped, stats } = parseUniitCsv(buffer);
  const toProcess: UniitAssetRecord[] =
    args.limit != null ? records.slice(0, args.limit) : records;

  console.log('==============================================');
  console.log(' Carga Uniit → Control');
  console.log('==============================================');
  console.log(`Arquivo:                 ${args.file}`);
  console.log(`Linhas de dados:         ${fmt(stats.totalRows)}`);
  console.log(`Com serial (no escopo):  ${fmt(stats.withSerial)}`);
  console.log(`Sem serial (puladas):    ${fmt(stats.withoutSerial)}`);
  console.log(`Chaveadas por hostname:  ${fmt(stats.keyedByHostname)} (serial dup/placeholder)`);
  console.log(`Irrecuperáveis (skip):   ${fmt(stats.duplicateHostnameSkipped)}`);
  console.log(`Registros a processar:   ${fmt(toProcess.length)}`);
  console.log('----------------------------------------------');
  console.log('Amostra (3 primeiros):');
  for (const r of toProcess.slice(0, 3)) {
    console.log(`  [${r.keySource}] ${r.key}`);
    console.log(`     model: ${r.model}`);
    console.log(`     obs  : ${r.observacao}`);
  }
  console.log('----------------------------------------------');

  if (args.dryRun) {
    console.log('DRY-RUN: nada foi gravado no banco.');
    if (skipped.length) {
      console.log(`(${fmt(skipped.length)} linhas puladas — primeiras 5:)`);
      for (const s of skipped.slice(0, 5)) {
        console.log(`  linha ${s.row} [${s.hostname || '—'}]: ${s.reason}`);
      }
    }
    await prisma.$disconnect();
    return;
  }

  // Persistência: upsert em lotes pra não abrir 3 mil conexões de uma vez.
  const CHUNK = 100;
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += CHUNK) {
    const chunk = toProcess.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map(async (r) => {
        const existing = await prisma.asset.findUnique({
          where: { serialNumber: r.key },
          select: { serialNumber: true },
        });
        if (existing) {
          // Já existe: refresca só a observação (não sobrescreve o resto).
          await prisma.asset.update({
            where: { serialNumber: r.key },
            data: { observacao: r.observacao },
          });
          return 'updated' as const;
        }
        await prisma.asset.create({
          data: {
            serialNumber: r.key,
            model: r.model,
            category: r.category,
            status: 'Disponivel',
            isArchived: false,
            observacao: r.observacao,
          },
        });
        return 'created' as const;
      }),
    );
    for (const res of results) {
      if (res.status === 'fulfilled') {
        if (res.value === 'created') created++;
        else updated++;
      } else {
        failed++;
        if (failed <= 10) console.error('  falha:', res.reason?.message ?? res.reason);
      }
    }
    process.stdout.write(
      `\rProcessados ${fmt(Math.min(i + CHUNK, toProcess.length))}/${fmt(toProcess.length)}…`,
    );
  }

  console.log('\n----------------------------------------------');
  console.log(`Criados:     ${fmt(created)}`);
  console.log(`Atualizados: ${fmt(updated)}`);
  console.log(`Falhas:      ${fmt(failed)}`);
  console.log('Concluído.');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
