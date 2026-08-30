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
      <div style={{ ...estilos.card, width: mobile ? "100%" : 420, padding: mobile ? 24 : 32 }}>
        <h1 style={estilos.titulo}>{modo === "entrar" ? "Bem-vindo de volta!" : "Criar uma conta"}</h1>
        <p style={estilos.sub}>{modo === "entrar" ? "Que bom te ver de novo." : "É rapidinho."}</p>

        <label style={estilos.label}>EMAIL</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle()} style={estilos.input} />

        <label style={estilos.label}>SENHA</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle()} style={estilos.input} />

        <button onClick={handle} disabled={carregando} style={estilos.botao}>
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
  tela: { display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#1e1f22", padding: 16 },
  card: { background: "#313338", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  titulo: { fontSize: 24, fontWeight: 600, textAlign: "center", color: "#f2f3f5" },
  sub: { fontSize: 15, color: "#b5bac1", textAlign: "center", marginTop: 6, marginBottom: 24 },
  label: { display: "block", fontSize: 12, fontWeight: 700, color: "#b5bac1", marginTop: 16, marginBottom: 8, letterSpacing: 0.5 },
  input: { width: "100%", padding: 11, borderRadius: 4, border: "none", background: "#1e1f22", color: "#f2f3f5", fontSize: 15 },
  botao: { width: "100%", padding: 12, marginTop: 24, borderRadius: 4, border: "none", background: "#5865f2", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  erro: { color: "#f0b232", fontSize: 13, marginTop: 12, textAlign: "center" },
  troca: { fontSize: 14, color: "#b5bac1", marginTop: 20, textAlign: "center" },
  link: { color: "#00a8fc", cursor: "pointer" },
};