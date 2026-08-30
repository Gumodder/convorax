import {
  useParticipants,
  useTracks,
  ControlBar,
  RoomAudioRenderer,
  LayoutContextProvider,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Avatar({ participant }) {
  const [falando, setFalando] = useState(participant.isSpeaking);

  useEffect(() => {
    const update = () => setFalando(participant.isSpeaking);
    participant.on("isSpeakingChanged", update);
    return () => participant.off("isSpeakingChanged", update);
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
        padding: 24, minHeight: 160,
        boxShadow: falando ? "0 0 0 3px #23a559" : "0 0 0 1px #1e1f22",
        transition: "box-shadow 0.1s ease",
      }}
    >
      <div style={{
        width: 80, height: 80, borderRadius: "50%", background: "#5865f2",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 32, fontWeight: 700, color: "#fff",
      }}>{inicial}</div>
      <span style={{ marginTop: 12, color: "#f2f3f5", fontWeight: 600, fontSize: 15 }}>{nome}</span>
    </motion.div>
  );
}

export default function Sala({ nomeServidor }) {
  const participants = useParticipants();
  const screenShares = useTracks([Track.Source.ScreenShare]);

  return (
    <LayoutContextProvider>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#313338" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #1e1f22", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔊</span>
          <span style={{ fontWeight: 700, color: "#f2f3f5", fontSize: 16 }}>{nomeServidor}</span>
          <span style={{ color: "#b5bac1", fontSize: 14, marginLeft: 8 }}>{participants.length} online</span>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {screenShares.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {screenShares.map((track) => (
                <video key={track.publication.trackSid}
                  ref={(el) => { if (el) track.publication.track?.attach(el); }}
                  autoPlay style={{ width: "100%", maxWidth: 900, display: "block", margin: "0 auto", borderRadius: 12, background: "#000" }} />
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
            <AnimatePresence>
              {participants.map((p) => <Avatar key={p.sid} participant={p} />)}
            </AnimatePresence>
          </div>
        </div>

        <RoomAudioRenderer />
        <div style={{ borderTop: "1px solid #1e1f22", background: "#1e1f22" }}>
          <ControlBar variation="minimal" controls={{ microphone: true, screenShare: true, camera: false, chat: true, leave: true }} />
        </div>
      </div>
    </LayoutContextProvider>
  );
}