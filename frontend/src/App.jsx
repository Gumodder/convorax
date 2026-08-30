import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import Sala from "./Sala";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { motion, AnimatePresence } from "framer-motion";

const LIVEKIT_URL = "wss://voz.convorax.space";

export default function App() {
  const [sessao, setSessao] = useState(null);
  const [servidores, setServidores] = useState([]);
  const [token, setToken] = useState("");
  const [salaAtual, setSalaAtual] = useState(null);
  const [novoNome, setNovoNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState("");
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  const [onlinePorSala, setOnlinePorSala] = useState({});
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
  async function criarServidor() {
    if (!novoNome) return;
    const { error } = await supabase.rpc("criar_servidor", { nome_servidor: novoNome });
    if (error) setAviso(error.message);
    else { setNovoNome(""); setAviso(""); carregarServidores(); }
  }
  async function entrarPorCodigo() {
    if (!codigo) return;
    const { error } = await supabase.rpc("entrar_por_codigo", { codigo_convite: codigo });
    if (error) setAviso("Codigo invalido");
    else { setCodigo(""); setAviso(""); carregarServidores(); }
  }
  async function entrarNaSala(servidor) {
    const nome = sessao.user.email.split("@")[0];
    const res = await fetch(`https://api.convorax.space/token?room=${servidor.id}&name=${nome}`);
    const data = await res.json();
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{ ...s.tela, padding: mobile ? "20px 16px" : "32px 48px" }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <img src="/logo.png" alt="Convorax" style={{ height: mobile ? 48 : 64 }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>

      <header style={{ ...s.header, flexDirection: mobile ? "column" : "row", gap: mobile ? 12 : 0, alignItems: mobile ? "stretch" : "flex-start" }}>
        <div>
          <h1 style={s.h1}>Servidores</h1>
          <p style={s.email}>{sessao.user.email}</p>
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => supabase.auth.signOut()} style={s.sair}>Sair</motion.button>
      </header>

      <div style={{ ...s.acoes, flexDirection: mobile ? "column" : "row" }}>
        <div style={s.cardAcao}>
          <span style={s.acaoLabel}>CRIAR SERVIDOR</span>
          <div style={{ ...s.linha, flexDirection: mobile ? "column" : "row" }}>
            <input placeholder="Nome do servidor" value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criarServidor()} style={s.input} />
            <motion.button whileTap={{ scale: 0.95 }} onClick={criarServidor} style={{ ...s.btnAzul, width: mobile ? "100%" : "auto" }}>Criar</motion.button>
          </div>
        </div>
        <div style={s.cardAcao}>
          <span style={s.acaoLabel}>ENTRAR POR CODIGO</span>
          <div style={{ ...s.linha, flexDirection: mobile ? "column" : "row" }}>
            <input placeholder="Ex: A3F9K2" value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && entrarPorCodigo()} style={s.input} />
            <motion.button whileTap={{ scale: 0.95 }} onClick={entrarPorCodigo} style={{ ...s.btnCinza, width: mobile ? "100%" : "auto" }}>Entrar</motion.button>
          </div>
        </div>
      </div>

      {aviso && <p style={s.aviso}>{aviso}</p>}

      <div style={{ ...s.grid, gridTemplateColumns: mobile ? "repeat(auto-fill, minmax(140px, 1fr))" : "repeat(auto-fill, minmax(220px, 1fr))" }}>
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
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                style={s.cardServ}>
                <div style={s.avatar}>{inicial(serv.nome)}</div>
                <h3 style={s.nomeServ}>{serv.nome}</h3>
                <div style={s.onlineBox}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: online > 0 ? "#23a559" : "#80848e", display: "inline-block" }} />
                  <span style={{ fontSize: 13, color: online > 0 ? "#23a559" : "#80848e", fontWeight: 600 }}>{online} online</span>
                </div>
                <div style={s.codBox}>
                  <span style={s.codLabel}>convite</span>
                  <span style={s.codigo}>{serv.codigo}</span>
                </div>
                <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.03 }} onClick={() => entrarNaSala(serv)} style={s.btnEntrar}>Entrar na voz</motion.button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

const s = {
  tela: { minHeight: "100vh", background: "#313338" },
  header: { display: "flex", justifyContent: "space-between", marginBottom: 28 },
  h1: { fontSize: 28, fontWeight: 700, color: "#f2f3f5" },
  email: { fontSize: 14, color: "#b5bac1", marginTop: 4 },
  sair: { padding: "8px 18px", borderRadius: 4, border: "none", background: "#2b2d31", color: "#f2f3f5", cursor: "pointer", fontWeight: 500 },
  acoes: { display: "flex", gap: 16, marginBottom: 24 },
  cardAcao: { flex: 1, minWidth: 0, background: "#2b2d31", padding: 20, borderRadius: 8 },
  acaoLabel: { fontSize: 12, fontWeight: 700, color: "#b5bac1", letterSpacing: 0.5 },
  linha: { display: "flex", gap: 8, marginTop: 12 },
  input: { flex: 1, padding: 10, borderRadius: 4, border: "none", background: "#1e1f22", color: "#f2f3f5", fontSize: 14, minWidth: 0 },
  btnAzul: { padding: "10px 20px", borderRadius: 4, border: "none", background: "#5865f2", color: "#fff", cursor: "pointer", fontWeight: 600 },
  btnCinza: { padding: "10px 20px", borderRadius: 4, border: "none", background: "#4e5058", color: "#fff", cursor: "pointer", fontWeight: 600 },
  aviso: { color: "#f0b232", fontSize: 14, marginBottom: 16 },
  grid: { display: "grid", gap: 16 },
  vazio: { gridColumn: "1 / -1", textAlign: "center", padding: "60px 0", color: "#f2f3f5" },
  cardServ: { background: "#2b2d31", padding: 20, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  avatar: { width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#fff" },
  nomeServ: { fontSize: 17, fontWeight: 600, marginTop: 12, color: "#f2f3f5" },
  onlineBox: { display: "flex", alignItems: "center", gap: 6, marginTop: 8 },
  codBox: { display: "flex", flexDirection: "column", alignItems: "center", background: "#1e1f22", padding: "6px 14px", borderRadius: 6, marginTop: 10 },
  codLabel: { fontSize: 10, color: "#b5bac1", textTransform: "uppercase", letterSpacing: 0.5 },
  codigo: { fontSize: 16, fontWeight: 700, color: "#00a8fc", letterSpacing: 1 },
  btnEntrar: { width: "100%", padding: 10, marginTop: 14, borderRadius: 4, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", cursor: "pointer", fontWeight: 600 },
};
