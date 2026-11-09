/**
 * Leitura e validacao das variaveis de ambiente.
 *
 * O processo NAO SOBE com configuracao invalida. Falhar no boot com uma
 * mensagem clara e muito melhor do que descobrir no meio de uma campanha
 * que o SESSION_SECRET estava vazio.
 */
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL e obrigatoria. Copie o .env.example para .env.'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  /**
   * Qual banco do Redis (0-15). Isola uma copia da ferramenta da outra:
   * filas, estado do canal, QR e trava de sessao, tudo de uma vez.
   */
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_PASSWORD: z.string().optional(),

  API_PORT: z.coerce.number().int().default(3333),
  API_HOST: z.string().default('127.0.0.1'),

  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET precisa ter no minimo 32 caracteres. ' +
        'Gere com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    ),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(30),

  /**
   * Pedir e-mail e senha para abrir a ferramenta.
   *
   * Desligado por padrao NESTA copia, a pedido do dono: o sistema e
   * monousuario e a API so escuta na propria maquina. Desligado, quem
   * chega sem cookie entra como o (unico) usuario cadastrado.
   *
   * A API religa sozinha se API_HOST nao for local: abrir a porta para
   * a rede E tirar a senha ao mesmo tempo nunca e o que se quer.
   */
  LOGIN_OBRIGATORIO: z
    .string()
    .default('false')
    .transform((v) => v.trim().toLowerCase() === 'true'),

  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  /**
   * Qual canal usar para CONECTAR.
   *
   * - `simulado`: nao abre navegador, nao conecta em lugar nenhum. E o
   *   padrao e o que roda em teste e em CI.
   * - `whatsapp-web`: conecta de verdade no WhatsApp Web, pede QR e
   *   RECEBE mensagens reais.
   *
   * Conectar e enviar sao coisas separadas: mesmo com
   * `whatsapp-web`, o envio continua bloqueado pela guarda de fase
   * (ver packages/integrations/src/whatsapp/guarda-envio.ts).
   */
  /**
   * `baileys` fala o protocolo direto, sem navegador.
   *
   * Existe porque o `whatsapp-web` parou de conseguir LER o historico:
   * a injecao dele na pagina do WhatsApp Web quebrou com uma versao
   * nova, e `getChats`/`getChatById` passaram a falhar com um erro
   * opaco, enquanto os eventos continuavam chegando. Nao havia
   * atualizacao para instalar — a biblioteca ja estava na ultima.
   *
   * O `whatsapp-web` continua sendo o padrao; trocar aqui e voltar sao
   * uma linha do .env, e as duas implementacoes convivem.
   */
  WHATSAPP_CANAL: z
    .enum(['simulado', 'whatsapp-web', 'baileys'])
    .default('simulado'),

  WHATSAPP_SESSION_PATH: z.string().default('./data/whatsapp'),
  CHROME_PATH: z.string().optional(),

  /**
   * Qual build do WhatsApp Web carregar.
   *
   * ============================================================
   * POR QUE ISTO PRECISOU EXISTIR
   * ============================================================
   * O `whatsapp-web.js` injeta codigo que depende da estrutura interna
   * da pagina do WhatsApp Web. Quando o WhatsApp publica uma versao
   * nova, essa estrutura muda e a injecao para de encontrar o que
   * procura.
   *
   * O sintoma nao e obvio: os EVENTOS continuam funcionando (mensagem
   * recebida chega normalmente), mas toda CONSULTA ao store falha com um
   * erro opaco de dentro do Chromium — literalmente `message: "r"`,
   * porque o codigo da pagina esta minificado.
   *
   * Foi exatamente o que aconteceu em uso real: `getChats()` falhou seis
   * vezes seguidas ao longo de dois minutos, `getChatById()` falhou nas
   * 84 conversas, e a varredura de mensagens perdidas nao recuperou
   * nada. A biblioteca ja estava na ultima versao publicada (1.34.7);
   * nao havia atualizacao para instalar.
   *
   * Vazio = comportamento padrao da biblioteca (pega a versao que o
   * WhatsApp servir). Preenchido = carrega ESTA versao, de um arquivo
   * publicado, em que a injecao sabidamente funciona.
   *
   * Formato: "2.3000.1027344200" — o numero da versao, sem mais nada.
   */
  WHATSAPP_WEB_VERSION: z.string().optional(),

  /**
   * De onde baixar o build fixado por `WHATSAPP_WEB_VERSION`.
   *
   * O `{version}` no meio da URL e substituido pela versao. O padrao
   * aponta para o acervo do projeto wa-version, que mantem os builds
   * antigos justamente para este caso.
   *
   * So e usado quando `WHATSAPP_WEB_VERSION` esta preenchida.
   */
  WHATSAPP_WEB_VERSION_URL: z
    .string()
    .default(
      'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html'
    ),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
    .default('info'),

  // ---------------------------------------------------------------------------
  // RECONCILIACAO COM O WHATSAPP
  // ---------------------------------------------------------------------------
  //
  // O evento `message` do WhatsApp so existe AO VIVO. Worker fora do ar
  // no instante da resposta = mensagem que o sistema nunca soube que
  // existiu. A varredura le as conversas e recupera o que se perdeu.
  //
  // Ate agora ela rodava UMA vez, ao conectar. Estas duas variaveis
  // existem porque essa escolha se mostrou errada em uso real: quem
  // descobre na segunda que o worker caiu na sexta perdia tudo.

  /**
   * De quanto em quanto tempo a varredura roda.
   *
   * 5 minutos e barato: a varredura descarta as conversas paradas pelo
   * `timestamp` do chat antes de buscar mensagem nenhuma, entao numa
   * base parada ela custa quase nada.
   *
   * Zero DESLIGA a varredura periodica — a que roda ao conectar
   * continua. Util para quem esta depurando e nao quer o ruido.
   */
  WHATSAPP_RECONCILIATION_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(1440)
    .default(5),

  /**
   * Ate quando olhar para tras quando nao ha marca melhor.
   *
   * Era 24h fixo, e virava um TETO: quem descobria na segunda que o
   * worker caiu na sexta perdia as respostas em definitivo. 72h cobre um
   * fim de semana inteiro.
   *
   * Nao adianta subir muito: mensagens de antes de o sistema existir nao
   * sao resposta a campanha nenhuma, e a marca do reset de fabrica vence
   * este valor de qualquer forma.
   */
  WHATSAPP_RECONCILIATION_WINDOW_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(720)
    .default(72),

  /**
   * A janela da PRIMEIRA varredura — a que roda com o banco ainda sem
   * nenhuma mensagem recebida.
   *
   * Existe por um caso real: o historico inteiro do WhatsApp chegou
   * (milhares de mensagens, meses para tras) e a varredura devolveu
   * zero, porque olhava so as ultimas 72h e as mensagens procuradas
   * eram de cinco e seis dias antes.
   *
   * Vale UMA vez. Assim que existir uma mensagem recebida no banco a
   * janela normal volta a mandar — e a marca do reset de fabrica vence
   * este valor, como vence o outro.
   */
  WHATSAPP_RECONCILIATION_FIRST_RUN_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(720)
    .default(240),

  // ---------------------------------------------------------------------------
  // GEMINI (Fase 9)
  // ---------------------------------------------------------------------------
  //
  // A CHAVE SO E LIDA NO PROCESSO DO WORKER. A API nao precisa dela, o
  // frontend nunca a ve, e ela nao e gravada no banco nem em log.
  //
  // Todos os padroes sao os seguros: com o .env de antes da Fase 9, a IA
  // fica desligada e o sistema se comporta exatamente como antes.

  /** Vazio = IA desligada, sem erro. Rodar sem ela e um modo suportado. */
  GEMINI_API_KEY: z.string().optional(),

  /**
   * Liga a consulta ao modelo. Desligado por padrao: ninguem deve passar
   * a gastar chamadas de API por ter feito um `git pull`.
   */
  GEMINI_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v.trim().toLowerCase() === 'true'),

  /**
   * MODO SOMBRA. `true` = a IA analisa e recomenda, mas quem comanda a
   * cadencia continua sendo o motor deterministico.
   *
   * O padrao e `false`: ligar o Gemini significa dar o comando a ele.
   * Quem quiser observar antes de liberar poe `true` explicitamente e
   * acompanha a tabela `ai_decisions` — o modo sombra continua inteiro,
   * so deixou de ser o padrao.
   *
   * Isto so tem efeito com GEMINI_ENABLED=true. Sem chave, o valor daqui
   * e irrelevante e o motor deterministico conduz tudo.
   */
  AI_ANALYSIS_ONLY: z
    .string()
    .default('false')
    .transform((v) => v.trim().toLowerCase() === 'true'),

  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),

  /** Passou disto, o motor deterministico assume. */
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(20_000),

});

// GEMINI_MAX_STEPS FOI REMOVIDA, e vale dizer por que.
//
// Ela prometia "teto de decisoes encadeadas numa execucao — trava contra
// laco infinito", e era lida por exatamente nenhum arquivo. Mudar o
// valor no .env nao fazia nada.
//
// Nao ha o que ligar: o orquestrador faz UMA chamada ao modelo por
// gatilho, sem encadeamento. As cadeias que existem sao entre gatilhos
// (SEND_STEP -> envio -> ETAPA_CONCLUIDA -> orquestrador), e elas
// terminam sozinhas pela guarda — `ETAPA_JA_ENVIADA` barra o repetido e
// `SEQUENCIA_TERMINOU` barra o fim da fila.
//
// Configuracao morta e pior do que configuracao ausente: ela faz alguem
// mexer num valor achando que esta protegido por ele.

export type Env = z.infer<typeof envSchema>;

export function carregarEnv(fonte: NodeJS.ProcessEnv = process.env): Env {
  const resultado = envSchema.safeParse(fonte);

  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `\n[CONFIGURACAO INVALIDA]\n\n${problemas}\n\n` +
        'Verifique o arquivo .env na raiz do projeto.\n' +
        'Se ele nao existe: copie o .env.example.\n'
    );
  }

  return resultado.data;
}

/**
 * A IA esta de fato operante?
 *
 * Ligada E com chave. Ligar sem chave nao e erro de configuracao — e um
 * meio-caminho comum (alguem liga a flag antes de conseguir a chave), e
 * derrubar o worker por isso seria pior do que seguir sem IA.
 */
export const iaAtiva = (env: Env): boolean =>
  env.GEMINI_ENABLED && Boolean(env.GEMINI_API_KEY?.trim());
