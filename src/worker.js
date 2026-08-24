const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
async function pbkdf2(password, salt, iterations = 310000) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations }, key, 256);
  return base64Url(new Uint8Array(bits));
}
function cookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "").split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}
async function createSession(username, secret) {
  const payload = base64Url(encoder.encode(JSON.stringify({ username, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return `${payload}.${await hmac(payload, secret)}`;
}
async function validSession(request, secret) {
  const token = cookies(request).fdm_session;
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, await hmac(payload, secret))) return false;
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload))).exp > Date.now();
  } catch (_) { return false; }
}
function loginPage(message = "") {
  const escaped = message.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  return new Response(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Accesso | FinRep</title><style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f6f8;color:#1f2328;display:grid;place-items:center;min-height:100vh}.login{width:min(400px,calc(100% - 32px));background:#fff;border:1px solid #d0d7de;border-radius:10px;padding:28px;box-shadow:0 10px 28px rgba(0,0,0,.08)}h1{font-size:22px;margin:0 0 6px}p{color:#57606a;margin:0 0 22px}.field{margin-bottom:15px}label{display:block;font-weight:600;font-size:14px;margin-bottom:6px}input{width:100%;padding:10px;border:1px solid #d0d7de;border-radius:6px;font:inherit}button{width:100%;padding:11px;border:0;border-radius:6px;background:#1769aa;color:#fff;font-weight:700;cursor:pointer}.error{color:#b42318;background:#fff1f0;border:1px solid #f1aaa4;padding:9px;border-radius:6px;margin-bottom:15px;font-size:14px}</style></head><body><main class="login"><h1>FinRep Flat Data Model</h1><p>Inserisci le credenziali autorizzate.</p>${escaped ? `<div class="error">${escaped}</div>` : ""}<form method="post" action="/auth/login"><div class="field"><label for="username">Nome utente</label><input id="username" name="username" autocomplete="username" required></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button type="submit">Accedi</button></form></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
async function authenticate(request, env) {
  const form = await request.formData();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  let config;
  try { config = JSON.parse(env.USERS_JSON); } catch (_) { return loginPage("Configurazione utenti non valida."); }
  const user = (config.users || []).find((item) => item.username === username && item.enabled !== false);
  if (!user) return loginPage("Credenziali non valide.");
  const hash = await pbkdf2(password, user.salt, user.iterations || 310000);
  if (!safeEqual(hash, user.passwordHash)) return loginPage("Credenziali non valide.");
  const session = await createSession(username, env.SESSION_SECRET);
  return new Response(null, { status: 302, headers: { "Location": "/", "Set-Cookie": `fdm_session=${session}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`, "Cache-Control": "no-store" } });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/auth/login" && request.method === "GET") return loginPage();
    if (url.pathname === "/auth/login" && request.method === "POST") return authenticate(request, env);
    if (url.pathname === "/auth/logout") return new Response(null, { status: 302, headers: { "Location": "/auth/login", "Set-Cookie": "fdm_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict", "Cache-Control": "no-store" } });
    if (!(await validSession(request, env.SESSION_SECRET))) return url.pathname === "/" ? loginPage() : new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
    return env.ASSETS.fetch(request);
  }
};
