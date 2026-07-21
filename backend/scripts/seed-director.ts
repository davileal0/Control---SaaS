/**
 * Seed do Diretor inicial.
 *
 * Resolve o problema chicken-and-egg: só o Diretor pode gerenciar
 * usuários, mas em ambiente novo (banco vazio) não há nenhum Diretor.
 * Este script cria o primeiro, lendo nome e e-mail dos argumentos.
 *
 * Uso:
 *   npx tsx scripts/seed-director.ts "Davi Pinheiro" davi@unifique.com.br
 *
 * Se já existe um usuário com esse e-mail, o script é idempotente —
 * apenas atualiza o papel pra DIRETOR_TI e o status pra ativo.
 */

import { prisma } from '../src/db/prisma';

async function main() {
  const [fullName, email] = process.argv.slice(2);

  if (!fullName || !email) {
    console.error('Uso: npx tsx scripts/seed-director.ts "Nome Completo" email@empresa.com');
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Idempotente: se já existe, atualiza para Diretor ativo.
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    const updated = await prisma.user.update({
      where: { email: normalizedEmail },
      data: { role: 'DIRETOR_TI', isActive: true, fullName },
    });
    console.log(`[seed] Diretor existente atualizado: ${updated.email}`);
    return;
  }

  const created = await prisma.user.create({
    data: {
      fullName,
      email: normalizedEmail,
      role: 'DIRETOR_TI',
      isActive: true,
    },
  });

  console.log(`[seed] Diretor criado:`);
  console.log(`       Nome:   ${created.fullName}`);
  console.log(`       E-mail: ${created.email}`);
  console.log(`       Papel:  ${created.role}`);
}

main()
  .catch((err) => {
    console.error('[seed] Falha:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
