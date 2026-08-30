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

function Avatar({ participant }) {
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
        boxShadow: falando && !mutado ? "0 0 0 3px #23a559" : "0 0 0 1px #1e1f22",
        transition: "box-shadow 0.1s ease",
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
      <div style={{
        width: 80, height: 80, borderRadius: "50%", background: "#5865f2",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, fontWeight: 700, color: "#fff",
      }}>{inicial}</div>
      <span style={{ marginTop: 12, color: "#f2f3f5", fontWeight: 600, fontSize: 15 }}>{nome}</span>
    </motion.div>
  );
}

function Chat({ salaId, meuNome }) {
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
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1f22", color: "#f2f3f5", fontWeight: 700, fontSize: 15 }}>
        Chat
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {mensagens.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "#b5bac1", fontSize: 12, fontWeight: 600 }}>{m.autor}</span>
            {m.conteudo && (
              <span style={{ color: "#dbdee1", fontSize: 14, wordBreak: "break-word" }}>{m.conteudo}</span>
            )}
            {m.arquivo_tipo === "image" && (
              <img src={m.arquivo_url} alt="" style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8, objectFit: "cover" }} />
            )}
            {m.arquivo_tipo === "video" && (
              <video src={m.arquivo_url} controls style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 8 }} />
            )}
            {m.arquivo_tipo === "file" && (
              <a href={m.arquivo_url} target="_blank" rel="noreferrer" style={{ color: "#00a8fc", fontSize: 14 }}>Baixar arquivo</a>
            )}
          </div>
        ))}
        <div ref={fimRef} />
      </div>
      <div style={{ padding: 12, borderTop: "1px solid #1e1f22", display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={enviando}
          style={{ background: "#404249", border: "none", color: "#dbdee1", borderRadius: 8, width: 38, height: 38, cursor: "pointer", fontSize: 18, flexShrink: 0 }}
          title="Enviar imagem ou video"
        >{enviando ? "..." : "+"}</button>
        <input ref={fileRef} type="file" accept="image/*,video/*" onChange={enviarArquivo} style={{ display: "none" }} />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") enviarTexto(); }}
          placeholder="Mensagem..."
          style={{ flex: 1, background: "#383a40", border: "none", color: "#dbdee1", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none" }}
        />
      </div>
    </div>
  );
}

export default function Sala({ salaId, nomeServidor }) {
  const participants = useParticipants();
  const screenShares = useTracks([Track.Source.ScreenShare]);
  const [chatAberto, setChatAberto] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const eu = participants.find((p) => p.isLocal);
  const meuNome = eu?.identity || "convidado";

  return (
    <LayoutContextProvider>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#313338" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e1f22", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, color: "#f2f3f5", fontSize: 16 }}>{nomeServidor}</span>
          <span style={{ color: "#b5bac1", fontSize: 14, marginLeft: 8 }}>{participants.length} online</span>
          <button
            onClick={() => setChatAberto((v) => !v)}
            style={{ marginLeft: "auto", background: "#404249", border: "none", color: "#dbdee1", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >{chatAberto ? "Fechar chat" : "Chat"}</button>
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
                {participants.map((p) => <Avatar key={p.sid} participant={p} />)}
              </AnimatePresence>
            </div>
          </div>

          {chatAberto && (
            <div style={
              mobile
                ? { position: "fixed", top: 0, right: 0, bottom: 0, width: "100%", maxWidth: 400, zIndex: 50, boxShadow: "-4px 0 20px rgba(0,0,0,0.5)" }
                : { width: 340, flexShrink: 0, borderLeft: "1px solid #1e1f22" }
            }>
              <Chat salaId={salaId} meuNome={meuNome} />
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