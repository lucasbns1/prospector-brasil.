# ONDE ESTAMOS — leia isto antes de mexer

Documento de passagem de bastão. Escrito para quem chega agora: outra
conversa, outro dia, ou você mesmo daqui a um mês.

---

## O que é isto

Prospector: prospecção + CRM + WhatsApp, rodando local no Windows 11.
pnpm workspaces, PostgreSQL, Redis (Memurai), Prisma, BullMQ, Baileys
(`@whiskeysockets/baileys@7.0.0-rc14`), Gemini. 1710 testes passando.

Branch de trabalho: `claude/fase-4-campanhas`.

---

## ESTE repositório: `prospector-brasil`

Repositório separado, criado a partir de `agente-prospec-o-1.0`
(branch `claude/fase-4-campanhas`, histórico inteiro). Roda **ao mesmo
tempo** que a original, na mesma máquina. Diferenças em relação à
original — e só estas:

| | Original | Brasil (esta) |
|---|---|---|
| Cor da marca | azul-marinho `#1f2b4d` | azul `#1d4ed8` |
| API | 3333 | 3334 |
| Tela | 5173 | 5174 |
| Redis | banco 0 | banco 1 |
| Postgres | `prospector` | `prospector_brasil` |
| Sessão do WhatsApp | pasta da original | `apps/worker/data/whatsapp` desta pasta |

A paleta mora só em `apps/web/src/index.css` (tokens). As portas, o
banco e a sessão vêm do `.env`, criado por:

```
pnpm install
pnpm nova-copia brasil --nesta-pasta
```

que é o mesmo `pnpm nova-copia` de sempre, configurando a pasta atual
em vez de clonar outra. Ele herda senha do banco, chave do Gemini e
limites do `.env` de `..\prospector` (ou `--de <pasta>`), e recusa um
`.env` copiado na mão da original.

**O defeito do WhatsApp descrito abaixo vem junto.** Copiar não
resolve nada dele.

---

## O problema que NÃO está resolvido

**O WhatsApp não fica conectado.** É o único bloqueio real hoje; o
resto da ferramenta funciona.

Histórico do sintoma, na ordem em que apareceu:

1. Canal parava em `Falhou`, com `Falha na autenticação: Connection
   Failure`, `Tentativas de reconexão: 5`, e **nenhum QR**.
2. O log mostrava, sempre:

   ```
   Credencial invalida removida   arquivos: 899
   "node":{"username":"55119...","msg":"logging in..."}
   ```

   Ou seja: apagava a credencial e, em seguida, entrava logando com a
   mesma conta, em vez de pedir QR.
3. Com duas cópias rodando, conectar uma derrubava a outra.

### O que já foi corrigido (e por quê)

Cada item tem commit e teste. Nenhum deles foi confirmado na máquina do
usuário — só em teste automatizado e inspeção.

| Commit | Defeito |
|---|---|
| `5bd1383` | O socket antigo regravava `creds.json` depois de apagado (`creds.update` atrasado). Trava de gravação. |
| `45fa1be` | O botão "abrir nova sessão" apagava a credencial com o socket ainda vivo. A ordem agora vive no adapter. |
| `5c94b4c` | Duas reconexões disputavam o mesmo segundo; a que reusava a credencial morta ganhava. |
| `397929a` | Sessão nova passa a nascer em memória (`initAuthCreds`), sem depender de o arquivo ter sido apagado. **Esta é a mais provável de ter resolvido o 401.** |
| `1530633` | Código **440** (`connectionReplaced`) era tratado como queda comum: reconectava, derrubava a outra sessão, e virava pingue-pongue infinito. |
| `441f83f` | Trava no Redis: dois `pnpm dev` na mesma cópia. |
| `5b4beec` | Trava em arquivo (`dono.lock`): duas cópias na mesma pasta de sessão. |

### O que investigar a seguir

A informação que **falta** é o log do worker nos 30 segundos depois de
uma tentativa de conexão. Especificamente:

- Depois de `Credencial invalida removida`, vem `QR Code recebido` ou
  `logging in...`? Se vier `logging in...`, a credencial ainda está
  ressuscitando de algum lugar.
- Qual o `codigo` em `Sessao invalidada`? **401** = sessão encerrada.
  **403** = conta restrita pelo WhatsApp (nenhuma mudança de código
  resolve). **440** = mesmo número em duas sessões.

A tela mostra o código: `Falha na autenticação: Connection Failure
(código XXX)`.

### Hipóteses ainda abertas

1. **Conta restrita (403).** O usuário disparou 100+ mensagens frias
   para quem nunca respondeu, nos dois números. É o gatilho clássico.
   Se for isso, não há conserto no código.
2. **Mesmo número nas duas cópias.** Dá 440. A tela agora explica.
3. **Limite de 4 aparelhos conectados** por conta, estourado por dias
   de tentativa. Limpar em: WhatsApp → Aparelhos conectados.

### O que já foi descartado

- Baileys desatualizado: `7.0.0-rc14` é a última publicada.
- Cópias compartilhando banco, fila ou pasta: verificado, estão
  isoladas (cada tela mostrou estado diferente da outra).

---

## Como rodar

```
cd C:\Users\Usuário\Documents\prospector
pnpm dev
```

Abre em http://localhost:5173. **Deixe a janela aberta** — quem conecta
no WhatsApp é o worker, não a tela.

### Segunda cópia (Brasil e Portugal separados)

```
pnpm nova-copia brasil
```

Cria `..\prospector-brasil` com `.env`, `node_modules`, banco, fila,
portas e sessão **próprios**. Depois é só:

```
cd C:\Users\Usuário\Documents\prospector-brasil
pnpm dev
```

Abre em http://localhost:5174. Nada é compartilhado entre as duas além
dos servidores de Postgres e Redis — e dentro deles, bancos separados.

**Cada cópia precisa de um número de WhatsApp diferente.** O mesmo
número nas duas dá 440 e elas se derrubam.

---

## Regras que valem para quem mexer aqui

Vieram do dono do projeto e continuam valendo:

- A chave do Gemini existe **só** no worker. Nunca no frontend, nunca
  no banco, nunca em log, nunca em resposta de API.
- Nunca permitir que a IA autorize envio depois de um **opt-out**.
- A IA **não** decide: quando o BullMQ executa, quando a mensagem sai,
  se o ACK ocorreu, qual é o próximo job, se um job duplica.
- Não fazer refactor grande sem necessidade.
- Testes **nunca** enviam mensagem real.
- Antes de qualquer migration, confirmar que ela é necessária.
- Mexeu em envio real, sessão do WhatsApp, autenticação, opt-out ou
  intervenção manual: **pare e explique antes**.
- Nunca inventar nome de pessoa. Nada de scraping do Google Maps.

### Barreiras de envio (três, em série)

1. `FASE_PERMITE_ENVIO_REAL` em `guarda-envio.ts` — hoje `true`.
2. `Campaign.dryRun` — a caixa "simulação" na tela da campanha.
3. `OutboundMessage.dryRun` — congelado no enfileiramento.

---

## Mapa rápido

```
apps/api        rotas Fastify. NÃO abre conexão com o WhatsApp.
apps/worker     filas, despachante, e a sessão do WhatsApp.
apps/web        React + Vite.
packages/domain regras puras: template, agendamento, normalização.
packages/integrations  Baileys, importação, Gemini.
scripts/        diagnósticos (todos só-leitura sem --aplicar).
```

Diagnósticos úteis:

```
pnpm diagnostico-fila          por que a fila parou, por etapa e motivo
pnpm diagnostico-campanha      estado de uma campanha
pnpm diagnostico-desconhecidos respostas que não acharam lead
pnpm auditoria                 conferência geral
```

---

## Coisas quebradas que ficaram de fora, de propósito

- `pnpm lint` nunca rodou: não existe `eslint.config.js` (ESLint 9
  exige). Reportado, não consertado.
- Áudio recebido nunca vira texto.
- "Responderam" no dashboard inclui resposta automática de WhatsApp
  Business.
