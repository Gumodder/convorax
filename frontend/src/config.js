// Configuracao de ambiente. Tudo aqui vai para o bundle e e PUBLICO — nunca
// coloque segredo. Os valores abaixo sao os de producao; o .env serve para
// apontar o app para outro backend (local, staging) sem mexer no codigo.
//
// O Vite troca import.meta.env.VITE_* por string literal no build, entao
// mudanca de .env exige rodar `npm run build` de novo.

const env = import.meta.env;

// Backend de tokens (o que libera a entrada na call)
export const API_URL = (env.VITE_API_URL || "https://api.convorax.space").replace(/\/+$/, "");

// Servidor LiveKit (WebSocket)
export const LIVEKIT_URL = env.VITE_LIVEKIT_URL || "wss://voz.convorax.space";

// Supabase (a publishable key e publica por design — quem protege os dados e o RLS)
export const SUPABASE_URL = env.VITE_SUPABASE_URL || "https://jdmoprahepzbpmuttywd.supabase.co";
export const SUPABASE_KEY =
  env.VITE_SUPABASE_ANON_KEY || "sb_publishable_Kcf339oAuZsvpsm-ZuGiGg_4QT43uo3";

// Arquivos publicos (sons e banners) ficam no bucket 'assets' do proprio Supabase
export const ASSETS = `${SUPABASE_URL}/storage/v1/object/public/assets`;

// Fallback silencioso e perigoso: um build sem .env sai apontando para a base de
// producao e parece funcionar perfeitamente — o pior tipo de erro. O aviso
// aparece no console do `npm run build`, que e onde a pessoa esta olhando.
for (const [chave, valor] of Object.entries({
  VITE_API_URL: env.VITE_API_URL,
  VITE_LIVEKIT_URL: env.VITE_LIVEKIT_URL,
  VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
})) {
  if (!valor) console.warn(`[config] ${chave} ausente — usando o valor de producao`);
}
