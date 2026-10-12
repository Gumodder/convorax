import "dotenv/config";
import express from "express";
import cors from "cors";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Configuracao (tudo via ambiente — nada de segredo no codigo)
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3001;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// Origens liberadas no CORS, separadas por virgula. Vazio = libera tudo (so para dev local).
const ORIGENS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// Validade do token do LiveKit. Curta o bastante para limitar o estrago de um vazamento,
// longa o bastante para uma call inteira.
// process.env sempre devolve string, e o SDK so converte para "<n>s" quando o ttl
// e typeof number — uma string "21600" ia crua para o jose e estourava
// "Invalid time period format", derrubando 100% das entradas em call com 503.
const TTL_BRUTO = (process.env.TOKEN_TTL || "6h").trim();
const TOKEN_TTL = /^\d+$/.test(TTL_BRUTO) ? Number(TTL_BRUTO) : TTL_BRUTO;
// Endereco de escuta. Loopback por padrao: quem fala com o backend e o nginx, da
// propria maquina. Sem isso o Node escuta em 0.0.0.0 e a porta 3001 fica exposta
// na internet ate o firewall ser configurado — e, pior, com "trust proxy" ligado
// qualquer um poderia forjar X-Forwarded-For e furar o rate limit.
const HOST = process.env.HOST || "127.0.0.1";

// Falha no boot, nao no primeiro request: um backend sem chave emitiria tokens invalidos
// silenciosamente e o usuario so descobriria ao tentar entrar na call.
const FALTANDO = Object.entries({
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
}).filter(([, v]) => !v).map(([k]) => k);
if (FALTANDO.length) {
  console.error(`[boot] faltam variaveis de ambiente: ${FALTANDO.join(", ")}`);
  console.error("[boot] copie backend/.env.example para backend/.env e preencha.");
  process.exit(1);
}

// Emite um token descartavel so para provar que o TTL e aceito: melhor estourar
// aqui, visivel no systemctl status, do que no primeiro usuario que tentar falar.
try {
  const teste = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: "boot", ttl: TOKEN_TTL });
  teste.addGrant({ roomJoin: true, room: "boot" });
  await teste.toJwt();
} catch (e) {
  console.error(`[boot] TOKEN_TTL invalido (${TTL_BRUTO}): ${e.message}`);
  console.error('[boot] use "6h", "30m" ou um numero de segundos.');
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1); // atras do nginx: req.ip passa a ser o IP real do cliente
app.use(express.json({ limit: "32kb" }));
app.use(
  cors({
    origin: ORIGENS.length ? ORIGENS : true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  })
);

// ---------------------------------------------------------------------------
// Rate limit simples em memoria (janela deslizante por IP).
// Sem dependencia nova: o volume deste backend cabe folgado em um Map.
// ---------------------------------------------------------------------------
function criarLimite({ janelaMs, max }) {
  const historico = new Map(); // ip -> number[] (timestamps)
  // limpeza periodica para o Map nao crescer sem limite com IPs que nunca voltam
  const limpeza = setInterval(() => {
    const corte = Date.now() - janelaMs;
    for (const [ip, marcas] of historico) {
      const vivos = marcas.filter((t) => t > corte);
      if (vivos.length) historico.set(ip, vivos);
      else historico.delete(ip);
    }
  }, janelaMs);
  limpeza.unref?.(); // nao segura o processo vivo no shutdown

  return function limite(req, res, next) {
    const ip = req.ip || "desconhecido";
    const agora = Date.now();
    const marcas = (historico.get(ip) || []).filter((t) => t > agora - janelaMs);
    if (marcas.length >= max) {
      res.set("Retry-After", String(Math.ceil(janelaMs / 1000)));
      return res.status(429).json({ erro: "Muitas requisicoes. Espere um pouco." });
    }
    marcas.push(agora);
    historico.set(ip, marcas);
    next();
  };
}

// ---------------------------------------------------------------------------
// Autenticacao: valida o JWT do Supabase que o frontend manda em Authorization.
// ---------------------------------------------------------------------------
// Cliente "anonimo" usado so para validar tokens.
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Cliente que fala com o banco COM A IDENTIDADE DO USUARIO. As policies de RLS
// continuam valendo, entao "o usuario enxerga esse servidor?" ja e a resposta de
// "o usuario e membro desse servidor?" — sem precisar da service_role key aqui
// nem adivinhar o nome da tabela de membros.
function supabaseComoUsuario(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function extrairToken(req) {
  const cabecalho = req.get("authorization") || "";
  const [esquema, valor] = cabecalho.split(" ");
  if (!valor || esquema.toLowerCase() !== "bearer") return null;
  return valor.trim() || null;
}

// Middleware: exige login valido. Popula req.usuario e req.jwt.
async function exigirLogin(req, res, next) {
  const jwt = extrairToken(req);
  if (!jwt) return res.status(401).json({ erro: "Nao autenticado" });
  try {
    const { data, error } = await supabaseAuth.auth.getUser(jwt);
    if (error) {
      // Token recusado pelo Supabase (401/403) e culpa do cliente; qualquer outra
      // coisa (rede, Supabase fora do ar) e nossa — devolver 401 ai faria o usuario
      // ler "voce nao e membro" quando na verdade o servico esta indisponivel.
      const status = error.status || 0;
      if (status === 401 || status === 403) {
        return res.status(401).json({ erro: "Sessao invalida ou expirada" });
      }
      console.error("[auth] Supabase indisponivel:", error.message);
      return res.status(503).json({ erro: "Nao foi possivel validar a sessao agora" });
    }
    if (!data?.user) return res.status(401).json({ erro: "Sessao invalida ou expirada" });
    req.usuario = data.user;
    req.jwt = jwt;
    next();
  } catch (e) {
    console.error("[auth] erro ao validar token:", e.message);
    res.status(503).json({ erro: "Nao foi possivel validar a sessao agora" });
  }
}

// O id do servidor vem do cliente, entao conferimos o formato. Sem travar a
// VERSAO do UUID: exigir v4 deixaria um servidor com id v1/v7 impossivel de
// entrar, com mensagem apontando para o lugar errado.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /token — emite o AccessToken do LiveKit, so para membro do servidor.
// ---------------------------------------------------------------------------
app.get("/token", criarLimite({ janelaMs: 60_000, max: 30 }), exigirLogin, async (req, res) => {
  const sala = String(req.query.room || "").trim();
  if (!UUID.test(sala)) return res.status(400).json({ erro: "Sala invalida" });

  try {
    const db = supabaseComoUsuario(req.jwt);

    // 1) Perfil: so para saber o nome de exibicao e se a conta esta banida.
    //    Esta leitura NAO e fatal de proposito. Se a coluna mudar de nome ou a
    //    policy nao expor uma delas, derrubar aqui travaria 100% das calls com
    //    um 503 generico mandando todo mundo "tentar de novo" para sempre.
    //    O ban de verdade tem que morar nas policies do banco (SUPABASE.md),
    //    nao numa leitura que o proprio banido executa.
    const { data: perfil, error: erroPerfil } = await db
      .from("perfis")
      .select("username, banido")
      .eq("id", req.usuario.id)
      .maybeSingle();
    if (erroPerfil) {
      console.error(`[token] perfil ilegivel (${erroPerfil.code || "?"}): ${erroPerfil.message} — seguindo com o nome do email`);
    }
    if (perfil?.banido) return res.status(403).json({ erro: "Conta banida" });

    // 2) o RLS responde se ele e membro: se enxerga a linha, e membro.
    //    (Vale so enquanto a policy de SELECT de 'servidores' for restrita a
    //    membros — ver SUPABASE.md. Se ela afrouxar, esta checagem afrouxa junto.)
    const { data: servidor, error: erroServidor } = await db
      .from("servidores")
      .select("id")
      .eq("id", sala)
      .maybeSingle();
    if (erroServidor) throw erroServidor;
    if (!servidor) return res.status(403).json({ erro: "Voce nao e membro deste servidor" });

    // 3) IDENTIDADE = id do usuario. No LiveKit a identity e a chave unica do
    //    participante na sala: dois participantes com a mesma identity fazem o
    //    servidor derrubar o primeiro com DUPLICATE_IDENTITY. Nome de usuario e
    //    prefixo de email colidem a toa (gu@gmail.com e gu@hotmail.com viram
    //    "gu"), entao o nome bonito vai no campo `name`, que pode repetir.
    //    A cadeia do nome e a MESMA que o frontend sempre usou
    //    (username || prefixo do email), para o historico do chat continuar
    //    casando com quem escreveu.
    const nome =
      perfil?.username ||
      (req.usuario.email ? req.usuario.email.split("@")[0] : null) ||
      req.usuario.id;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: req.usuario.id,
      name: nome,
      ttl: TOKEN_TTL,
    });
    at.addGrant({ roomJoin: true, room: sala, canPublish: true, canSubscribe: true });

    // devolve o nome junto: o frontend precisa saber quem e ANTES de a call
    // conectar, senao ele se chama "convidado" durante a janela de conexao e
    // confunde o historico com as proprias mensagens.
    res.json({ token: await at.toJwt(), nome, identity: req.usuario.id });
  } catch (e) {
    // com o usuario e a sala no log da pra diagnosticar "o fulano nao entra"
    // direto no journalctl, em vez de adivinhar
    console.error(`[token] falha para ${req.usuario?.id} na sala ${sala}:`, e.message);
    res.status(503).json({ erro: "Nao foi possivel entrar na call agora" });
  }
});

// ---------------------------------------------------------------------------
// POST /reportar-bug — o frontend ja chamava este endpoint; ele nao existia.
// Grava o relato e, se houver bot configurado, avisa no Telegram.
// ---------------------------------------------------------------------------
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID;

app.post("/reportar-bug", criarLimite({ janelaMs: 300_000, max: 5 }), exigirLogin, async (req, res) => {
  const texto = String(req.body?.texto || "").trim().slice(0, 2000);
  if (!texto) return res.status(400).json({ erro: "Texto vazio" });

  // O autor vem da sessao validada, nao do corpo do request: senao qualquer um
  // reportava bug assinando com o email de outra pessoa.
  const autor = req.usuario.email || req.usuario.id;
  const quando = new Date().toISOString();
  console.log(`[bug] ${quando} ${autor}: ${texto.replace(/\s+/g, " ")}`);

  // Responde JA: o relato ja esta no log, e avisar no Telegram e bonus. Esperar
  // o Telegram deixava o usuario olhando "Enviando..." por ate 8s quando a API
  // deles estava lenta.
  res.json({ ok: true });

  if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
    fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT,
        text: `🐛 Convorax — bug reportado\n\nDe: ${autor}\n\n${texto}`,
      }),
      signal: AbortSignal.timeout(8000),
    })
      // 200 do fetch nao quer dizer que o Telegram aceitou: chat_id errado
      // devolve 400 com ok:false e o relato sumiria em silencio.
      .then(async (r) => { if (!r.ok) console.error("[bug] telegram recusou:", r.status, (await r.text()).slice(0, 200)); })
      .catch((e) => console.error("[bug] telegram falhou:", e.message));
  }
});

// ---------------------------------------------------------------------------
// Healthcheck — para o nginx, o systemd e o monitoramento da VPS.
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

// 404 em JSON (o padrao do Express devolve HTML)
app.use((_req, res) => res.status(404).json({ erro: "Rota nao encontrada" }));

// Ultimo guarda-chuva: erro em rota nao derruba o processo.
app.use((err, _req, res, _next) => {
  // corpo malformado e erro do cliente: devolver 500 mandava o frontend dizer
  // "servidor indisponivel" para um request que nunca ia funcionar
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ erro: "JSON invalido" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ erro: "Corpo grande demais" });
  }
  console.error("[erro]", err);
  res.status(500).json({ erro: "Erro interno" });
});

const servidor = app.listen(PORT, HOST, () => {
  console.log(`[boot] Convorax backend rodando em ${HOST}:${PORT}`);
  console.log(`[boot] CORS: ${ORIGENS.length ? ORIGENS.join(", ") : "liberado (defina CORS_ORIGINS em producao)"}`);
});

// Sem este handler o EADDRINUSE de um restart chegava como excecao nao
// capturada. Como o handler abaixo so logava, o processo continuava vivo sem
// escutar nada: o systemd via "active (running)" e o Restart=always nunca
// entrava — API morta ate alguem reparar na mao.
servidor.on("error", (e) => {
  console.error(`[boot] nao foi possivel escutar em ${HOST}:${PORT}:`, e.message);
  process.exit(1);
});

// Uma promise rejeitada sem catch e um estado que nao da pra confiar. Logamos o
// stack e SAIMOS, deixando o systemd reiniciar limpo (o unit tem Restart=always
// e StartLimit para nao virar loop).
process.on("unhandledRejection", (motivo) => {
  console.error("[unhandledRejection]", motivo);
});
process.on("uncaughtException", (e) => {
  console.error("[uncaughtException]", e?.stack || e);
  process.exit(1);
});

// Shutdown limpo: o systemd manda SIGTERM no restart.
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => {
    console.log(`[shutdown] ${sinal} recebido, fechando...`);
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
