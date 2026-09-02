import {
  useParticipants,
  useTracks,
  useLocalParticipant,
  AudioTrack,
  VideoTrack,
  LayoutContextProvider,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";

// som de notificação de mensagem nova (arquivo no bucket público 'assets')
const SOM_MENSAGEM = "https://jdmoprahepzbpmuttywd.supabase.co/storage/v1/object/public/assets/som-mensagem.mp3";
// som tocado quando alguém inicia uma transmissão de tela
const SOM_TRANSMISSAO = "https://jdmoprahepzbpmuttywd.supabase.co/storage/v1/object/public/assets/som-transmissao.mp3";

const CORES = ["#a855f7", "#3b82f6", "#06b6d4", "#ec4899", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];
function corDoNome(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = nome.charCodeAt(i) + ((h << 5) - h);
  return CORES[Math.abs(h) % CORES.length];
}

// hora HH:MM da mensagem (estilo WhatsApp)
function horaMsg(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ---- Avatar grande (grid central) ----
function Avatar({ participant, avatarUrl, onVolume }) {
  const [falando, setFalando] = useState(participant.isSpeaking);
  const [mutado, setMutado] = useState(!participant.isMicrophoneEnabled);
  const [transmitindo, setTransmitindo] = useState(participant.isScreenShareEnabled);
  const [comCamera, setComCamera] = useState(participant.isCameraEnabled);
  useEffect(() => {
    const updateFala = () => setFalando(participant.isSpeaking);
    const updateTracks = () => {
      setMutado(!participant.isMicrophoneEnabled);
      setTransmitindo(participant.isScreenShareEnabled);
      setComCamera(participant.isCameraEnabled);
    };
    participant.on("isSpeakingChanged", updateFala);
    participant.on("trackMuted", updateTracks);
    participant.on("trackUnmuted", updateTracks);
    participant.on("trackPublished", updateTracks);
    participant.on("trackUnpublished", updateTracks);
    updateTracks();
    return () => {
      participant.off("isSpeakingChanged", updateFala);
      participant.off("trackMuted", updateTracks);
      participant.off("trackUnmuted", updateTracks);
      participant.off("trackPublished", updateTracks);
      participant.off("trackUnpublished", updateTracks);
    };
  }, [participant]);
  const nome = participant.identity || "?";
  const inicial = nome.charAt(0).toUpperCase();
  const cor = corDoNome(nome);
  const ativo = falando && !mutado;
  const remoto = !participant.isLocal;
  // pega a publicação de vídeo da câmera (pra renderizar o VideoTrack)
  const camPub = participant.getTrackPublication
    ? participant.getTrackPublication(Track.Source.Camera)
    : null;
  const [volume, setVolumeState] = useState(100);
  const [mostrarVol, setMostrarVol] = useState(false);
  function mudarVolume(v) {
    setVolumeState(v);
    if (onVolume) onVolume(nome, v);
  }
  return (
    <motion.div
      layout
      onContextMenu={remoto ? (e) => { e.preventDefault(); setMostrarVol((v) => !v); } : undefined}
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
      {/* Webcam preenchendo o card inteiro */}
      {comCamera && camPub && (
        <div style={{ position: "absolute", inset: 0, borderRadius: 14, overflow: "hidden", zIndex: 0 }}>
          <VideoTrack trackRef={{ participant, publication: camPub, source: Track.Source.Camera }}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }} />
          <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
            onClick={(e) => {
              const card = e.currentTarget.closest("div");
              const v = card && card.querySelector("video");
              if (!v) return;
              if (v.requestFullscreen) v.requestFullscreen();
              else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
              else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iOS
            }}
            style={{ position: "absolute", top: 10, right: 10, zIndex: 4, background: "rgba(0,0,0,0.55)", border: "none", color: "#fff", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Tela cheia">⛶</motion.button>
        </div>
      )}
      {mutado && (
        <div style={{
          position: "absolute", top: 12, right: 12,
          width: 28, height: 28, borderRadius: "50%", background: "#f23f43",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, color: "#fff",
        }} title="Microfone silenciado">🔇</div>
      )}
      {transmitindo && (
        <div style={{
          position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 5,
          background: "#f23f43", color: "#fff", fontSize: 10, fontWeight: 800,
          padding: "3px 8px", borderRadius: 20, letterSpacing: 0.5,
        }} title="Transmitindo agora">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} /> AO VIVO
        </div>
      )}
      {!(comCamera && camPub) && (
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
      )}
      <span style={{
        marginTop: (comCamera && camPub) ? 0 : 12,
        color: "#f2f3f5", fontWeight: 600, fontSize: 15,
        position: (comCamera && camPub) ? "absolute" : "static",
        bottom: (comCamera && camPub) ? 10 : "auto", left: (comCamera && camPub) ? 12 : "auto",
        zIndex: 3, textShadow: (comCamera && camPub) ? "0 1px 4px rgba(0,0,0,0.9)" : "none",
      }}>{nome}</span>
      {remoto && (
        <div style={{ marginTop: 10, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={() => setMostrarVol((v) => !v)}
            style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#b5bac1", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
            title="Volume desta pessoa (ou botão direito no card)">
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
  const [transmitindo, setTransmitindo] = useState(participant.isScreenShareEnabled);
  useEffect(() => {
    const uf = () => setFalando(participant.isSpeaking);
    const um = () => { setMutado(!participant.isMicrophoneEnabled); setTransmitindo(participant.isScreenShareEnabled); };
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
      {transmitindo && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#f23f43", padding: "2px 6px", borderRadius: 10 }} title="Transmitindo">AO VIVO</span>}
      {mutado && <span style={{ fontSize: 13 }} title="Mutado">🔇</span>}
    </div>
  );
}

// ---- Chat ----
function Chat({ canalId, meuNome, onFechar, mobile, onImagem, onRecolher, canais = [], canalAtual, onTrocarCanal, onCriarCanal, criandoCanal, souDono }) {
  const nomeCanal = canais.find((c) => c.id === canalId)?.nome || "chat";
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [digitando, setDigitando] = useState([]); // nomes de quem esta digitando
  const [hoverMsg, setHoverMsg] = useState(null); // id da msg com mouse em cima
  const [avisoFlood, setAvisoFlood] = useState(""); // aviso de rate limit
  const fimRef = useRef(null);
  const fileRef = useRef(null);
  const digCanalRef = useRef(null);
  const digTimers = useRef({});   // nome -> timeout pra remover
  const meuTimer = useRef(null);

  useEffect(() => {
    if (!canalId) return;
    let ativo = true;
    setMensagens([]);
    supabase
      .from("mensagens")
      .select("*")
      .eq("canal_id", canalId)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (ativo && data) setMensagens(data); });

    const canal = supabase
      .channel("canal-" + canalId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "mensagens", filter: "canal_id=eq." + canalId },
        (payload) => {
          if (payload.new.autor !== meuNome) {
            try { const a = new Audio(SOM_MENSAGEM); a.volume = 0.5; a.play(); } catch (e) {}
          }
          setMensagens((m) => [...m, payload.new]);
        }
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "mensagens" },
        (payload) => setMensagens((m) => m.filter((x) => x.id !== payload.old.id))
      )
      .subscribe();

    return () => { ativo = false; supabase.removeChannel(canal); };
  }, [canalId]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // Canal de "esta digitando" (broadcast)
  useEffect(() => {
    if (!canalId) return;
    const canal = supabase.channel("dig-" + canalId, { config: { broadcast: { self: false } } });
    canal.on("broadcast", { event: "digitando" }, ({ payload }) => {
      const quem = payload?.nome;
      if (!quem || quem === meuNome) return;
      setDigitando((lista) => lista.includes(quem) ? lista : [...lista, quem]);
      clearTimeout(digTimers.current[quem]);
      digTimers.current[quem] = setTimeout(() => {
        setDigitando((lista) => lista.filter((n) => n !== quem));
      }, 3000);
    });
    canal.on("broadcast", { event: "parou" }, ({ payload }) => {
      const quem = payload?.nome;
      if (!quem) return;
      clearTimeout(digTimers.current[quem]);
      setDigitando((lista) => lista.filter((n) => n !== quem));
    });
    canal.subscribe();
    digCanalRef.current = canal;
    return () => { supabase.removeChannel(canal); digCanalRef.current = null; };
  }, [canalId, meuNome]);

  function avisarDigitando() {
    const c = digCanalRef.current;
    if (!c) return;
    c.send({ type: "broadcast", event: "digitando", payload: { nome: meuNome } });
    clearTimeout(meuTimer.current);
    meuTimer.current = setTimeout(() => {
      c.send({ type: "broadcast", event: "parou", payload: { nome: meuNome } });
    }, 2500);
  }
  function pareiDigitar() {
    const c = digCanalRef.current;
    if (!c) return;
    clearTimeout(meuTimer.current);
    c.send({ type: "broadcast", event: "parou", payload: { nome: meuNome } });
  }

  async function apagarMensagem(id) {
    if (!window.confirm("Apagar esta mensagem?")) return;
    // some na hora localmente
    setMensagens((m) => m.filter((x) => x.id !== id));
    const { error } = await supabase.from("mensagens").delete().eq("id", id);
    if (error) alert("Não foi possível apagar: " + error.message);
  }

  async function enviarTexto() {
    const t = texto.trim();
    if (!t || !canalId) return;
    setTexto("");
    pareiDigitar();
    const { error } = await supabase.from("mensagens").insert({
      canal_id: canalId, autor: meuNome, conteudo: t,
    });
    if (error) {
      if (error.message && error.message.includes("RATE_LIMIT")) {
        setTexto(t); // devolve o texto pro campo
        setAvisoFlood("Você está enviando rápido demais. Espere um instante.");
        setTimeout(() => setAvisoFlood(""), 3000);
      } else {
        setAvisoFlood("Não foi possível enviar a mensagem.");
        setTimeout(() => setAvisoFlood(""), 3000);
      }
    }
  }

  async function enviarArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const ext = file.name.split(".").pop();
      const caminho = `${canalId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chat-files").upload(caminho, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("chat-files").getPublicUrl(caminho);
      const tipo = file.type.startsWith("video") ? "video"
        : file.type.startsWith("image") ? "image" : "file";
      const { error: msgErr } = await supabase.from("mensagens").insert({
        canal_id: canalId, autor: meuNome,
        arquivo_url: urlData.publicUrl, arquivo_tipo: tipo,
      });
      if (msgErr) {
        if (msgErr.message && msgErr.message.includes("RATE_LIMIT")) {
          setAvisoFlood("Você está enviando rápido demais. Espere um instante.");
          setTimeout(() => setAvisoFlood(""), 3000);
        } else { throw msgErr; }
      }
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
            style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "#f2f3f5", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
            title="Fechar"
          >✕</motion.button>
        )}
        <span style={{ color: "#8b8f96" }}>#</span> {nomeCanal}
        {!mobile && onRecolher && (
          <motion.button whileTap={{ scale: 0.85 }} onClick={onRecolher}
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.08)", border: "none", color: "#f2f3f5", fontSize: 16, width: 30, height: 30, borderRadius: 8, cursor: "pointer" }}
            title="Fechar chat">✕</motion.button>
        )}
      </div>
      {mobile && canais.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "8px 10px", overflowX: "auto", borderBottom: "1px solid #1e1f22", background: "#232428", flexShrink: 0 }}>
          {canais.map((c) => {
            const sel = c.id === canalAtual;
            return (
              <button key={c.id} onClick={() => onTrocarCanal && onTrocarCanal(c.id)}
                style={{ flexShrink: 0, border: "none", cursor: "pointer", borderRadius: 20, padding: "6px 14px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                  background: sel ? "linear-gradient(135deg, #7c3aed, #3b82f6)" : "#383a40",
                  color: sel ? "#fff" : "#b5bac1" }}>
                # {c.nome}
              </button>
            );
          })}
          <button onClick={() => onCriarCanal && onCriarCanal()} disabled={criandoCanal}
            style={{ flexShrink: 0, border: "none", cursor: "pointer", borderRadius: 20, padding: "6px 14px", fontSize: 15, fontWeight: 700, background: "#383a40", color: "#b5bac1" }}
            title="Criar canal">{criandoCanal ? "…" : "+"}</button>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {mensagens.map((m, i) => {
          const meu = m.autor === meuNome;
          const anterior = mensagens[i - 1];
          const mostrarNome = !anterior || anterior.autor !== m.autor;
          const cor = corDoNome(m.autor || "?");
          const podeApagar = meu || souDono;
          return (
            <div key={m.id}
              onMouseEnter={() => setHoverMsg(m.id)}
              onMouseLeave={() => setHoverMsg((h) => (h === m.id ? null : h))}
              style={{ display: "flex", flexDirection: "column", alignItems: meu ? "flex-end" : "flex-start", marginTop: mostrarNome ? 6 : 0 }}>
              {mostrarNome && !meu && (
                <span style={{ color: cor, fontSize: 12, fontWeight: 700, marginBottom: 2, marginLeft: 4 }}>{m.autor}</span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: meu ? "row" : "row-reverse", maxWidth: "85%" }}>
                {podeApagar && (mobile || hoverMsg === m.id) && (
                  <button onClick={() => apagarMensagem(m.id)}
                    style={{ flexShrink: 0, background: "rgba(242,63,67,0.15)", border: "none", color: "#f23f43", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                    title="Apagar mensagem">🗑</button>
                )}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                style={{
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
                {horaMsg(m.created_at) && (
                  <div style={{
                    fontSize: 10, color: meu ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)",
                    textAlign: "right", marginTop: 2, lineHeight: 1,
                    paddingLeft: m.conteudo ? 8 : 6, paddingRight: m.conteudo ? 0 : 4,
                    paddingBottom: m.conteudo ? 0 : 4,
                  }}>{horaMsg(m.created_at)}</div>
                )}
              </motion.div>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>
      <AnimatePresence>
        {digitando.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ padding: "4px 16px", color: "#b5bac1", fontSize: 12, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            <span style={{ display: "inline-flex", gap: 2 }}>
              {[0, 1, 2].map((i) => (
                <motion.span key={i}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  style={{ width: 4, height: 4, borderRadius: "50%", background: "#b5bac1", display: "inline-block" }} />
              ))}
            </span>
            {digitando.length === 1 ? `${digitando[0]} está digitando` : `${digitando.length} pessoas estão digitando`}
          </motion.div>
        )}
      </AnimatePresence>
      {avisoFlood && (
        <div style={{ padding: "8px 14px", background: "rgba(240,178,50,0.12)", borderTop: "1px solid rgba(240,178,50,0.3)", color: "#f0b232", fontSize: 13, fontWeight: 600, textAlign: "center", flexShrink: 0 }}>
          ⏳ {avisoFlood}
        </div>
      )}
      <div style={{ padding: 12, paddingBottom: mobile ? "calc(12px + env(safe-area-inset-bottom))" : 12, borderTop: "1px solid #1e1f22", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
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
          onChange={(e) => { setTexto(e.target.value); if (e.target.value) avisarDigitando(); }}
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

// ---- Modal de edição do servidor (só dono) ----
function EditarServidor({ salaId, nomeInicial, avatarInicial, onFechar, onSalvo }) {
  const [nome, setNome] = useState(nomeInicial || "");
  const [avatar, setAvatar] = useState(avatarInicial || "");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  async function trocarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true); setMsg("");
    try {
      const tipoExt = { "image/gif": "gif", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif" };
      const ext = tipoExt[file.type] || "png";
      const caminho = `servidores/${salaId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatares").upload(caminho, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatares").getPublicUrl(caminho);
      setAvatar(data.publicUrl + "?t=" + Date.now());
    } catch (err) {
      setMsg("Erro na foto: " + err.message);
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function salvar() {
    setEnviando(true); setMsg("");
    const { data, error } = await supabase.rpc("editar_servidor", {
      p_id: salaId, p_nome: nome.trim(), p_avatar_url: avatar || null,
    });
    setEnviando(false);
    if (error) { setMsg("Erro: " + error.message); return; }
    if (data) { onSalvo({ nome: data.nome, avatar_url: data.avatar_url }); onFechar(); }
  }

  return (
    <div onClick={onFechar}
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ width: "100%", maxWidth: 380, background: "#141518", borderRadius: 16, border: "1px solid rgba(124,58,237,0.25)", overflow: "hidden", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}>
        <div style={{ height: 64, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", padding: "0 18px" }}>
          <span style={{ fontWeight: 800, color: "#fff", fontSize: 16 }}>Editar servidor</span>
          <button onClick={onFechar} style={{ marginLeft: "auto", background: "rgba(0,0,0,0.25)", border: "none", color: "#fff", fontSize: 16, width: 32, height: 32, borderRadius: "50%", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div onClick={() => fileRef.current?.click()}
              style={{ width: 88, height: 88, borderRadius: "50%", background: avatar ? "#000" : "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "3px solid #2b2d31", overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
              title="Trocar foto">
              {avatar
                ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span style={{ color: "#fff", fontSize: 30, fontWeight: 800 }}>{(nome || "?").charAt(0).toUpperCase()}</span>}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, textAlign: "center", padding: "2px 0" }}>editar</div>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*,image/gif" onChange={trocarFoto} style={{ display: "none" }} />

          <div style={{ fontSize: 10, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5, marginBottom: 8 }}>NOME DO SERVIDOR</div>
          <input value={nome} onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
            style={{ width: "100%", padding: 11, borderRadius: 8, border: "1px solid #2b2d31", background: "#1a1b1e", color: "#f2f3f5", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />

          <motion.button whileTap={{ scale: 0.96 }} onClick={salvar} disabled={enviando}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,0.35)" }}>
            {enviando ? "..." : "Salvar"}
          </motion.button>
          {msg && <p style={{ fontSize: 12, color: "#f0b232", marginTop: 10, textAlign: "center" }}>{msg}</p>}
        </div>
      </motion.div>
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
  const [micVol, setMicVol] = useState({});      // identity -> 0..200
  const [telaVol, setTelaVol] = useState({});    // identity -> 0..200
  const [telaMute, setTelaMute] = useState({});  // identity -> bool
  const [canais, setCanais] = useState([]);      // canais de texto do servidor
  const [canalAtual, setCanalAtual] = useState(null); // id do canal selecionado
  const [criandoCanal, setCriandoCanal] = useState(false);
  const [souDono, setSouDono] = useState(false); // sou dono deste servidor?
  const [srvNome, setSrvNome] = useState(nomeServidor || ""); // nome atual (editável)
  const [srvAvatar, setSrvAvatar] = useState(""); // foto do servidor
  const [editarAberto, setEditarAberto] = useState(false); // modal de edição
  const videoRef = useRef(null);
  const { localParticipant } = useLocalParticipant();
  const micTracks = useTracks([Track.Source.Microphone]);
  const telaAudioTracks = useTracks([Track.Source.ScreenShareAudio]);

  function ajustarMic(identity, v) { setMicVol((m) => ({ ...m, [identity]: v })); }

  // toca um som quando uma NOVA transmissão de tela começa (não toca ao entrar numa call que já tem)
  const contagemTelasAnterior = useRef(null);
  useEffect(() => {
    if (contagemTelasAnterior.current !== null && screenShares.length > contagemTelasAnterior.current) {
      try { const a = new Audio(SOM_TRANSMISSAO); a.volume = 0.5; a.play(); } catch (e) {}
    }
    contagemTelasAnterior.current = screenShares.length;
  }, [screenShares.length]);

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

  // Carrega os canais de texto do servidor
  useEffect(() => {
    if (!salaId) return;
    let ativo = true;
    async function carregar() {
      const { data } = await supabase
        .from("canais")
        .select("*")
        .eq("servidor_id", salaId)
        .order("created_at", { ascending: true });
      if (!ativo || !data) return;
      setCanais(data);
      setCanalAtual((atual) => {
        if (atual && data.some((c) => c.id === atual)) return atual;
        const geral = data.find((c) => c.nome === "geral") || data[0];
        return geral ? geral.id : null;
      });
    }
    carregar();
    // realtime: novos canais aparecem pra todo mundo
    const ch = supabase
      .channel("canais-" + salaId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "canais", filter: "servidor_id=eq." + salaId },
        (payload) => setCanais((cs) => cs.some((c) => c.id === payload.new.id) ? cs : [...cs, payload.new])
      )
      .subscribe();
    return () => { ativo = false; supabase.removeChannel(ch); };
  }, [salaId]);

  // Descobre se sou o dono e carrega dados do servidor (nome, foto)
  useEffect(() => {
    if (!salaId) return;
    let ativo = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const meuId = u?.user?.id;
      const { data } = await supabase
        .from("servidores").select("nome, avatar_url, dono_id").eq("id", salaId).single();
      if (!ativo || !data) return;
      setSrvNome(data.nome || "");
      setSrvAvatar(data.avatar_url || "");
      if (meuId) setSouDono(data.dono_id === meuId);
    })();
    return () => { ativo = false; };
  }, [salaId]);

  async function criarCanal() {
    const nome = window.prompt("Nome do canal (ex: memes, jogos):");
    if (!nome || !nome.trim()) return;
    setCriandoCanal(true);
    const { data, error } = await supabase.rpc("criar_canal", {
      p_servidor_id: salaId, p_nome: nome.trim(),
    });
    setCriandoCanal(false);
    if (error) { alert("Erro ao criar canal: " + error.message); return; }
    if (data) {
      setCanais((cs) => cs.some((c) => c.id === data.id) ? cs : [...cs, data]);
      setCanalAtual(data.id);
    }
  }

  const eu = participants.find((p) => p.isLocal);
  const meuNome = eu?.identity || "convidado";

  function telaCheia(el) {
    const alvo = el || videoRef.current;
    if (!alvo) return;
    if (alvo.requestFullscreen) alvo.requestFullscreen();
    else if (alvo.webkitRequestFullscreen) alvo.webkitRequestFullscreen();
  }

  const transmitindo = localParticipant?.isScreenShareEnabled;
  async function toggleTransmissao() {
    try {
      await localParticipant.setScreenShareEnabled(!transmitindo, { audio: true, selfBrowserSurface: "include" });
    } catch (e) { alert("Nao foi possivel iniciar a transmissao: " + e.message); }
  }

  const BotaoTela = () => (
    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.04 }}
      onClick={toggleTransmissao}
      style={{ background: transmitindo ? "#f23f43" : "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
      title={transmitindo ? "Parar transmissao" : "Transmitir tela (com som)"}>
      {transmitindo ? "⏹ Parar" : "🖥 Transmitir"}
    </motion.button>
  );

  // Barra de controles própria (mic, câmera, transmitir, sair)
  const BarraControles = () => {
    const [micOn, setMicOn] = useState(localParticipant?.isMicrophoneEnabled ?? true);
    const [camOn, setCamOn] = useState(localParticipant?.isCameraEnabled ?? false);
    useEffect(() => {
      if (!localParticipant) return;
      const upd = () => {
        setMicOn(localParticipant.isMicrophoneEnabled);
        setCamOn(localParticipant.isCameraEnabled);
      };
      localParticipant.on("trackMuted", upd);
      localParticipant.on("trackUnmuted", upd);
      localParticipant.on("trackPublished", upd);
      localParticipant.on("trackUnpublished", upd);
      upd();
      return () => {
        localParticipant.off("trackMuted", upd);
        localParticipant.off("trackUnmuted", upd);
        localParticipant.off("trackPublished", upd);
        localParticipant.off("trackUnpublished", upd);
      };
    }, [localParticipant]);

    async function toggleMic() {
      try { await localParticipant.setMicrophoneEnabled(!micOn); } catch (e) { alert("Erro no microfone: " + e.message); }
    }
    async function toggleCam() {
      try { await localParticipant.setCameraEnabled(!camOn); } catch (e) { alert("Nao foi possivel ligar a camera: " + e.message); }
    }

    const btnBase = { border: "none", borderRadius: 12, padding: "12px 16px", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", width: "100%" };
    const wrap = mobile
      ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 460, margin: "0 auto" }
      : { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "center" };
    return (
      <div style={wrap}>
        <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.04 }} onClick={toggleMic}
          style={{ ...btnBase, background: micOn ? "rgba(255,255,255,0.1)" : "#f23f43" }}
          title={micOn ? "Silenciar microfone" : "Ativar microfone"}>
          {micOn ? "🎤" : "🔇"} <span>{micOn ? "Microfone" : "Mutado"}</span>
        </motion.button>

        <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.04 }} onClick={toggleCam}
          style={{ ...btnBase, background: camOn ? "linear-gradient(135deg, #7c3aed, #3b82f6)" : "rgba(255,255,255,0.1)" }}
          title={camOn ? "Desligar câmera" : "Ligar câmera"}>
          {camOn ? "📹" : "📷"} <span>{camOn ? "Câmera on" : "Câmera"}</span>
        </motion.button>

        <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.04 }} onClick={toggleTransmissao}
          style={{ ...btnBase, background: transmitindo ? "#f23f43" : "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
          title={transmitindo ? "Parar transmissao" : "Transmitir tela (com som)"}>
          {transmitindo ? "⏹" : "🖥"} <span>{transmitindo ? "Parar" : "Transmitir"}</span>
        </motion.button>

        <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.04 }} onClick={onSair}
          style={{ ...btnBase, background: "rgba(242,63,67,0.15)", color: "#f77", border: "1px solid rgba(242,63,67,0.3)" }}
          title="Sair da call">
          🚪 <span>Sair</span>
        </motion.button>
      </div>
    );
  };

  // Audio invisivel: mic dos participantes + audio das transmissoes, com volume separado
  // IMPORTANTE: elemento JSX (nao componente <RenderAudio/>). Definir como componente
  // dentro do componente fazia o React destruir e recriar todos os AudioTrack a cada
  // render (ex: ao mexer no volume) -> cortava o audio da call. Como elemento, o React
  // so atualiza a prop volume, sem re-anexar os tracks.
  const renderAudio = (
    <>
      {micTracks.filter((t) => !t.participant.isLocal).map((t) => (
        <AudioTrack key={"mic-" + t.publication.trackSid} trackRef={t}
          volume={Math.min(2, (micVol[t.participant.identity] ?? 100) / 100)} />
      ))}
      {telaAudioTracks.filter((t) => !t.participant.isLocal).map((t) => (
        <AudioTrack key={"tela-" + t.publication.trackSid} trackRef={t}
          volume={telaMute[t.participant.identity] ? 0 : Math.min(2, (telaVol[t.participant.identity] ?? 100) / 100)} />
      ))}
    </>
  );

  // ---- Bloco: area principal da call (transmissao + grid) ----
  const areaCall = (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 24 }}>
      {screenShares.length > 0 && (
        <div style={{
          marginBottom: 24, display: "grid", gap: 16,
          gridTemplateColumns: screenShares.length > 1 ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr",
        }}>
          {screenShares.map((track) => {
            const dono = track.participant.identity;
            const temAudio = telaAudioTracks.some((a) => a.participant.identity === dono);
            const mutado = telaMute[dono];
            const vol = telaVol[dono] ?? 100;
            return (
              <div key={track.publication.trackSid} data-tela style={{ position: "relative", background: "#000", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 10, left: 12, zIndex: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20 }}>
                    🖥 {dono}
                  </span>
                  <span style={{ background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4 }}
                    title="Pessoas vendo a transmissão">
                    👁 {Math.max(0, participants.length - 1)}
                  </span>
                </div>
                <video
                  ref={(el) => { if (el) { track.publication.track?.attach(el); videoRef.current = el; } }}
                  onClick={(e) => telaCheia(e.currentTarget)}
                  autoPlay style={{ width: "100%", maxHeight: "60vh", objectFit: "contain", display: "block", background: "#000", cursor: "zoom-in" }} />
                <div style={{ position: "absolute", bottom: 10, right: 10, zIndex: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  {temAudio && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "4px 10px" }}>
                      <button onClick={() => setTelaMute((m) => ({ ...m, [dono]: !m[dono] }))}
                        style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 15 }}
                        title={mutado ? "Ativar som" : "Silenciar som"}>{mutado ? "🔇" : "🔊"}</button>
                      <input type="range" min="0" max="200" value={mutado ? 0 : vol}
                        onChange={(e) => { const v = Number(e.target.value); setTelaVol((s) => ({ ...s, [dono]: v })); setTelaMute((m) => ({ ...m, [dono]: false })); }}
                        style={{ width: 90, accentColor: "#7c3aed", cursor: "pointer" }} />
                    </div>
                  )}
                  <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
                    onClick={(e) => { const cont = e.currentTarget.closest("div[data-tela]"); const v = cont && cont.querySelector("video"); telaCheia(v); }}
                    style={{ background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 16 }}
                    title="Tela cheia">⛶</motion.button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        <AnimatePresence>
          {participants.map((p) => <Avatar key={p.sid} participant={p} avatarUrl={perfis[p.identity]} onVolume={ajustarMic} />)}
        </AnimatePresence>
      </div>
    </div>
  );

  // ================= MOBILE =================
  if (mobile) {
    return (
      <LayoutContextProvider>
        <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#0d0e11" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div onClick={() => souDono && setEditarAberto(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: souDono ? "pointer" : "default", minWidth: 0, flex: 1 }}>
              {srvAvatar
                ? <img src={srvAvatar} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15 }}>{(srvNome || "?").charAt(0).toUpperCase()}</div>}
              <span style={{ fontWeight: 800, color: "#f2f3f5", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{srvNome}</span>
              {souDono && <span style={{ color: "#8b8f96", fontSize: 12, flexShrink: 0 }}>✏️</span>}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#b5bac1", fontSize: 13, flexShrink: 0, marginLeft: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#23a559", boxShadow: "0 0 8px #23a559" }} />
                {participants.length}
              </span>
            </div>
            <motion.button whileTap={{ scale: 0.9 }}
              onClick={() => setChatAberto(true)}
              style={{ flexShrink: 0, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontSize: 14, fontWeight: 700, boxShadow: "0 3px 12px rgba(124,58,237,0.4)" }}
            >💬 Chat</motion.button>
          </div>

          {areaCall}

          {renderAudio}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(20,21,24,0.9)", flexShrink: 0, padding: "10px 12px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
            <BarraControles />
          </div>

          <AnimatePresence>
            {chatAberto && (
              <motion.div
                initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.22, ease: "easeInOut" }}
                style={{ position: "fixed", inset: 0, height: "100dvh", zIndex: 50, background: "#2b2d31", display: "flex", flexDirection: "column" }}>
                <Chat canalId={canalAtual} meuNome={meuNome} mobile={true} onFechar={() => setChatAberto(false)} onImagem={setImagemAberta}
                  canais={canais} canalAtual={canalAtual} onTrocarCanal={setCanalAtual} onCriarCanal={criarCanal} criandoCanal={criandoCanal} souDono={souDono} />
              </motion.div>
            )}
          </AnimatePresence>

          {editarAberto && (
            <EditarServidor salaId={salaId} nomeInicial={srvNome} avatarInicial={srvAvatar}
              onFechar={() => setEditarAberto(false)}
              onSalvo={({ nome, avatar_url }) => { setSrvNome(nome); setSrvAvatar(avatar_url || ""); }} />
          )}
          <Lightbox imagem={imagemAberta} fechar={() => setImagemAberta(null)} />
        </div>
      </LayoutContextProvider>
    );
  }

  // ================= DESKTOP (3 colunas) =================
  return (
    <LayoutContextProvider>
      <div style={{ height: "100dvh", display: "flex", background: "#0d0e11", overflow: "hidden" }}>
        {/* Coluna 1: servidor + canal + participantes */}
        <div style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", background: "rgba(20,21,24,0.9)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ padding: "16px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <motion.button whileTap={{ scale: 0.85 }} onClick={onSair}
              style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "#f2f3f5", fontSize: 18, width: 34, height: 34, borderRadius: 8, cursor: "pointer", flexShrink: 0 }}
              title="Sair do servidor">←</motion.button>
            <div onClick={() => souDono && setEditarAberto(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, cursor: souDono ? "pointer" : "default" }}
              title={souDono ? "Editar servidor" : ""}>
              {srvAvatar && (
                <img src={srvAvatar} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              )}
              <span style={{ fontWeight: 800, color: "#f2f3f5", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{srvNome}</span>
              {souDono && <span style={{ color: "#8b8f96", fontSize: 12, flexShrink: 0 }}>✏️</span>}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", padding: "0 8px", marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5 }}>CANAIS DE TEXTO</span>
              <motion.button whileTap={{ scale: 0.85 }} whileHover={{ scale: 1.15 }}
                onClick={criarCanal} disabled={criandoCanal}
                style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#8b8f96", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 0, width: 20, height: 20 }}
                title="Criar canal">{criandoCanal ? "…" : "+"}</motion.button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 16 }}>
              {canais.map((c) => {
                const sel = c.id === canalAtual;
                return (
                  <motion.button key={c.id} whileTap={{ scale: 0.97 }}
                    onClick={() => { setCanalAtual(c.id); setChatRecolhido(false); setChatAberto(true); }}
                    style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                      background: sel ? "linear-gradient(135deg, rgba(124,58,237,0.25), rgba(59,130,246,0.25))" : "transparent",
                      color: sel ? "#f2f3f5" : "#b5bac1" }}>
                    <span style={{ color: "#8b8f96", fontWeight: 700 }}>#</span> {c.nome}
                  </motion.button>
                );
              })}
            </div>
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

          {renderAudio}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,16,19,0.9)", flexShrink: 0, padding: "12px 10px" }}>
            <BarraControles />
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
        <AnimatePresence initial={false}>
          {!chatRecolhido && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              style={{ flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: 340, height: "100%" }}>
                <Chat canalId={canalAtual} meuNome={meuNome} mobile={false} onImagem={setImagemAberta} onRecolher={() => setChatRecolhido(true)} canais={canais} souDono={souDono} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {chatRecolhido && (
          <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }}
            onClick={() => setChatRecolhido(false)}
            style={{ position: "fixed", bottom: 20, right: 20, zIndex: 40, background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "none", color: "#fff", borderRadius: 14, padding: "12px 18px", cursor: "pointer", fontSize: 15, fontWeight: 700, boxShadow: "0 6px 20px rgba(124,58,237,0.5)" }}
            title="Abrir chat">💬 Chat</motion.button>
        )}

        {editarAberto && (
          <EditarServidor salaId={salaId} nomeInicial={srvNome} avatarInicial={srvAvatar}
            onFechar={() => setEditarAberto(false)}
            onSalvo={({ nome, avatar_url }) => { setSrvNome(nome); setSrvAvatar(avatar_url || ""); }} />
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
