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

// Cor fixa por usuario (mesmo nome -> mesma cor sempre)
const CORES = ["#a855f7", "#3b82f6", "#06b6d4", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];
function corDoNome(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return CORES[Math.abs(h) % CORES.length];
}

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
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", background: "#2b2d31", borderRadius: 12,
        padding: 24, minHeight: 160, position: "relative",
        boxShadow: ativo ? "0 0 0 1px #23a559" : "0 0 0 1px #1e1f22",
        transition: "box-shadow 0.15s ease",
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
        {/* Anel pulsante quando fala */}
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
          background: "#23a559", border: "3px solid #2b2d31",
        }} title="Online" />
      </div>
      <span style={{ marginTop: 12, color: "#f2f3f5", fontWeight: 600, fontSize: 15 }}>{nome}</span>
    </motion.div>
  );
}

function Chat({ salaId, meuNome, onFechar, mobile }) {
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#2b2d31" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1f22", color: "#f2f3f5", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 10 }}>
        {mobile && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onFechar}
            style={{ background: "transparent", border: "none", color: "#f2f3f5", fontSize: 24, cursor: "pointer", padding: 0, lineHeight: 1, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Voltar"
          >←</motion.button>
        )}
        Chat
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
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
                  <img src={m.arquivo_url} alt="" style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 10, objectFit: "cover", display: "block" }} />
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
      <div style={{ padding: 12, borderTop: "1px solid #1e1f22", display: "flex", gap: 8, alignItems: "center" }}>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => fileRef.current?.click()}
          disabled={enviando}
          style={{ background: "#404249", border: "none", color: "#dbdee1", borderRadius: 8, width: 38, height: 38, cursor: "pointer", fontSize: 18, flexShrink: 0 }}
          title="Enviar imagem ou video"
        >{enviando ? "..." : "+"}</motion.button>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={enviarArquivo} style={{ display: "none" }} />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviarTexto(); }}
          placeholder="Mensagem..."
          style={{ flex: 1, background: "#383a40", border: "none", color: "#dbdee1", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" }}
        />
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={enviarTexto}
          style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 8, width: 38, height: 38, cursor: "pointer", fontSize: 16, flexShrink: 0 }}
          title="Enviar"
        >➤</motion.button>
      </div>
    </div>
  );
}

export default function Sala({ salaId, nomeServidor }) {
  const participants = useParticipants();
  const screenShares = useTracks([Track.Source.ScreenShare]);
  const [chatAberto, setChatAberto] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 900);
  const [perfis, setPerfis] = useState({}); // username -> avatar_url

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Carrega mapa de perfis (username -> avatar) pra casar com o identity do participante
  useEffect(() => {
    supabase.from("perfis").select("username, avatar_url").then(({ data }) => {
      if (!data) return;
      const mapa = {};
      data.forEach((p) => { if (p.username) mapa[p.username] = p.avatar_url; });
      setPerfis(mapa);
    });
  }, []);

  const eu = participants.find((p) => p.isLocal);
  const meuNome = eu?.identity || "convidado";

  return (
    <LayoutContextProvider>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#313338" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e1f22", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, color: "#f2f3f5", fontSize: 16 }}>{nomeServidor}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#b5bac1", fontSize: 14, marginLeft: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#23a559", display: "inline-block" }} />
            {participants.length} online
          </span>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setChatAberto((v) => !v)}
            style={{ marginLeft: "auto", background: "#404249", border: "none", color: "#dbdee1", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >{chatAberto ? "Fechar chat" : "Chat"}</motion.button>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            {screenShares.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                {screenShares.map((track) => (
                  <video key={track.publication.trackSid}
                    ref={(el) => { if (el) track.publication.track?.attach(el); }}
                    autoPlay style={{ maxWidth: "100%", maxHeight: "65vh", objectFit: "contain", display: "block", margin: "0 auto", borderRadius: 12, background: "#000" }} />
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
              <AnimatePresence>
                {participants.map((p) => <Avatar key={p.sid} participant={p} avatarUrl={perfis[p.identity]} />)}
              </AnimatePresence>
            </div>
          </div>

          {chatAberto && (
            <div style={
              mobile
                ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100%", zIndex: 50, background: "#2b2d31" }
                : { width: 340, flexShrink: 0, borderLeft: "1px solid #1e1f22" }
            }>
              <Chat salaId={salaId} meuNome={meuNome} mobile={mobile} onFechar={() => setChatAberto(false)} />
            </div>
          )}
        </div>

        <RoomAudioRenderer />
        <div style={{ borderTop: "1px solid #1e1f22", background: "#1e1f22" }}>
          <ControlBar variation="minimal" controls={{ microphone: true, screenShare: true, camera: false, chat: false, leave: true }} />
        </div>
      </div>
    </LayoutContextProvider>
  );
}
