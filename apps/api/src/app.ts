import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { carregarEnv, type Env } from '@prospector/config';
import { criarLogger } from './lib/logger.js';
import { registrarErrorHandler } from './lib/errors.js';
import { registrarAuth } from './plugins/auth.js';
import { rotasHealth } from './routes/health.js';
import { rotasAuth } from './routes/auth.js';
import { rotasEvents } from './routes/events.js';
import { rotasDashboard } from './routes/dashboard.js';
import { rotasSemanas } from './routes/semanas.js';
import { rotasSincronizacao } from './routes/sincronizacao.js';
import { rotasSettings } from './routes/settings.js';
import { rotasWhatsApp } from './routes/whatsapp.js';
import { rotasLeads } from './routes/leads.js';
import { rotasImports } from './routes/imports.js';
import { rotasNotifications } from './routes/notifications.js';
import { rotasCampaigns } from './routes/campaigns.js';
import { rotasTasks } from './routes/tasks.js';
import { rotasLeadAcoes } from './routes/lead-acoes.js';
import { rotasCanal } from './routes/canal.js';
import { rotasConversas } from './routes/conversas.js';
import { rotasIa } from './routes/ia.js';

export async function criarApp(envParcial?: Partial<Env>): Promise<{
  app: FastifyInstance;
  env: Env;
}> {
  const env = { ...carregarEnv(), ...envParcial } as Env;
  const desenvolvimento = env.NODE_ENV === 'development';

  const app = Fastify({
    // O cast e necessario: passar uma instancia concreta do Pino faz o
    // Fastify estreitar o tipo do logger em toda a FastifyInstance, e os
    // plugins (que esperam FastifyBaseLogger) deixam de encaixar.
    loggerInstance: criarLogger(env.LOG_LEVEL, desenvolvimento) as FastifyBaseLogger,
    // O sistema roda atras de nada — mas manter o valor explicito evita
    // que request.ip devolva o IP errado se um dia houver proxy.
    trustProxy: false,
    bodyLimit: 10 * 1024 * 1024,
  });

  // CORS restrito a origem do Vite. `credentials` e obrigatorio para o
  // cookie de sessao viajar entre :5173 e :3333.
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    parseOptions: { path: '/' },
  });

  // Usado a partir da Fase 3, no upload dos arquivos de importacao.
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  registrarErrorHandler(app);
  await registrarAuth(app, {
    loginObrigatorio: env.LOGIN_OBRIGATORIO,
    apiHost: env.API_HOST,
  });

  await app.register(rotasHealth);
  await app.register(rotasAuth);
  await app.register(rotasEvents);
  await app.register(rotasDashboard);
  await app.register(rotasSemanas);
  await app.register(rotasSincronizacao);
  await app.register(rotasSettings);
  await app.register(rotasWhatsApp);
  await app.register(rotasLeads);
  await app.register(rotasImports);
  await app.register(rotasNotifications);
  await app.register(rotasCampaigns);
  await app.register(rotasTasks);
  await app.register(rotasLeadAcoes);
  await app.register(rotasCanal);
  await app.register(rotasConversas);
  await app.register(rotasIa);

  return { app, env };
}
