import { useState, useEffect } from "react";
import { supabase } from "./supabase";
export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState("entrar");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  async function handle() {
    setErro("");
    setCarregando(true);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setErro("Email ou senha incorretos");
    } else {
      const { error } = await supabase.auth.signUp({ email, password: senha });
      if (error) setErro(error.message);
      else setErro("Conta criada! Agora entre.");
    }
    setCarregando(false);
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
          onKeyDown={(e) => e.key === "Enter" && handle()} style={estilos.input} />
        <label style={estilos.label}>SENHA</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle()} style={estilos.input} />
        <button onClick={handle} disabled={carregando} style={{ ...estilos.botao, opacity: carregando ? 0.7 : 1 }}>
          {carregando ? "..." : modo === "entrar" ? "Entrar" : "Continuar"}
        </button>
        {erro && <p style={estilos.erro}>{erro}</p>}
        <p style={estilos.troca}>
          {modo === "entrar" ? "Precisa de uma conta? " : "Já tem conta? "}
          <span style={estilos.link} onClick={() => { setModo(modo === "entrar" ? "cadastrar" : "entrar"); setErro(""); }}>
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
  botao: { width: "100%", padding: 13, marginTop: 24, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #7c3aed, #3b82f6)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" },
  erro: { color: "#f0b232", fontSize: 13, marginTop: 12, textAlign: "center" },
  troca: { fontSize: 14, color: "#b5bac1", marginTop: 20, textAlign: "center" },
  link: { color: "#8b5cf6", cursor: "pointer", fontWeight: 600 },
};
