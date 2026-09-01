import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import Sala from "./Sala";
import MenuPerfil from "./MenuPerfil";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { motion, AnimatePresence } from "framer-motion";

const LIVEKIT_URL = "wss://voz.convorax.space";

// ---- Modal: foto opcional ao criar servidor ----
function FotoNovoServidor({ nome, onCriar, onFechar, criando }) {
  const [avatar, setAvatar] = useState("");      // url já enviada
  const [subindo, setSubindo] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  async function escolherFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubindo(true); setMsg("");
    try {
      const tipoExt = { "image/gif": "gif", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" };
      const ext = tipoExt[file.type] || "png";
      const caminho = `servidores/novo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatares").upload(caminho, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatares").getPublicUrl(caminho);
      setAvatar(data.publicUrl + "?t=" + Date.now());
    } catch (err) {
      setMsg("Erro na foto: " + err.message);
    } finally {
      setSubindo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div onClick={onFechar}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ width: "100%", maxWidth: 360, background: "#141518", borderRadius: 16, border: "1px solid rgba(124,58,237,0.25)", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
        <div style={{ height: 60, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", padding: "0 18px" }}>
          <span style={{ fontWeight: 800, color: "#fff", fontSize: 16 }}>Foto do servidor</span>
        </div>
        <div style={{ padding: 20, textAlign: "center" }}>
          <p style={{ color: "#b5bac1", fontSize: 13, marginBottom: 16 }}>Quer colocar uma foto em <b style={{ color: "#f2f3f5" }}>{nome}</b>? (opcional)</p>
          <div onClick={() => !subindo && fileRef.current?.click()}
            style={{ width: 96, height: 96, borderRadius: "50%", margin: "0 auto 18px", background: avatar ? "#000" : "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "3px solid #2b2d31", overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
            title="Escolher foto">
            {avatar
              ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ color: "#fff", fontSize: 34, fontWeight: 800 }}>{(nome || "?").charAt(0).toUpperCase()}</span>}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, padding: "2px 0" }}>{subindo ? "..." : "escolher"}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*,image/gif" onChange={escolherFoto} style={{ display: "none" }} />
          {msg && <p style={{ fontSize: 12, color: "#f0b232", marginBottom: 12 }}>{msg}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onCriar(null)} disabled={criando || subindo}
              style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#b5bac1", fontWeight: 700, cursor: "pointer" }}>
              Pular
            </button>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => onCriar(avatar || null)} disabled={criando || subindo}
              style={{ flex: 1, padding: 12, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
              {criando ? "..." : "Criar"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [servidores, setServidores] = useState([]);
  const [token, setToken] = useState("");
  const [salaAtual, setSalaAtual] = useState(null);
  const [novoNome, setNovoNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState("");
  const [criarFotoAberto, setCriarFotoAberto] = useState(false); // modal de foto na criação
  const [criandoServidor, setCriandoServidor] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  const [onlinePorSala, setOnlinePorSala] = useState({});
  const [meuUsername, setMeuUsername] = useState("");   // username do perfil (cai no email se vazio)
  const [bannerFechado, setBannerFechado] = useState(false); // banner de anuncio no rodape
  const [bugAberto, setBugAberto] = useState(false);   // modal reportar bug
  const [bugTexto, setBugTexto] = useState("");
  const [bugEnviando, setBugEnviando] = useState(false);
  const [bugMsg, setBugMsg] = useState("");
  const presencaRef = useRef(null);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (sessao) carregarServidores(); }, [sessao]);

  // Carrega o username do meu perfil (usado na call, chat e tela inicial)
  useEffect(() => {
    if (!sessao) return;
    supabase.from("perfis").select("username").eq("id", sessao.user.id).maybeSingle()
      .then(({ data }) => {
        setMeuUsername(data?.username || sessao.user.email.split("@")[0]);
      });
  }, [sessao]);

  // Presenca: conta quantos estao em cada servidor, em tempo real
  useEffect(() => {
    if (!sessao) return;
    const canal = supabase.channel("presenca-salas", {
      config: { presence: { key: sessao.user.id } },
    });
    presencaRef.current = canal;
    canal.on("presence", { event: "sync" }, () => {
      const state = canal.presenceState();
      const contagem = {};
      Object.values(state).forEach((arr) => {
        arr.forEach((meta) => {
          if (meta.sala_id) contagem[meta.sala_id] = (contagem[meta.sala_id] || 0) + 1;
        });
      });
      setOnlinePorSala(contagem);
    });
    canal.subscribe((status) => {
      if (status === "SUBSCRIBED") canal.track({ sala_id: salaAtual?.id || null });
    });
    return () => { supabase.removeChannel(canal); presencaRef.current = null; };
  }, [sessao]);

  // Atualiza minha presenca quando entro/saio de uma sala
  useEffect(() => {
    if (presencaRef.current) presencaRef.current.track({ sala_id: salaAtual?.id || null });
  }, [salaAtual]);

  // Reconecta na sala da URL ao recarregar a pagina (F5)
  useEffect(() => {
    if (servidores.length && !salaAtual) {
      const salvo = new URLSearchParams(window.location.search).get("sala");
      if (salvo) {
        const serv = servidores.find((x) => x.id === salvo);
        if (serv) entrarNaSala(serv);
      }
    }
  }, [servidores]);

  async function carregarServidores() {
    const { data } = await supabase.from("servidores").select("*");
    setServidores(data || []);
  }
  function criarServidor() {
    if (!novoNome.trim()) return;
    setAviso("");
    setCriarFotoAberto(true); // abre o modal perguntando a foto
  }

  // Cria o servidor de fato. avatarUrl pode ser null (pulou a foto).
  async function finalizarCriacao(avatarUrl) {
    setCriandoServidor(true);
    const { data: novoId, error } = await supabase.rpc("criar_servidor", { nome_servidor: novoNome.trim() });
    if (error) { setAviso(error.message); setCriandoServidor(false); return false; }
    // se escolheu foto, salva via editar_servidor (precisa do id do servidor recém-criado)
    if (avatarUrl) {
      // descobre o id: criar_servidor pode retornar o id, senão busca pelo nome mais recente
      let id = (novoId && (novoId.id || novoId)) || null;
      if (!id) {
        const { data: achado } = await supabase
          .from("servidores").select("id").eq("nome", novoNome.trim())
          .order("criado_em", { ascending: false }).limit(1).single();
        id = achado?.id;
      }
      if (id) await supabase.rpc("editar_servidor", { p_id: id, p_nome: novoNome.trim(), p_avatar_url: avatarUrl });
    }
    setNovoNome("");
    setCriarFotoAberto(false);
    setCriandoServidor(false);
    carregarServidores();
    return true;
  }
  async function entrarPorCodigo() {
    if (!codigo) return;
    const { error } = await supabase.rpc("entrar_por_codigo", { codigo_convite: codigo });
    if (error) setAviso("Codigo invalido");
    else { setCodigo(""); setAviso(""); carregarServidores(); }
  }
  async function apagarServidor(serv) {
    if (!confirm(`Apagar o servidor "${serv.nome}"? Isso remove todos os canais e mensagens. Nao da pra desfazer.`)) return;
    const { error } = await supabase.rpc("apagar_servidor", { p_id: serv.id });
    if (error) { setAviso(error.message); return; }
    setAviso("");
    carregarServidores();
  }
  async function sairServidor(serv) {
    if (!confirm(`Sair do servidor "${serv.nome}"?`)) return;
    const { error } = await supabase.rpc("sair_do_servidor", { p_id: serv.id });
    if (error) { setAviso(error.message); return; }
    setAviso("");
    carregarServidores();
  }
  async function enviarBug() {
    const t = bugTexto.trim();
    if (!t) return;
    setBugEnviando(true); setBugMsg("");
    try {
      const r = await fetch("https://api.convorax.space/reportar-bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t, autor: sessao.user.email }),
      });
      if (!r.ok) throw new Error();
      setBugMsg("Enviado! Valeu 🙌");
      setBugTexto("");
      setTimeout(() => { setBugAberto(false); setBugMsg(""); }, 1200);
    } catch {
      setBugMsg("Erro ao enviar. Tenta de novo.");
    } finally {
      setBugEnviando(false);
    }
  }
  async function entrarNaSala(servidor) {
    // manda o JWT de login; o backend valida e so libera se for membro
    const jwt = sessao?.access_token;
    const res = await fetch(`https://api.convorax.space/token?room=${servidor.id}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) {
      setAviso("Nao foi possivel entrar na call. Voce precisa ser membro do servidor.");
      return;
    }
    const data = await res.json();
    if (!data.token) {
      setAviso("Nao foi possivel entrar na call.");
      return;
    }
    setToken(data.token);
    setSalaAtual(servidor);
    window.history.replaceState(null, "", "?sala=" + servidor.id);
  }
  function sairDaSala() {
    setSalaAtual(null);
    setToken("");
    window.history.replaceState(null, "", window.location.pathname);
  }

  if (!sessao) return <Login />;

  if (salaAtual) {
    return (
      <LiveKitRoom
        token={token}
        serverUrl={LIVEKIT_URL}
        connect={true}
        video={false}
        audio={true}
        audioCaptureDefaults={{ noiseSuppression: true, echoCancellation: true, autoGainControl: true }}
        onDisconnected={sairDaSala}
        style={{ height: "100vh" }}
      >
        <Sala salaId={salaAtual.id} nomeServidor={salaAtual.nome} onSair={sairDaSala} />
      </LiveKitRoom>
    );
  }

  const inicial = (nome) => nome.charAt(0).toUpperCase();

  return (
    <div style={s.tela}>
      <div style={s.brilho1} />
      <div style={s.brilho2} />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={{ position: "relative", zIndex: 1, padding: mobile ? "20px 16px" : "32px 48px", paddingBottom: bannerFechado ? undefined : (mobile ? 130 : 230), maxWidth: 1200, margin: "0 auto" }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <img src="/logo.png" alt="Convorax" style={{ height: mobile ? 52 : 68 }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        </div>

        <header style={{ ...s.header, flexDirection: "row", gap: 12, alignItems: "center" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ ...s.h1, fontSize: mobile ? 24 : 28 }}>Servidores</h1>
            <p style={{ ...s.email, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meuUsername || sessao.user.email}</p>
          </div>
          <motion.button whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.05 }}
            onClick={() => setBugAberto(true)}
            style={s.btnBug} title="Reportar um bug">
            🐛 {!mobile && "Reportar bug"}
          </motion.button>
          <MenuPerfil sessao={sessao} />
        </header>

        <div style={{ ...s.acoes, flexDirection: mobile ? "column" : "row" }}>
          <div style={s.cardAcao}>
            <span style={s.acaoLabel}>CRIAR SERVIDOR</span>
            <div style={{ ...s.linha, flexDirection: mobile ? "column" : "row" }}>
              <input placeholder="Nome do servidor" value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && criarServidor()} style={s.input} />
              <motion.button whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} onClick={criarServidor} style={{ ...s.btnGrad, width: mobile ? "100%" : "auto" }}>Criar</motion.button>
            </div>
          </div>
          <div style={s.cardAcao}>
            <span style={s.acaoLabel}>ENTRAR POR CODIGO</span>
            <div style={{ ...s.linha, flexDirection: mobile ? "column" : "row" }}>
              <input placeholder="Ex: A3F9K2" value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && entrarPorCodigo()} style={s.input} />
              <motion.button whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} onClick={entrarPorCodigo} style={{ ...s.btnCinza, width: mobile ? "100%" : "auto" }}>Entrar</motion.button>
            </div>
          </div>
        </div>

        {aviso && <p style={s.aviso}>{aviso}</p>}

        <div style={{ ...s.grid, gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {servidores.length === 0 && (
            <div style={s.vazio}>
              <p style={{ fontSize: 18, fontWeight: 600 }}>Nenhum servidor ainda</p>
              <p style={{ color: "#b5bac1", marginTop: 4 }}>Crie um ou entre com um codigo.</p>
            </div>
          )}
          <AnimatePresence>
            {servidores.map((serv) => {
              const online = onlinePorSala[serv.id] || 0;
              return (
                <motion.div key={serv.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -4, boxShadow: "0 12px 30px rgba(124,58,237,0.25)" }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  style={s.cardServ}>
                  {serv.dono_id === sessao.user.id ? (
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}
                      onClick={() => apagarServidor(serv)}
                      style={s.btnCanto} title="Apagar servidor (voce e o dono)">🗑</motion.button>
                  ) : (
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }}
                      onClick={() => sairServidor(serv)}
                      style={s.btnCanto} title="Sair do servidor">🚪</motion.button>
                  )}
                  <div style={s.avatar}>
                    {serv.avatar_url
                      ? <img src={serv.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : inicial(serv.nome)}
                  </div>
                  <h3 style={s.nomeServ}>{serv.nome}</h3>
                  <div style={s.onlineBox}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: online > 0 ? "#23a559" : "#80848e", display: "inline-block", boxShadow: online > 0 ? "0 0 8px #23a559" : "none" }} />
                    <span style={{ fontSize: 13, color: online > 0 ? "#23a559" : "#80848e", fontWeight: 600 }}>{online} online</span>
                  </div>
                  <div style={s.codBox}>
                    <span style={s.codLabel}>convite</span>
                    <span style={s.codigo}>{serv.codigo}</span>
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} onClick={() => entrarNaSala(serv)} style={s.btnEntrar}>Entrar na voz</motion.button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {criarFotoAberto && (
          <FotoNovoServidor nome={novoNome.trim()} criando={criandoServidor}
            onCriar={finalizarCriacao} onFechar={() => !criandoServidor && setCriarFotoAberto(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bugAberto && (
          <div onClick={() => !bugEnviando && setBugAberto(false)}
            style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <motion.div onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
              style={{ width: "100%", maxWidth: 420, background: "#141518", borderRadius: 16, border: "1px solid rgba(240,178,50,0.35)", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
              <div style={{ height: 54, background: "linear-gradient(135deg, #f0b232, #f59e0b)", display: "flex", alignItems: "center", padding: "0 18px" }}>
                <span style={{ fontWeight: 800, color: "#1a1b1e", fontSize: 16 }}>🐛 Reportar bug</span>
              </div>
              <div style={{ padding: 20 }}>
                <p style={{ color: "#b5bac1", fontSize: 13, marginBottom: 12 }}>Achou algo quebrado ou estranho? Descreve aqui que a gente conserta.</p>
                <textarea value={bugTexto} onChange={(e) => setBugTexto(e.target.value)}
                  placeholder="Ex: quando mexo no volume trava... / o botao X nao funciona no celular..."
                  maxLength={2000}
                  style={{ width: "100%", minHeight: 120, resize: "vertical", padding: 12, borderRadius: 8, border: "1px solid #2b2d31", background: "#1a1b1e", color: "#f2f3f5", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                {bugMsg && <p style={{ fontSize: 13, color: bugMsg.startsWith("Erro") ? "#f23f43" : "#23a559", marginTop: 10 }}>{bugMsg}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={() => setBugAberto(false)} disabled={bugEnviando}
                    style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#b5bac1", fontWeight: 700, cursor: "pointer" }}>
                    Cancelar
                  </button>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={enviarBug} disabled={bugEnviando || !bugTexto.trim()}
                    style={{ flex: 1, padding: 12, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #f0b232, #f59e0b)", color: "#1a1b1e", fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(240,178,50,0.35)", opacity: (bugEnviando || !bugTexto.trim()) ? 0.6 : 1 }}>
                    {bugEnviando ? "Enviando..." : "Enviar"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!bannerFechado && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 200,
              display: "flex", justifyContent: "center",
              padding: mobile ? "0 8px 8px" : "0 16px 14px",
              pointerEvents: "none",
            }}
          >
            <div style={{ position: "relative", width: "100%", maxWidth: 1200, pointerEvents: "auto" }}>
              <a href="https://t.me/gladepaybot" target="_blank" rel="noreferrer"
                style={{ display: "block", borderRadius: 12, overflow: "hidden" }}>
                <img src="https://jdmoprahepzbpmuttywd.supabase.co/storage/v1/object/public/assets/anuncioglade-cortado.png"
                  alt="GladePay - Receba pagamento pelo Telegram"
                  style={{ display: "block", width: "100%", height: "auto", objectFit: "contain" }}
                  onError={(e) => { e.currentTarget.closest("div").parentElement.style.display = "none"; }} />
              </a>
              <button onClick={() => setBannerFechado(true)} title="Fechar anuncio"
                style={{
                  position: "absolute", top: -10, right: -10, zIndex: 2,
                  width: 30, height: 30, borderRadius: "50%", border: "2px solid #0d0e11",
                  background: "#1a1b1e", color: "#fff", cursor: "pointer", fontSize: 15,
                  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}>✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const s = {
  tela: { position: "relative", minHeight: "100dvh", background: "#0d0e11", overflow: "hidden" },
  brilho1: { position: "absolute", top: "-10%", left: "-8%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.22), transparent 70%)", filter: "blur(50px)", pointerEvents: "none" },
  brilho2: { position: "absolute", bottom: "-10%", right: "-8%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.20), transparent 70%)", filter: "blur(50px)", pointerEvents: "none" },
  header: { display: "flex", justifyContent: "space-between", marginBottom: 28 },
  h1: { fontSize: 28, fontWeight: 800, color: "#f2f3f5", letterSpacing: -0.5 },
  email: { fontSize: 14, color: "#8b8f96", marginTop: 4 },
  sair: { padding: "9px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(43,45,49,0.7)", color: "#f2f3f5", cursor: "pointer", fontWeight: 600 },
  acoes: { display: "flex", gap: 16, marginBottom: 28 },
  cardAcao: { flex: 1, minWidth: 0, background: "rgba(30,31,34,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.06)", padding: 20, borderRadius: 14 },
  acaoLabel: { fontSize: 12, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5 },
  linha: { display: "flex", gap: 8, marginTop: 12 },
  input: { flex: 1, padding: 11, borderRadius: 8, border: "1px solid #2b2d31", background: "#1a1b1e", color: "#f2f3f5", fontSize: 14, minWidth: 0, outline: "none", boxSizing: "border-box" },
  btnGrad: { padding: "11px 22px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 14px rgba(124,58,237,0.35)" },
  btnCinza: { padding: "11px 22px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #3b82f6, #06b6d4)", color: "#fff", cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 14px rgba(59,130,246,0.3)" },
  aviso: { color: "#f0b232", fontSize: 14, marginBottom: 16 },
  grid: { display: "grid", gap: 16 },
  vazio: { gridColumn: "1 / -1", textAlign: "center", padding: "60px 0", color: "#f2f3f5" },
  cardServ: { position: "relative", background: "rgba(30,31,34,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.06)", padding: 22, borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  btnBug: { flexShrink: 0, padding: "9px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f0b232, #f59e0b)", color: "#1a1b1e", cursor: "pointer", fontWeight: 800, fontSize: 14, boxShadow: "0 3px 12px rgba(240,178,50,0.35)", display: "flex", alignItems: "center", gap: 6 },
  btnCanto: { position: "absolute", top: 10, right: 10, zIndex: 2, width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.35)", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 },
  avatar: { width: 66, height: 66, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 27, fontWeight: 700, color: "#fff", boxShadow: "0 4px 16px rgba(124,58,237,0.4)", overflow: "hidden" },
  nomeServ: { fontSize: 17, fontWeight: 700, marginTop: 12, color: "#f2f3f5" },
  onlineBox: { display: "flex", alignItems: "center", gap: 6, marginTop: 8 },
  codBox: { display: "flex", flexDirection: "column", alignItems: "center", background: "#1a1b1e", padding: "6px 14px", borderRadius: 8, marginTop: 12, border: "1px solid rgba(255,255,255,0.05)" },
  codLabel: { fontSize: 10, color: "#8b8f96", textTransform: "uppercase", letterSpacing: 0.5 },
  codigo: { fontSize: 16, fontWeight: 700, color: "#4aa3ff", letterSpacing: 1 },
  btnEntrar: { width: "100%", padding: 11, marginTop: 16, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", cursor: "pointer", fontWeight: 700, boxShadow: "0 4px 14px rgba(124,58,237,0.3)" },
};
