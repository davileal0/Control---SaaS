import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { TransitionError } from '../domain/assetStateMachine';
import { isProd } from '../config/env';

/**
 * Handler de erros centralizado. Mapeia erros de domínio/validação para
 * respostas claras e NUNCA expõe stack trace, caminhos internos ou
 * detalhes do banco ao cliente.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Dados inválidos.',
      issues: err.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
  }

  if (err instanceof TransitionError) {
    return res.status(409).json({ error: err.message });
  }

  // Erros lançados pelos serviços com .statusCode anexado (ex: 404, 409
  // do assetService/movementService) — devolve a mensagem original.
  const status = (err as { statusCode?: unknown })?.statusCode;
  if (typeof status === 'number' && err instanceof Error) {
    return res.status(status).json({ error: err.message });
  }

  // Erro inesperado: loga internamente (sem dados sensíveis do cliente),
  // responde genérico.
  // eslint-disable-next-line no-console
  console.error('[control] erro não tratado:', isProd ? '(oculto)' : err);
  return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
}
