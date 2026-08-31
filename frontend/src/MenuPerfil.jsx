import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";

export default function MenuPerfil({ sessao }) {
  const [aberto, setAberto] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef(null);
  const boxRef = useRef(null);
  const email = sessao.user.email;
  const inicial = email.charAt(0).toUpperCase();

  useEffect(() => {
    supabase.from("perfis").select("avatar_url").eq("id", sessao.user.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url); });
  }, [sessao]);

  // fecha ao clicar fora
  useEffect(() => {
    const fora = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  async function trocarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    setMsg("");
    try {
      const ext = file.name.split(".").pop();
      const caminho = `${sessao.user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatares").upload(caminho, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatares").getPublicUrl(caminho);
      const url = data.publicUrl + "?t=" + Date.now(); // evita cache
      await supabase.from("perfis").update({ avatar_url: url }).eq("id", sessao.user.id);
      setAvatarUrl(url);
      setMsg("Foto atualizada!");
    } catch (err) {
      setMsg("Erro: " + err.message);
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function trocarSenha() {
    if (novaSenha.length < 6) { setMsg("Senha precisa de 6+ caracteres"); return; }
    setEnviando(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) setMsg("Erro: " + error.message);
    else { setMsg("Senha alterada!"); setNovaSenha(""); }
    setEnviando(false);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <motion.button whileTap={{ scale: 0.9 }} onClick={() => setAberto((v) => !v)} style={est.botaoFoto} title="Meu perfil">
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{inicial}</span>}
      </motion.button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={est.painel}
          >
            <div style={est.topo}>
              <div style={est.fotoGrande}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 26, fontWeight: 700, color: "#fff" }}>{inicial}</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={est.emailLabel}>EMAIL</div>
                <div style={est.emailValor}>{email}</div>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/*,image/gif" onChange={trocarFoto} style={{ display: "none" }} />
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => fileRef.current?.click()} disabled={enviando} style={est.btnGrad}>
              {enviando ? "..." : "Trocar foto de perfil"}
            </motion.button>

            <div style={est.divisor} />
            <div style={est.secLabel}>TROCAR SENHA</div>
            <input type="password" placeholder="Nova senha" value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && trocarSenha()} style={est.input} />
            <motion.button whileTap={{ scale: 0.97 }} onClick={trocarSenha} disabled={enviando} style={est.btnCinza}>
              Salvar senha
            </motion.button>

            {msg && <p style={est.msg}>{msg}</p>}

            <div style={est.divisor} />
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => supabase.auth.signOut()} style={est.btnSair}>
              Sair da conta
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const est = {
  botaoFoto: { width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.12)", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  painel: { position: "absolute", top: 54, right: 0, width: 300, background: "rgba(24,25,28,0.97)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.6)", zIndex: 100 },
  topo: { display: "flex", gap: 12, alignItems: "center", marginBottom: 16 },
  fotoGrande: { width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  emailLabel: { fontSize: 10, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5 },
  emailValor: { fontSize: 13, color: "#f2f3f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  divisor: { height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" },
  secLabel: { fontSize: 10, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5, marginBottom: 8 },
  input: { width: "100%", padding: 10, borderRadius: 8, border: "1px solid #2b2d31", background: "#1a1b1e", color: "#f2f3f5", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8 },
  btnGrad: { width: "100%", padding: 10, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontWeight: 700, cursor: "pointer" },
  btnCinza: { width: "100%", padding: 10, borderRadius: 8, border: "none", background: "#4e5058", color: "#fff", fontWeight: 600, cursor: "pointer" },
  btnSair: { width: "100%", padding: 10, borderRadius: 8, border: "1px solid rgba(242,63,67,0.3)", background: "rgba(242,63,67,0.12)", color: "#f77", fontWeight: 700, cursor: "pointer" },
  msg: { fontSize: 12, color: "#f0b232", marginTop: 10, textAlign: "center" },
};
