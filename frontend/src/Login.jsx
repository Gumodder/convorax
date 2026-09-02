import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState("entrar");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  const senhaRef = useRef(null);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  async function handle() {
    setErro("");
    setSucesso("");
    setCarregando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("not confirmed") || msg.includes("confirm")) {
            setErro("Confirme seu email antes de entrar. Veja sua caixa de entrada (e o spam).");
          } else {
            setErro("Email ou senha incorretos");
          }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password: senha });
        if (error) {
          setErro(error.message);
        } else if (data?.user && !data.session) {
          // signup exigindo confirmacao de email (sem sessao imediata)
          setSucesso("Enviamos um link de confirmacao pro seu email. Confirma pra entrar!");
          setModo("entrar");
        } else {
          setSucesso("Conta criada! Ja pode entrar.");
          setModo("entrar");
        }
      }
    } catch (e) {
      setErro("Falha ao conectar: " + (e?.message || "tente de novo"));
    } finally {
      setCarregando(false);
    }
  }
  return (
    <div style={estilos.tela}>
      <div style={estilos.brilho1} />
      <div style={estilos.brilho2} />
      <div style={{ ...estilos.card, width: mobile ? "100%" : 420, padding: mobile ? 28 : 36 }}>
        <img src="/logo.png" alt="Convorax" style={{ width: "80%", maxWidth: 260, display: "block", margin: "0 auto 20px" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <h1 style={estilos.titulo}>{modo === "entrar" ? "Bem-vindo de volta!" : "Criar uma conta"}</h1>
        <p style={estilos.sub}>{modo === "entrar" ? "Que bom te ver de novo." : "É rapidinho."}</p>
        <label style={estilos.label}>EMAIL</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") senhaRef.current?.focus(); }} style={estilos.input} />
        <label style={estilos.label}>SENHA</label>
        <div style={{ position: "relative" }}>
          <input ref={senhaRef} type={mostrarSenha ? "text" : "password"} value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handle()}
            style={{ ...estilos.input, paddingRight: 44 }} />
          <button type="button" onClick={() => setMostrarSenha((v) => !v)}
            style={estilos.olho} title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>
            {mostrarSenha ? "🙈" : "👁️"}
          </button>
        </div>
        <button onClick={handle} disabled={carregando} style={{ ...estilos.botao, opacity: carregando ? 0.7 : 1 }}>
          {carregando ? "..." : modo === "entrar" ? "Entrar" : "Continuar"}
        </button>
        {erro && <p style={estilos.erro}>{erro}</p>}
        {sucesso && <p style={estilos.sucesso}>{sucesso}</p>}
        <p style={estilos.troca}>
          {modo === "entrar" ? "Precisa de uma conta? " : "Já tem conta? "}
          <span style={estilos.link} onClick={() => { setModo(modo === "entrar" ? "cadastrar" : "entrar"); setErro(""); setSucesso(""); }}>
            {modo === "entrar" ? "Cadastre-se" : "Entrar"}
          </span>
        </p>
      </div>
    </div>
  );
}
const estilos = {
  tela: { position: "relative", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#0d0e11", padding: 16, overflow: "hidden" },
  brilho1: { position: "absolute", top: "-15%", left: "-10%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.35), transparent 70%)", filter: "blur(40px)", pointerEvents: "none" },
  brilho2: { position: "absolute", bottom: "-15%", right: "-10%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%)", filter: "blur(40px)", pointerEvents: "none" },
  card: { position: "relative", background: "rgba(30,31,34,0.85)", backdropFilter: "blur(8px)", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.06)" },
  titulo: { fontSize: 24, fontWeight: 700, textAlign: "center", color: "#f2f3f5" },
  sub: { fontSize: 15, color: "#b5bac1", textAlign: "center", marginTop: 6, marginBottom: 24 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#b5bac1", marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  input: { width: "100%", padding: 12, borderRadius: 8, border: "1px solid #2b2d31", background: "#1e1f22", color: "#f2f3f5", fontSize: 15, outline: "none", boxSizing: "border-box" },
  olho: { position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 },
  botao: { width: "100%", padding: 13, marginTop: 24, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" },
  erro: { color: "#f0b232", fontSize: 13, marginTop: 12, textAlign: "center" },
  sucesso: { color: "#23a559", fontSize: 13, marginTop: 12, textAlign: "center", fontWeight: 600 },
  troca: { fontSize: 14, color: "#b5bac1", marginTop: 20, textAlign: "center" },
  link: { color: "#8b5cf6", cursor: "pointer", fontWeight: 600 },
};
