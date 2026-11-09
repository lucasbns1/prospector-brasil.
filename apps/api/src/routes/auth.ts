import type { FastifyInstance } from 'fastify';
import { prisma } from '@prospector/database';
import { loginSchema } from '@prospector/shared';
import {
  COOKIE_SESSAO,
  criarSessao,
  destruirSessao,
  exigirAutenticacao,
  opcoesCookie,
  verificarSenha,
} from '../plugins/auth.js';
import { AppError } from '../lib/errors.js';

export async function rotasAuth(app: FastifyInstance): Promise<void> {
  const ttlDias = Number(process.env.SESSION_TTL_DAYS ?? 30);

  app.post('/api/auth/login', async (request, reply) => {
    const { email, senha } = loginSchema.parse(request.body);

    const usuario = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Mensagem identica para usuario inexistente e senha errada — nao
    // entregamos a um atacante a informacao de quais e-mails existem.
    const generico = 'E-mail ou senha incorretos';

    if (!usuario || !usuario.ativo) {
      // Gasta o mesmo tempo de um verify real para nao vazar a
      // existencia do usuario pelo tempo de resposta.
      await verificarSenha(
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$hashfalso',
        senha
      );
      throw new AppError(generico, 401, 'CREDENCIAIS_INVALIDAS');
    }

    const senhaOk = await verificarSenha(usuario.senhaHash, senha);
    if (!senhaOk) throw new AppError(generico, 401, 'CREDENCIAIS_INVALIDAS');

    const { token, expiresAt } = await criarSessao(usuario.id, ttlDias, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    await prisma.user.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    });

    request.log.info({ userId: usuario.id }, 'Login realizado');

    return reply
      .setCookie(COOKIE_SESSAO, token, opcoesCookie(expiresAt))
      .send({
        usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome },
      });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE_SESSAO];
    if (token) await destruirSessao(token);
    return reply.clearCookie(COOKIE_SESSAO, { path: '/' }).send({ ok: true });
  });

  app.get(
    '/api/auth/me',
    { preHandler: exigirAutenticacao },
    // `loginObrigatorio` diz a tela se faz sentido mostrar o botao "Sair".
    async (request) => ({
      usuario: request.usuario,
      loginObrigatorio: app.loginObrigatorio !== false,
    })
  );
}
