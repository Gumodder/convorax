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
const TOKEN_TTL = process.env.TOKEN_TTL || "6h";

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

// UUID v4 — o id do servidor vem do cliente, entao nao confiamos no formato.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /token — emite o AccessToken do LiveKit, so para membro do servidor.
// ---------------------------------------------------------------------------
app.get("/token", criarLimite({ janelaMs: 60_000, max: 30 }), exigirLogin, async (req, res) => {
  const sala = String(req.query.room || "").trim();
  if (!UUID.test(sala)) return res.status(400).json({ erro: "Sala invalida" });

  try {
    const db = supabaseComoUsuario(req.jwt);

    // 1) conta banida nao entra em call nenhuma
    const { data: perfil, error: erroPerfil } = await db
      .from("perfis")
      .select("username, email_nome, banido")
      .eq("id", req.usuario.id)
      .maybeSingle();
    if (erroPerfil) throw erroPerfil;
    if (perfil?.banido) return res.status(403).json({ erro: "Conta banida" });

    // 2) o RLS responde se ele e membro: se enxerga a linha, e membro.
    const { data: servidor, error: erroServidor } = await db
      .from("servidores")
      .select("id")
      .eq("id", sala)
      .maybeSingle();
    if (erroServidor) throw erroServidor;
    if (!servidor) return res.status(403).json({ erro: "Voce nao e membro deste servidor" });

    // 3) a identidade vem do SERVIDOR, nunca do cliente: sem isso qualquer um
    //    entrava na call com o nome de outra pessoa.
    const identidade =
      perfil?.username ||
      perfil?.email_nome ||
      (req.usuario.email ? req.usuario.email.split("@")[0] : null) ||
      req.usuario.id;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: identidade,
      name: identidade,
      ttl: TOKEN_TTL,
    });
    at.addGrant({ roomJoin: true, room: sala, canPublish: true, canSubscribe: true });

    res.json({ token: await at.toJwt() });
  } catch (e) {
    console.error("[token] falha:", e.message);
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

  if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT,
          text: `🐛 Convorax — bug reportado\n\nDe: ${autor}\n\n${texto}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      // O relato ja esta no log: avisar no Telegram e bonus, nao pode derrubar a resposta.
      console.error("[bug] telegram falhou:", e.message);
    }
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Healthcheck — para o nginx, o systemd e o monitoramento da VPS.
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

// 404 em JSON (o padrao do Express devolve HTML)
app.use((_req, res) => res.status(404).json({ erro: "Rota nao encontrada" }));

// Ultimo guarda-chuva: erro em rota nao derruba o processo.
app.use((err, _req, res, _next) => {
  console.error("[erro]", err);
  res.status(500).json({ erro: "Erro interno" });
});

const servidor = app.listen(PORT, () => {
  console.log(`[boot] Convorax backend rodando na porta ${PORT}`);
  console.log(`[boot] CORS: ${ORIGENS.length ? ORIGENS.join(", ") : "liberado (defina CORS_ORIGINS em producao)"}`);
});

// Uma promise rejeitada sem catch mata o Node 22. Em um servidor de voz isso
// significa a call inteira caindo — logamos e seguimos.
process.on("unhandledRejection", (motivo) => console.error("[unhandledRejection]", motivo));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// Shutdown limpo: o systemd manda SIGTERM no restart.
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => {
    console.log(`[shutdown] ${sinal} recebido, fechando...`);
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
