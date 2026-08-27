import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// =====================================================================
// Seed de usuários (Forma A do SSO)
// =====================================================================
// O SSO/OIDC autentica pelo Azure, mas o PAPEL vem daqui. Cada pessoa
// que pode entrar no Control precisa de um registro com email + role.
// O email TEM que ser o mesmo usado pra logar no Azure corporativo.
//
// upsert = idempotente: rodar de novo não duplica, só garante que existe.
// Ajuste os emails/nomes conforme a realidade da equipe.

const users = [
  {
    email: 'davi.pinheiro@redeunifique.com.br',
    fullName: 'Davi Pinheiro',
    role: 'OPERADOR_N1' as const,
  },
  // Supervisores e demais colegas — ajuste conforme necessário.
  // (emails são exemplos; corrija pros reais quando forem entrar)
  {
    email: 'jean.sousa@redeunifique.com.br',
    fullName: 'Jean Favacho de Sousa',
    role: 'LIDER_N1' as const,
  },
  {
    email: 'tiago.busnardo@redeunifique.com.br',
    fullName: 'Tiago Busnardo',
    role: 'DIRETOR_TI' as const,
  },
  {
    email: 'heryck.raul@redeunifique.com.br',
    fullName: 'Heryck',
    role: 'OPERADOR_N1' as const,
  },
  {
    email: 'maira.kienen@redeunifique.com.br',
    fullName: 'Maira Kienen',
    role: 'OPERADOR_N1' as const
  },
  {
    email: 'ricardo.veiga@unifique.com.br',
    fullName: 'Ricardo Veiga',
    role: 'OPERADOR_N1' as const
  },
    {
    email: 'arthur.beyer@redeunifique.com.br',
    fullName: 'Arthur Bayer',
    role: 'OPERADOR_N1' as const
  }
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, role: u.role, isActive: true },
      create: { ...u, isActive: true },
    });
    console.log(`  ✓ ${u.email} (${u.role})`);
  }
  console.log(`Seed concluído: ${users.length} usuário(s).`);
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
