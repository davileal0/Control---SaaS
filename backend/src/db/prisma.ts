import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env';

// Cliente Prisma único (evita esgotar o pool em hot-reload de dev).
export const prisma = new PrismaClient({
  log: isProd ? ['warn', 'error'] : ['query', 'warn', 'error'],
});
