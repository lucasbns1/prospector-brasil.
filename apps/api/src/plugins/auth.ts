/**
 * Autenticacao local por sessao em cookie.
 *
 * DECISOES E POR QUE:
 *
 * 1. Argon2id para a senha. E o algoritmo recomendado atualmente e o
 *    unico do projeto que precisa ser lento de proposito.
 *
 * 2. O cookie guarda um token aleatorio de 32 bytes; o banco guarda
 *    apenas o SHA-256 desse token. Se alguem ler a tabela `sessions`,
 *    nao consegue montar um cookie valido.
 *
 * 3. httpOnly + sameSite=lax + path=/ . `secure` fica desligado porque o
 *    sistema roda em http://localhost — um cookie `secure` simplesmente
 *    nao seria enviado e o login nunca funcionaria.
 *
 * 4. Nada de JWT: com sessao em banco, deslogar e apagar uma linha. Com
 *    JWT seria preciso manter uma blacklist — mais complexidade, zero
 *    beneficio para um sistema local monousuario.
 */
import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@prospector/database';
import { NaoAutenticadoError } from '../lib/errors.js';

export const COOKIE_SESSAO = 'prospector_session';

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: { id: string; email: string; nome: string };
  }
  interface FastifyInstance {
    /** false = sem tela de login. Ver `registrarAuth`. */
    loginObrigatorio: boolean;
  }
}

/** So estes enderecos ficam fora do alcance de outra maquina. */
function hostSoLocal(host: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(host.trim().toLowerCase());
}

/**
 * O usuario de quando nao ha login: o primeiro ativo. O sistema e
 * monousuario — o seed cria exatamente um.
 */
async function usuarioSemLogin(): Promise<{ id: string; email: string; nome: string }> {
  const u = await prisma.user.findFirst({
    where: { ativo: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, nome: true },
  });
  if (!u) {
    throw new NaoAutenticadoError('Nenhum usuario cadastrado. Rode `pnpm db:seed`.');
  }
  return u;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function verificarSenha(hash: string, senha: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, senha);
  } catch {
    return false;
  }
}

export async function gerarHashSenha(senha: string): Promise<string> {
  return argon2.hash(senha, { type: argon2.argon2id });
}

export async function criarSessao(
  userId: string,
  ttlDias: number,
  meta: { userAgent?: string; ip?: string }
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlDias * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    },
  });

  return { token, expiresAt };
}

export async function destruirSessao(token: string): Promise<void> {
  await prisma.session
    .delete({ where: { tokenHash: hashToken(token) } })
    .catch(() => undefined); // ja apagada — nao e erro
}

/** Remove sessoes expiradas. Chamado no boot da API. */
export async function limparSessoesExpiradas(): Promise<number> {
  const r = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return r.count;
}

/**
 * Hook de autenticacao. Use com `preHandler` nas rotas protegidas.
 * NUNCA confia em nada vindo do cliente alem do cookie assinado.
 *
 * Com o login desligado, um cookie valido continua valendo; sem ele
 * (ou com ele vencido), a requisicao segue como o usuario unico. A
 * leitura e `!== false` de proposito: uma instancia que nao passou por
 * `registrarAuth` continua exigindo login.
 */
export async function exigirAutenticacao(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await autenticarPeloCookie(request, reply);
  } catch (err) {
    if (request.server.loginObrigatorio !== false || !(err instanceof NaoAutenticadoError)) {
      throw err;
    }
    request.usuario = await usuarioSemLogin();
  }
}

async function autenticarPeloCookie(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = request.cookies[COOKIE_SESSAO];
  if (!token) throw new NaoAutenticadoError();

  const sessao = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!sessao) throw new NaoAutenticadoError('Sessao invalida');

  if (sessao.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: sessao.id } }).catch(() => undefined);
    throw new NaoAutenticadoError('Sessao expirada. Entre novamente.');
  }

  if (!sessao.user.ativo) throw new NaoAutenticadoError('Usuario desativado');

  request.usuario = {
    id: sessao.user.id,
    email: sessao.user.email,
    nome: sessao.user.nome,
  };
}

export function opcoesCookie(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Desligado de proposito: o sistema roda em http://localhost.
    // Se algum dia for exposto por HTTPS, ligar aqui.
    secure: false,
    path: '/',
    expires: expiresAt,
  };
}

export async function registrarAuth(
  _app: FastifyInstance,
  opcoes: { loginObrigatorio: boolean; apiHost: string } = {
    loginObrigatorio: true,
    apiHost: '127.0.0.1',
  }
): Promise<void> {
  // Sem senha so quando a API nao e alcancavel de fora desta maquina.
  const semLogin = !opcoes.loginObrigatorio && hostSoLocal(opcoes.apiHost);
  _app.decorate('loginObrigatorio', !semLogin);

  if (semLogin) {
    _app.log.info('Login desligado (LOGIN_OBRIGATORIO=false): a tela abre direto');
  } else if (!opcoes.loginObrigatorio) {
    _app.log.warn(
      { apiHost: opcoes.apiHost },
      'LOGIN_OBRIGATORIO=false ignorado: a API escuta fora desta maquina, entao o login continua'
    );
  }

  const removidas = await limparSessoesExpiradas();
  if (removidas > 0) {
    _app.log.info({ removidas }, 'Sessoes expiradas removidas');
  }
}
