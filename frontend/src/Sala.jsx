import {
  useParticipants,
  useTracks,
  ControlBar,
  RoomAudioRenderer,
  LayoutContextProvider,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";

const CORES = ["#a855f7", "#3b82f6", "#06b6d4", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];
function corDoNome(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return CORES[Math.abs(h) % CORES.length];
}

// ---- Avatar grande (grid central) ----
function Avatar({ participant, avatarUrl }) {
  const [falando, setFalando] = useState(participant.isSpeaking);
  const [mutado, setMutado] = useState(!participant.isMicrophoneEnabled);
  useEffect(() => {
    const updateFala = () => setFalando(participant.isSpeaking);
    const updateMic = () => setMutado(!participant.isMicrophoneEnabled);
    participant.on("isSpeakingChanged", updateFala);
    participant.on("trackMuted", updateMic);
    participant.on("trackUnmuted", updateMic);
    participant.on("trackPublished", updateMic);
    participant.on("trackUnpublished", updateMic);
    updateMic();
    return () => {
      participant.off("isSpeakingChanged", updateFala);
      participant.off("trackMuted", updateMic);
      participant.off("trackUnmuted", updateMic);
      participant.off("trackPublished", updateMic);
      participant.off("trackUnpublished", updateMic);
    };
  }, [participant]);
  const nome = participant.identity || "?";
  const inicial = nome.charAt(0).toUpperCase();
  const cor = corDoNome(nome);
  const ativo = falando && !mutado;
  const remoto = !participant.isLocal;
  const [volume, setVolumeState] = useState(100);
  const [mostrarVol, setMostrarVol] = useState(false);
  function mudarVolume(v) {
    setVolumeState(v);
    try { participant.setVolume?.(v / 100); } catch (e) {}
  }
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center",
        background: ativo ? "rgba(35,165,89,0.08)" : "rgba(30,31,34,0.7)",
        backdropFilter: "blur(8px)", borderRadius: 14,
        padding: 24, minHeight: 160, position: "relative",
        border: ativo ? "1px solid rgba(35,165,89,0.6)" : "1px solid rgba(255,255,255,0.06)",
        transition: "all 0.2s ease",
      }}
    >
      {mutado && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 28, height: 28, borderRadius: "50%", background: "#f23f43",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, color: "#fff",
        }} title="Microfone silenciado">🔇</div>
      )}
      <div style={{ position: "relative", width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatePresence>
          {ativo && (
            <motion.div
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0.6, 0], scale: [1, 1.35] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
              style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: "3px solid #23a559" }}
            />
          )}
        </AnimatePresence>
        <motion.div
          animate={ativo ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={ativo ? { duration: 0.6, repeat: Infinity } : { duration: 0.2 }}
          style={{
            width: 80, height: 80, borderRadius: "50%", overflow: "hidden",
            background: `linear-gradient(135deg, ${cor}, ${cor}bb)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 700, color: "#fff",
            boxShadow: ativo ? "0 0 18px rgba(35,165,89,0.6)" : "none",
            position: "relative", zIndex: 1,
          }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : inicial}
        </motion.div>
        <div style={{
          position: "absolute", bottom: 2, right: 2, zIndex: 2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#23a559", border: "3px solid #1e1f22",
        }} title="Online" />
      </div>
      <span style={{ marginTop: 12, color: "#f2f3f5", fontWeight: 600, fontSize: 15 }}>{nome}</span>
      {remoto && (
        <div style={{ marginTop: 10, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={() => setMostrarVol((v) => !v)}
            style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#b5bac1", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
            title="Volume desta pessoa">
            {volume === 0 ? "🔇" : "🔊"} {volume}%
          </motion.button>
          <AnimatePresence>
            {mostrarVol && (
              <motion.input
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                type="range" min="0" max="200" value={volume}
                onChange={(e) => mudarVolume(Number(e.target.value))}
                style={{ width: "90%", accentColor: "#7c3aed", cursor: "pointer" }} />
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ---- Item pequeno de participante (sidebar) ----
function ParticipanteMini({ participant, avatarUrl }) {
  const [falando, setFalando] = useState(participant.isSpeaking);
  const [mutado, setMutado] = useState(!participant.isMicrophoneEnabled);
  useEffect(() => {
    const uf = () => setFalando(participant.isSpeaking);
    const um = () => setMutado(!participant.isMicrophoneEnabled);
    participant.on("isSpeakingChanged", uf);
    participant.on("trackMuted", um);
    participant.on("trackUnmuted", um);
    participant.on("trackPublished", um);
    participant.on("trackUnpublished", um);
    um();
    return () => {
      participant.off("isSpeakingChanged", uf);
      participant.off("trackMuted", um);
      participant.off("trackUnmuted", um);
      participant.off("trackPublished", um);
      participant.off("trackUnpublished", um);
    };
  }, [participant]);
  const nome = participant.identity || "?";
  const cor = corDoNome(nome);
  const ativo = falando && !mutado;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: ativo ? "rgba(35,165,89,0.12)" : "transparent" }}>
      <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
          background: `linear-gradient(135deg, ${cor}, ${cor}bb)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: "#fff",
          boxShadow: ativo ? "0 0 0 2px #23a559" : "none",
        }}>
          {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : nome.charAt(0).toUpperCase()}
        </div>
      </div>
      <span style={{ color: ativo ? "#f2f3f5" : "#b5bac1", fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{nome}</span>
      {mutado && <span style={{ fontSize: 13 }} title="Mutado">🔇</span>}
    </div>
  );
}

// ---- Chat ----
function Chat({ salaId, meuNome, onFechar, mobile, onImagem, onRecolher }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!salaId) return;
    let ativo = true;
    supabase
      .from("mensagens")
      .select("*")
      .eq("sala_id", String(salaId))
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (ativo && data) setMensagens(data); });

    const canal = supabase
      .channel("sala-" + salaId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: "sala_id=eq." + salaId },
        (payload) => setMensagens((m) => [...m, payload.new])
      )
      .subscribe();

    return () => { ativo = false; supabase.removeChannel(canal); };
  }, [salaId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  async function enviarTexto() {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    await supabase.from("mensagens").insert({
      sala_id: String(salaId), autor: meuNome, conteudo: t,
    });
  }

  async function enviarArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const ext = file.name.split(".").pop();
      const caminho = `${salaId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-files").upload(caminho, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("chat-files").getPublicUrl(caminho);
      const tipo = file.type.startsWith("video") ? "video"
        : file.type.startsWith("image") ? "image" : "file";
      await supabase.from("mensagens").insert({
        sala_id: String(salaId), autor: meuNome,
        arquivo_url: urlData.publicUrl, arquivo_tipo: tipo,
      });
    } catch (err) {
      alert("Erro ao enviar arquivo: " + err.message);
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#2b2d31" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e1f22", color: "#f2f3f5", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(59,130,246,0.15))" }}>
        {mobile && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onFechar}
            style={{ background: "transparent", border: "none", color: "#f2f3f5", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Voltar"
          >←</motion.button>
        )}
        💬 Chat
        {!mobile && onRecolher && (
          <motion.button whileTap={{ scale: 0.85 }} onClick={onRecolher}
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.08)", border: "none", color: "#f2f3f5", fontSize: 16, width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}
            title="Recolher chat">→</motion.button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {mensagens.map((m, i) => {
          const meu = m.autor === meuNome;
          const anterior = mensagens[i - 1];
          const mostrarNome = !anterior || anterior.autor !== m.autor;
          const cor = corDoNome(m.autor || "?");
          return (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: meu ? "flex-end" : "flex-start", marginTop: mostrarNome ? 6 : 0 }}>
              {mostrarNome && !meu && (
                <span style={{ color: cor, fontSize: 12, fontWeight: 700, marginBottom: 2, marginLeft: 4 }}>{m.autor}</span>
              )}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                style={{
                  maxWidth: "80%",
                  background: meu ? "linear-gradient(135deg, #7c3aed, #3b82f6)" : "#383a40",
                  color: "#fff", borderRadius: 14,
                  borderBottomRightRadius: meu ? 4 : 14,
                  borderBottomLeftRadius: meu ? 14 : 4,
                  padding: (m.conteudo ? "8px 12px" : 4),
                  wordBreak: "break-word",
                }}
              >
                {m.conteudo && <span style={{ fontSize: 14 }}>{m.conteudo}</span>}
                {m.arquivo_tipo === "image" && (
                  <img src={m.arquivo_url} alt="" onClick={() => onImagem(m.arquivo_url)}
                    style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 10, objectFit: "cover", display: "block", cursor: "pointer" }} />
                )}
                {m.arquivo_tipo === "video" && (
                  <video src={m.arquivo_url} controls style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 10, display: "block" }} />
                )}
                {m.arquivo_tipo === "file" && (
                  <a href={m.arquivo_url} target="_blank" rel="noreferrer" style={{ color: "#fff", fontSize: 14, textDecoration: "underline" }}>Baixar arquivo</a>
                )}
              </motion.div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>
      <div style={{ padding: 12, borderTop: "1px solid #1e1f22", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.85 }} whileHover={{ scale: 1.05 }}
          onClick={() => fileRef.current?.click()}
          disabled={enviando}
          style={{ background: "#404249", border: "none", color: "#dbdee1", borderRadius: 8, width: 40, height: 40, cursor: "pointer", fontSize: 18, flexShrink: 0 }}
          title="Enviar imagem ou video"
        >{enviando ? "..." : "+"}</motion.button>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={enviarArquivo} style={{ display: "none" }} />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviarTexto(); }}
          placeholder="Mensagem..."
          style={{ flex: 1, minWidth: 0, background: "#383a40", border: "none", color: "#dbdee1", borderRadius: 8, padding: "11px 12px", fontSize: 14, outline: "none" }}
        />
        <motion.button
          whileTap={{ scale: 0.85 }} whileHover={{ scale: 1.05 }}
          onClick={enviarTexto}
          style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 8, width: 40, height: 40, cursor: "pointer", fontSize: 16, flexShrink: 0, boxShadow: "0 3px 10px rgba(124,58,237,0.4)" }}
          title="Enviar"
        >➤</motion.button>
      </div>
    </div>
  );
}

export default function Sala({ salaId, nomeServidor, onSair }) {
  const participants = useParticipants();
  const screenShares = useTracks([Track.Source.ScreenShare]);
  const [chatAberto, setChatAberto] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 900);
  const [perfis, setPerfis] = useState({});
  const [imagemAberta, setImagemAberta] = useState(null);
  const [chatRecolhido, setChatRecolhido] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    supabase.from("perfis").select("email_nome, username, avatar_url").then(({ data }) => {
      if (!data) return;
      const mapa = {};
      data.forEach((p) => {
        if (p.avatar_url) {
          if (p.email_nome) mapa[p.email_nome] = p.avatar_url;
          if (p.username) mapa[p.username] = p.avatar_url;
        }
      });
      setPerfis(mapa);
    });
  }, []);

  const eu = participants.find((p) => p.isLocal);
  const meuNome = eu?.identity || "convidado";

  function telaCheia() {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  // ---- Bloco: area principal da call (transmissao + grid) ----
  const areaCall = (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 24 }}>
      {screenShares.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {screenShares.map((track) => (
            <div key={track.publication.trackSid} style={{ position: "relative" }}>
              <video
                ref={(el) => { if (el) { track.publication.track?.attach(el); videoRef.current = el; } }}
                autoPlay style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain", display: "block", margin: "0 auto", borderRadius: 12, background: "#000" }} />
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
                onClick={telaCheia}
                style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16 }}
                title="Tela cheia">⛶</motion.button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        <AnimatePresence>
          {participants.map((p) => <Avatar key={p.sid} participant={p} avatarUrl={perfis[p.identity]} />)}
        </AnimatePresence>
      </div>
    </div>
  );

  // ================= MOBILE =================
  if (mobile) {
    return (
      <LayoutContextProvider>
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0d0e11" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontWeight: 800, color: "#f2f3f5", fontSize: 16 }}>{nomeServidor}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#b5bac1", fontSize: 13, marginLeft: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#23a559", display: "inline-block", boxShadow: "0 0 8px #23a559" }} />
              {participants.length}
            </span>
            <motion.button whileTap={{ scale: 0.9 }}
              onClick={() => setChatAberto(true)}
              style={{ marginLeft: "auto", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontSize: 14, fontWeight: 700, boxShadow: "0 3px 12px rgba(124,58,237,0.4)" }}
            >💬 Chat</motion.button>
          </div>

          {areaCall}

          <RoomAudioRenderer />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(20,21,24,0.9)", flexShrink: 0 }}>
            <ControlBar variation="minimal" controls={{ microphone: true, screenShare: true, camera: false, chat: false, leave: true }} />
          </div>

          {chatAberto && (
            <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#2b2d31" }}>
              <Chat salaId={salaId} meuNome={meuNome} mobile={true} onFechar={() => setChatAberto(false)} onImagem={setImagemAberta} />
            </div>
          )}

          <Lightbox imagem={imagemAberta} fechar={() => setImagemAberta(null)} />
        </div>
      </LayoutContextProvider>
    );
  }

  // ================= DESKTOP (3 colunas) =================
  return (
    <LayoutContextProvider>
      <div style={{ height: "100vh", display: "flex", background: "#0d0e11", overflow: "hidden" }}>
        {/* Coluna 1: servidor + canal + participantes */}
        <div style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", background: "rgba(20,21,24,0.9)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ padding: "16px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <motion.button whileTap={{ scale: 0.85 }} onClick={onSair}
              style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#f2f3f5", fontSize: 18, width: 34, height: 34, borderRadius: 8, cursor: "pointer", flexShrink: 0 }}
              title="Sair do servidor">←</motion.button>
            <span style={{ fontWeight: 800, color: "#f2f3f5", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeServidor}</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5, padding: "0 8px", marginBottom: 8 }}>CANAIS DE VOZ</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(59,130,246,0.2))", color: "#f2f3f5", fontWeight: 700, fontSize: 14 }}>
              🔊 Geral
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#23a559", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#23a559", boxShadow: "0 0 6px #23a559" }} />
                {participants.length}
              </span>
            </div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2, paddingLeft: 4 }}>
              {participants.map((p) => <ParticipanteMini key={p.sid} participant={p} avatarUrl={perfis[p.identity]} />)}
            </div>
          </div>

          <RoomAudioRenderer />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,16,19,0.9)", flexShrink: 0 }}>
            <ControlBar variation="minimal" controls={{ microphone: true, screenShare: true, camera: false, chat: false, leave: true }} />
          </div>
        </div>

        {/* Coluna 2: call central */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-10%", left: "-8%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.12), transparent 70%)", filter: "blur(50px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "-10%", right: "-8%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.10), transparent 70%)", filter: "blur(50px)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {areaCall}
          </div>
        </div>

        {/* Coluna 3: chat (recolhivel) */}
        {!chatRecolhido && (
          <div style={{ width: 340, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            <Chat salaId={salaId} meuNome={meuNome} mobile={false} onImagem={setImagemAberta} onRecolher={() => setChatRecolhido(true)} />
          </div>
        )}
        {chatRecolhido && (
          <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
            onClick={() => setChatRecolhido(false)}
            style={{ position: "fixed", bottom: 20, right: 20, zIndex: 40, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 14, padding: "12px 18px", cursor: "pointer", fontSize: 15, fontWeight: 700, boxShadow: "0 6px 20px rgba(124,58,237,0.5)" }}
            title="Abrir chat">💬 Chat</motion.button>
        )}

        <Lightbox imagem={imagemAberta} fechar={() => setImagemAberta(null)} />
      </div>
    </LayoutContextProvider>
  );
}

// ---- Lightbox de imagem ----
function Lightbox({ imagem, fechar }) {
  return (
    <AnimatePresence>
      {imagem && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={fechar}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}
        >
          <motion.img
            initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
            src={imagem} alt=""
            style={{ maxWidth: "95%", maxHeight: "95%", borderRadius: 8, objectFit: "contain" }} />
          <button onClick={fechar}
            style={{ position: "fixed", top: 20, right: 20, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 22, width: 44, height: 44, borderRadius: "50%", cursor: "pointer" }}>✕</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
