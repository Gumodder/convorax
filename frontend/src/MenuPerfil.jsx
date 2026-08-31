import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabase";

export default function MenuPerfil({ sessao }) {
  const [aberto, setAberto] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [novoUser, setNovoUser] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [msg, setMsg] = useState("");
  const [msgUser, setMsgUser] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  const fileRef = useRef(null);
  const boxRef = useRef(null);
  const email = sessao.user.email;
  const inicial = (username || email).charAt(0).toUpperCase();

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    supabase.from("perfis").select("avatar_url, username").eq("id", sessao.user.id).single()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        if (data?.username) { setUsername(data.username); setNovoUser(data.username); }
      });
  }, [sessao]);

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
      const url = data.publicUrl + "?t=" + Date.now();
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

  async function salvarUsername() {
    setMsgUser("");
    const alvo = novoUser.trim().toLowerCase();
    if (!alvo || alvo === username) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc("definir_username", { novo: alvo });
    setEnviando(false);
    if (error) { setMsgUser("Erro: " + error.message); return; }
    if (data === "ok") { setUsername(alvo); setMsgUser("Nome salvo!"); }
    else if (data === "em_uso") setMsgUser("Esse nome já está em uso");
    else setMsgUser("Nome inválido (3-20, só letras, números, . e _)");
  }

  async function trocarSenha() {
    setMsg("");
    if (!senhaAtual) { setMsg("Digite a senha atual"); return; }
    if (novaSenha.length < 6) { setMsg("Nova senha precisa de 6+ caracteres"); return; }
    setEnviando(true);
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
    if (erroLogin) { setMsg("Senha atual incorreta"); setEnviando(false); return; }
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) setMsg("Erro: " + error.message);
    else { setMsg("Senha alterada!"); setSenhaAtual(""); setNovaSenha(""); }
    setEnviando(false);
  }

  const painelMobile = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%",
    background: "#0d0e11", zIndex: 200, overflowY: "auto",
  };
  const painelDesktop = {
    position: "absolute", top: 54, right: 0, width: 306,
    background: "rgba(20,21,24,0.98)", backdropFilter: "blur(10px)",
    border: "1px solid rgba(124,58,237,0.25)", borderRadius: 16, overflow: "hidden",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.06)", zIndex: 100,
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <motion.button whileTap={{ scale: 0.85 }} whileHover={{ scale: 1.08 }} transition={{ type: "spring", stiffness: 400, damping: 15 }} onClick={() => setAberto((v) => !v)} style={est.botaoFoto} title="Meu perfil">
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
            <div style={{ maxWidth: mobile ? 440 : "none", margin: "0 auto" }}>
              {/* Faixa gradiente com a foto */}
              <div style={est.capa}>
                {mobile && (
                  <button onClick={() => setAberto(false)} style={est.fechar} title="Fechar">✕</button>
                )}
                <div style={est.fotoWrap}>
                  <div style={est.fotoGrande}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 30, fontWeight: 700, color: "#fff" }}>{inicial}</span>}
                  </div>
                </div>
              </div>

              <div style={{ padding: "44px 18px 18px" }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={est.nomeGrande}>{username ? "@" + username : "sem nome"}</div>
                  <div style={est.emailValor}>{email}</div>
                </div>

                <input ref={fileRef} type="file" accept="image/*,image/gif" onChange={trocarFoto} style={{ display: "none" }} />
                <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => fileRef.current?.click()} disabled={enviando} style={est.btnGrad}>
                  {enviando ? "..." : "Trocar foto de perfil"}
                </motion.button>

                <div style={est.divisor} />
                <div style={est.secLabel}>NOME DE USUÁRIO</div>
                <div style={{ position: "relative" }}>
                  <span style={est.arroba}>@</span>
                  <input placeholder="seunome" value={novoUser}
                    onChange={(e) => setNovoUser(e.target.value.toLowerCase())}
                    onKeyDown={(e) => e.key === "Enter" && salvarUsername()}
                    style={{ ...est.input, paddingLeft: 26 }} />
                </div>
                <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={salvarUsername} disabled={enviando} style={est.btnGradSoft}>
                  Salvar nome
                </motion.button>
                {msgUser && <p style={est.msg}>{msgUser}</p>}

                <div style={est.divisor} />
                <div style={est.secLabel}>TROCAR SENHA</div>
                <input type="password" placeholder="Senha atual" value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)} style={est.input} />
                <input type="password" placeholder="Nova senha" value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && trocarSenha()} style={est.input} />
                <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={trocarSenha} disabled={enviando} style={est.btnGradSoft}>
                  Salvar senha
                </motion.button>
                {msg && <p style={est.msg}>{msg}</p>}

                <div style={est.divisor} />
                <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.02 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => supabase.auth.signOut()} style={est.btnSair}>
                  Sair da conta
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const est = {
  botaoFoto: { width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.5)", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  capa: { position: "relative", height: 72, background: "linear-gradient(135deg, #7c3aed, #3b82f6)" },
  fechar: { position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.25)", border: "none", color: "#fff", fontSize: 18, width: 36, height: 36, borderRadius: "50%", cursor: "pointer" },
  fotoWrap: { position: "absolute", left: "50%", bottom: -34, transform: "translateX(-50%)" },
  fotoGrande: { width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", border: "4px solid #141518", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  nomeGrande: { fontSize: 17, fontWeight: 800, color: "#f2f3f5" },
  emailValor: { fontSize: 12, color: "#8b8f96", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 },
  arroba: { position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8b5cf6", fontSize: 14, fontWeight: 700 },
  divisor: { height: 1, background: "rgba(255,255,255,0.08)", margin: "14px 0" },
  secLabel: { fontSize: 10, fontWeight: 700, color: "#8b8f96", letterSpacing: 0.5, marginBottom: 8 },
  input: { width: "100%", padding: 11, borderRadius: 8, border: "1px solid #2b2d31", background: "#1a1b1e", color: "#f2f3f5", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8 },
  btnGrad: { width: "100%", padding: 11, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(124,58,237,0.35)" },
  btnGradSoft: { width: "100%", padding: 11, borderRadius: 8, border: "1px solid rgba(124,58,237,0.4)", background: "rgba(124,58,237,0.15)", color: "#c4b5fd", fontWeight: 700, cursor: "pointer" },
  btnSair: { width: "100%", padding: 11, borderRadius: 8, border: "1px solid rgba(242,63,67,0.3)", background: "rgba(242,63,67,0.12)", color: "#f77", fontWeight: 700, cursor: "pointer" },
  msg: { fontSize: 12, color: "#f0b232", marginTop: 8, textAlign: "center" },
};
