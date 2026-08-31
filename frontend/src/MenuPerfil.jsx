import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";

export default function MenuPerfil({ sessao }) {
  const [aberto, setAberto] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  const fileRef = useRef(null);
  const boxRef = useRef(null);
  const email = sessao.user.email;
  const inicial = email.charAt(0).toUpperCase();

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    supabase.from("perfis").select("avatar_url").eq("id", sessao.user.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url); });
  }, [sessao]);

  // fecha ao clicar fora (so no desktop; no mobile usa o X)
  useEffect(() => {
    if (mobile) return;
    const fora = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [mobile]);

  async function trocarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    setMsg("");
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const caminho = `${sessao.user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatares").upload(caminho, file, { upsert: true, contentType: file.type });
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
    setMsg("");
    if (!senhaAtual) { setMsg("Digite a senha atual"); return; }
    if (novaSenha.length < 6) { setMsg("Nova senha precisa de 6+ caracteres"); return; }
    setEnviando(true);
    // 1) confere a senha atual reautenticando
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
    if (erroLogin) { setMsg("Senha atual incorreta"); setEnviando(false); return; }
    // 2) troca pela nova
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) setMsg("Erro: " + error.message);
    else { setMsg("Senha alterada!"); setSenhaAtual(""); setNovaSenha(""); }
    setEnviando(false);
  }

  const foto = (tam, fonte) => (
    <div style={{ width: tam, height: tam, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: fonte, fontWeight: 700, color: "#fff" }}>{inicial}</span>}
    </div>
  );

  const painelMobile = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%",
    background: "#0d0e11", padding: 20, zIndex: 200, overflowY: "auto",
  };
  const painelDesktop = {
    position: "absolute", top: 54, right: 0, width: 300,
    background: "rgba(24,25,28,0.97)", backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 16,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)", zIndex: 100,
  };

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
            initial={{ opacity: 0, y: mobile ? 0 : -8, scale: mobile ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: mobile ? 0 : -8, scale: mobile ? 1 : 0.96 }}
            transition={{ duration: 0.15 }}
            style={mobile ? painelMobile : painelDesktop}
          >
            {mobile && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button onClick={() => setAberto(false)} style={est.fechar} title="Fechar">✕</button>
              </div>
            )}
            <div style={{ maxWidth: mobile ? 420 : "none", margin: "0 auto" }}>
              <div style={est.topo}>
                {foto(mobile ? 64 : 52, mobile ? 30 : 26)}
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
              <input type="password" placeholder="Senha atual" value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)} style={est.input} />
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const est = {
  botaoFoto: { width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.12)", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  fechar: { background: "rgba(255,255,255,0.08)", border: "none", color: "#f2f3f5", fontSize: 18, width: 36, height: 36, borderRadius: "50%", cursor: "pointer" },
  topo: { display: "flex", gap: 12, alignItems: "center", marginBottom: 16 },
  emailLabel: { fontSize: 10, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5 },
  emailValor: { fontSize: 13, color: "#f2f3f5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  divisor: { height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" },
  secLabel: { fontSize: 10, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5, marginBottom: 8 },
  input: { width: "100%", padding: 11, borderRadius: 8, border: "1px solid #2b2d31", background: "#1a1b1e", color: "#f2f3f5", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8 },
  btnGrad: { width: "100%", padding: 11, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,0.3)" },
  btnCinza: { width: "100%", padding: 11, borderRadius: 8, border: "none", background: "#4e5058", color: "#fff", fontWeight: 600, cursor: "pointer" },
  btnSair: { width: "100%", padding: 11, borderRadius: 8, border: "1px solid rgba(242,63,67,0.3)", background: "rgba(242,63,67,0.12)", color: "#f77", fontWeight: 700, cursor: "pointer" },
  msg: { fontSize: 12, color: "#f0b232", marginTop: 10, textAlign: "center" },
};
