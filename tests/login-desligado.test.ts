/**
 * LOGIN_OBRIGATORIO=false: a ferramenta abre direto, sem tela de login.
 *
 * O resto da suite roda com o login LIGADO (vitest.config.ts) e continua
 * provando o 401 sem cookie. Aqui fica o outro lado, e a trava que
 * impede o pior caso: API aberta para a rede E sem senha.
 *
 * Requer Postgres com `pnpm db:migrate && pnpm db:seed` (o usuario unico).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import type { FastifyInstance } from 'fastify';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(raiz, '.env') });
process.env.LOG_LEVEL = 'silent';

type CriarApp = typeof import('../apps/api/src/app.js').criarApp;
let criarApp: CriarApp;
let prisma: typeof import('@prospector/database').prisma;
const abertas: FastifyInstance[] = [];

async function subir(env: Parameters<CriarApp>[0]): Promise<FastifyInstance> {
  const { app } = await criarApp(env);
  await app.ready();
  abertas.push(app);
  return app;
}

beforeAll(async () => {
  ({ prisma } = await import('@prospector/database'));
  ({ criarApp } = await import('../apps/api/src/app.js'));
}, 60_000);

afterAll(async () => {
  for (const app of abertas) await app.close();
  await prisma?.$disconnect();
});

describe('login desligado', () => {
  it('entra sem cookie, como o usuario unico, e avisa a tela que nao ha login', async () => {
    const app = await subir({ LOGIN_OBRIGATORIO: false, API_HOST: '127.0.0.1' });
    const esperado = await prisma.user.findFirst({
      where: { ativo: true },
      orderBy: { createdAt: 'asc' },
    });

    const me = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      usuario: { id: esperado!.id, email: esperado!.email },
      loginObrigatorio: false,
    });

    for (const url of ['/api/leads', '/api/dashboard', '/api/notifications']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(200);
    }
  });

  it('um cookie vencido ou inventado nao derruba ninguem', async () => {
    const app = await subir({ LOGIN_OBRIGATORIO: false, API_HOST: 'localhost' });
    const r = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { cookie: 'prospector_session=token-que-nao-existe' },
    });
    expect(r.statusCode).toBe(200);
  });

  it('API escutando fora desta maquina: o login volta, mesmo pedindo false', async () => {
    const app = await subir({ LOGIN_OBRIGATORIO: false, API_HOST: '0.0.0.0' });
    const r = await app.inject({ method: 'GET', url: '/api/leads' });
    expect(r.statusCode).toBe(401);
  });

  it('LOGIN_OBRIGATORIO=true continua exigindo, e a tela mostra "Sair"', async () => {
    const app = await subir({ LOGIN_OBRIGATORIO: true, API_HOST: '127.0.0.1' });
    expect((await app.inject({ method: 'GET', url: '/api/leads' })).statusCode).toBe(401);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: process.env.SEED_USER_EMAIL ?? 'admin@local',
        senha: process.env.SEED_USER_PASSWORD ?? 'prospector123',
      },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers['set-cookie']!.toString().split(';')[0]!;

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json()).toMatchObject({ loginObrigatorio: true });
  });
});

describe('LOGIN_OBRIGATORIO no .env', () => {
  it('ausente = desligado; so "true" liga', async () => {
    const { carregarEnv } = await import('@prospector/config');
    const base = {
      DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
      SESSION_SECRET: 'x'.repeat(32),
    } as NodeJS.ProcessEnv;
    expect(carregarEnv(base).LOGIN_OBRIGATORIO).toBe(false);
    expect(carregarEnv({ ...base, LOGIN_OBRIGATORIO: 'true' }).LOGIN_OBRIGATORIO).toBe(true);
    expect(carregarEnv({ ...base, LOGIN_OBRIGATORIO: 'false' }).LOGIN_OBRIGATORIO).toBe(false);
  });
});
