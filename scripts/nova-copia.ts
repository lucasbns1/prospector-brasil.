/**
 * Cria uma copia TOTALMENTE separada da ferramenta, numa pasta propria.
 *
 * ============================================================
 * POR QUE NAO BASTA TROCAR VARIAVEL DE AMBIENTE
 * ============================================================
 * A primeira tentativa foi rodar as duas copias da MESMA pasta, com
 * cinco variaveis definidas no terminal. Funciona — e falha de um jeito
 * silencioso e caro:
 *
 *   - no CMD, `$env:VAR="x"` nao existe: as cinco linhas falham e o
 *     `pnpm dev` sobe com tudo no padrao, as duas copias no mesmo banco
 *     e na mesma fila;
 *   - fechou a janela, perdeu as variaveis. Na pressa, sobe sem elas;
 *   - nada na tela denuncia: a copia parece nova e esta usando a outra.
 *
 * Cada um desses enganos custou horas. Uma pasta propria, com `.env`
 * proprio, acaba com a classe inteira: nao ha nada para lembrar, e
 * abrir a pasta errada e um erro visivel.
 *
 * ============================================================
 * O QUE FICA SEPARADO
 * ============================================================
 * Pasta, `.env`, node_modules, banco de dados, banco do Redis, portas,
 * pasta de sessao do WhatsApp e historico de mensagens.
 *
 * O que continua compartilhado e so o SERVIDOR do Postgres e o do
 * Redis — duas copias usam bancos diferentes dentro deles, que e o
 * mesmo isolamento de ter dois servidores, sem instalar nada a mais.
 *
 * ============================================================
 * DOIS JEITOS DE CHEGAR NA MESMA COPIA
 * ============================================================
 * 1. Da pasta ORIGINAL: `pnpm nova-copia brasil` clona o codigo para
 *    `..\prospector-brasil` e configura la.
 *
 * 2. De uma pasta que JA E a copia — por exemplo, clonada de um
 *    repositorio proprio no GitHub, com codigo que ja divergiu do
 *    original: `pnpm nova-copia brasil --nesta-pasta` configura a pasta
 *    atual, sem clonar nada. O `.env` vem da pasta original
 *    (`..\prospector` por padrao, ou `--de <pasta>`), porque e la que
 *    estao a senha do banco, a chave do Gemini e os limites.
 *
 * Os dois caminhos escrevem o MESMO `.env`, com os mesmos valores da
 * tabela COPIAS: nao existe uma segunda receita para divergir.
 *
 * Uso:
 *   pnpm nova-copia brasil
 *   pnpm nova-copia brasil --nesta-pasta [--de ..\prospector]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Portas e banco do Redis por copia — nunca repetidos. */
const COPIAS: Record<string, { redisDb: number; api: number; web: number }> = {
  brasil: { redisDb: 1, api: 3334, web: 5174 },
  copia2: { redisDb: 2, api: 3335, web: 5175 },
  copia3: { redisDb: 3, api: 3336, web: 5176 },
};

/** Onde a pasta original costuma morar, vista de dentro de uma copia. */
const ORIGINAL_PADRAO = '../prospector';

function erro(mensagem: string): never {
  console.error(`\n  ${mensagem}\n`);
  process.exit(1);
}

function rodar(comando: string, args: string[], cwd: string, env = process.env): void {
  const r = spawnSync(comando, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) erro(`Falhou: ${comando} ${args.join(' ')}`);
}

/**
 * Reescreve as chaves no `.env` da copia, preservando o resto.
 *
 * O resto importa: senha do banco, chave do Gemini, limites. Gerar um
 * `.env` do zero faria a copia nova nascer sem metade da configuracao.
 */
function escreverEnv(origem: string, destino: string, valores: Record<string, string>): void {
  const linhas = readFileSync(origem, 'utf8').split(/\r?\n/);
  const pendentes = new Set(Object.keys(valores));

  const saida = linhas.map((linha) => {
    const chave = /^([A-Z0-9_]+)=/.exec(linha)?.[1];
    if (chave && chave in valores) {
      pendentes.delete(chave);
      return `${chave}=${valores[chave]}`;
    }
    return linha;
  });

  // As que nao existiam no original entram no fim, com um porque.
  if (pendentes.size > 0) {
    saida.push('');
    saida.push('# --- Separacao desta copia (criado por `pnpm nova-copia`) ---');
    for (const chave of pendentes) saida.push(`${chave}=${valores[chave]}`);
  }

  writeFileSync(destino, saida.join('\n'), 'utf8');
}

/**
 * Le os argumentos sem depender da ordem: `brasil --nesta-pasta` e
 * `--nesta-pasta brasil` sao a mesma coisa. `--de` aceita tanto
 * `--de ..\prospector` quanto `--de=..\prospector`.
 */
function lerArgumentos(argv: string[]): { nome: string; nestaPasta: boolean; de?: string } {
  let nome = '';
  let nestaPasta = false;
  let de: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--nesta-pasta') nestaPasta = true;
    else if (arg === '--de') de = argv[++i];
    else if (arg.startsWith('--de=')) de = arg.slice('--de='.length);
    else if (!arg.startsWith('--') && !nome) nome = arg.trim().toLowerCase();
  }

  return { nome, nestaPasta, de };
}

/** `chave=valor` do `.env`, sem espacos em volta. */
function valorNoEnv(conteudo: string, chave: string): string | undefined {
  return new RegExp(`^${chave}=(.*)$`, 'm').exec(conteudo)?.[1]?.trim();
}

function main(): void {
  const { nome, nestaPasta, de } = lerArgumentos(process.argv.slice(2));
  const copia = COPIAS[nome];
  if (!copia) {
    erro(
      `Uso: pnpm nova-copia <${Object.keys(COPIAS).join('|')}> [--nesta-pasta [--de <pasta-original>]]\n` +
        `  Ex: pnpm nova-copia brasil                  (da pasta original: cria ..\\prospector-brasil)\n` +
        `      pnpm nova-copia brasil --nesta-pasta    (de dentro da copia: configura esta pasta)`
    );
  }

  // --- De onde vem o .env, e para onde vai a copia ---
  const pastaOriginal = nestaPasta ? path.resolve(raiz, de ?? ORIGINAL_PADRAO) : raiz;
  const destino = nestaPasta ? raiz : path.resolve(raiz, '..', `prospector-${nome}`);
  const envOrigem = path.join(pastaOriginal, '.env');
  const envDestino = path.join(destino, '.env');

  if (nestaPasta && pastaOriginal === raiz) {
    erro('--de aponta para esta mesma pasta. Ele precisa apontar para a pasta ORIGINAL.');
  }

  if (!existsSync(envOrigem)) {
    erro(
      nestaPasta
        ? `Nao achei o .env da pasta original:\n    ${envOrigem}\n\n` +
            `  E dele que a copia herda senha do banco e demais ajustes.\n` +
            `  Se a original mora em outro lugar, diga onde:\n` +
            `    pnpm nova-copia ${nome} --nesta-pasta --de C:\\caminho\\da\\original`
        : 'Nao achei o .env desta pasta — e dele que a copia herda senha do banco e demais ajustes.\n' +
            '  Se esta pasta JA E a copia (clonada do GitHub, por exemplo), rode:\n' +
            `    pnpm nova-copia ${nome} --nesta-pasta`
    );
  }

  // Nesta pasta, um .env que ja existe so pode ser o desta mesma copia
  // (uma rodada anterior que parou no meio, com o Postgres desligado).
  // Qualquer outro — um .env copiado da original, na mao — e exatamente
  // o engano que este comando existe para evitar: as duas copias no
  // mesmo banco e na mesma fila. Nao sobrescrevo; explico.
  let manterEnvAtual = false;
  if (nestaPasta && existsSync(envDestino)) {
    const atual = readFileSync(envDestino, 'utf8');
    const ehDestaCopia =
      valorNoEnv(atual, 'API_PORT') === String(copia.api) &&
      valorNoEnv(atual, 'REDIS_DB') === String(copia.redisDb);
    if (!ehDestaCopia) {
      erro(
        `Esta pasta ja tem um .env, e ele NAO e o da copia ${nome}:\n    ${envDestino}\n\n` +
          `  Se ele foi copiado da original, as duas copias usariam o mesmo\n` +
          `  banco, a mesma fila e a mesma porta. Apague (ou renomeie) esse\n` +
          `  .env e rode o comando de novo.`
      );
    }
    manterEnvAtual = true;
  }

  if (!nestaPasta && existsSync(destino)) {
    erro(
      `A pasta ja existe:\n    ${destino}\n\n` +
        `  Se quer recriar, apague-a antes. Se ela ja e a sua copia, nao\n` +
        `  precisa criar de novo: abra a pasta e rode \`pnpm dev\`.`
    );
  }

  const urlOriginal = valorNoEnv(readFileSync(envOrigem, 'utf8'), 'DATABASE_URL');
  if (!urlOriginal) erro(`Nao achei DATABASE_URL em ${envOrigem}.`);

  const u = new URL(urlOriginal);
  const bancoOriginal = u.pathname.replace(/^\//, '') || 'prospector';
  // Apontar --de para uma pasta que ja e copia daria `prospector_brasil_brasil`:
  // um terceiro banco, vazio, que ninguem pediu.
  if (bancoOriginal.endsWith(`_${nome}`)) {
    erro(
      `O .env de ${pastaOriginal} ja e de uma copia (banco ${bancoOriginal}).\n` +
        `  Aponte --de para a pasta ORIGINAL.`
    );
  }
  u.pathname = `/${bancoOriginal}_${nome}`;
  const urlCopia = u.toString();
  const bancoCopia = `${bancoOriginal}_${nome}`;

  console.log('');
  console.log('='.repeat(64));
  console.log(`  COPIA SEPARADA: ${nome}`);
  console.log('='.repeat(64));
  console.log(`  pasta ............ ${destino}`);
  if (nestaPasta) console.log(`  .env herdado de . ${envOrigem}`);
  console.log(`  banco ............ ${bancoCopia}`);
  console.log(`  redis ............ banco ${copia.redisDb}`);
  console.log(`  api .............. http://127.0.0.1:${copia.api}`);
  console.log(`  tela ............. http://localhost:${copia.web}`);
  console.log('');

  // --- 1. O codigo, numa pasta propria ---
  // `git clone` em vez de copiar: traz so o que esta versionado, sem
  // node_modules, sem .env e sem a pasta de sessao do WhatsApp — que
  // sao exatamente as coisas que NAO podem ser compartilhadas.
  // Com --nesta-pasta o codigo ja esta aqui: nao ha o que clonar.
  if (!nestaPasta) {
    console.log('  Copiando o código...');
    rodar('git', ['clone', '--local', '--quiet', raiz, destino], raiz);
  }

  // --- 2. O .env da copia ---
  if (manterEnvAtual) {
    console.log('  O .env desta pasta ja e o da cópia — mantendo como está.');
  } else {
    console.log('  Escrevendo o .env da cópia...');
    escreverEnv(envOrigem, envDestino, {
      DATABASE_URL: urlCopia,
      REDIS_DB: String(copia.redisDb),
      API_PORT: String(copia.api),
      WEB_PORT: String(copia.web),
      // So CORS: a tela fala com a API pelo proxy do Vite. Mas deixar a
      // origem da OUTRA copia aqui seria a unica linha do .env mentindo.
      WEB_ORIGIN: `http://localhost:${copia.web}`,
      WHATSAPP_SESSION_PATH: './data/whatsapp',
    });
  }

  // --- 3. Dependencias ---
  // Com --nesta-pasta elas ja estao instaladas: e o `tsx` delas que
  // esta rodando este script.
  if (!nestaPasta) {
    console.log('  Instalando as dependências (demora um pouco)...');
    rodar('pnpm', ['install'], destino);
  }
  rodar('pnpm', ['db:generate'], destino);

  // --- 4. O banco ---
  const manutencao = new URL(urlCopia);
  manutencao.pathname = '/postgres';

  console.log('  Criando o banco...');
  const criacao = spawnSync(
    'npx',
    ['prisma', 'db', 'execute', '--url', manutencao.toString(), '--stdin'],
    {
      cwd: path.join(destino, 'packages', 'database'),
      input: `CREATE DATABASE ${bancoCopia};`,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  );
  const saida = `${criacao.stdout ?? ''}${criacao.stderr ?? ''}`;
  if (criacao.status !== 0 && !/already exists|ja existe/i.test(saida)) {
    console.error(saida.trim());
    erro('Nao consegui criar o banco. O Postgres esta rodando?');
  }
  if (/already exists|ja existe/i.test(saida)) console.log('  Ja existia — usando o que esta la.');

  console.log('  Aplicando as migrações...');
  rodar('pnpm', ['db:migrate:deploy'], destino);
  console.log('  Criando o usuário de acesso...');
  rodar('pnpm', ['db:seed'], destino);

  console.log('');
  console.log('='.repeat(64));
  console.log('  PRONTO. A partir de agora, para subir esta cópia:');
  console.log('');
  console.log(`      cd /d ${destino}`);
  console.log('      pnpm dev');
  console.log('');
  console.log(`  Ela abre em http://localhost:${copia.web}, com banco, fila,`);
  console.log('  sessão de WhatsApp e leads próprios. Nada é compartilhado');
  console.log('  com a pasta original — nem variável de ambiente.');
  console.log('='.repeat(64));
  console.log('');
}

main();
