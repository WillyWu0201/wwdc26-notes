// Shared helpers for the Pages Functions (runs in the Cloudflare Workers runtime).
// Session = a JWT we sign ourselves (HMAC-SHA256). The Google id_token is only
// decoded, not signature-verified, because we receive it directly from Google's
// token endpoint over TLS in the server-side code flow (Google documents this as safe).

export interface Env {
  NOTES_KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ALLOWED_EMAIL_DOMAIN?: string; // optional: restrict who can sign in (e.g. cdcoverseas.com)
}

export interface SessionUser {
  email: string;
  name: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function signSession(
  payload: SessionUser,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 30
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const enc = new TextEncoder();
  const head = b64urlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const data = b64urlEncode(enc.encode(JSON.stringify(body)));
  const signingInput = `${head}.${data}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(signingInput)));
  return `${signingInput}.${b64urlEncode(sig)}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const [head, data, sig] = token.split(".");
    if (!head || !data || !sig) return null;
    const enc = new TextEncoder();
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${head}.${data}`)));
    if (b64urlEncode(expected) !== sig) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(data)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

// Decode (NOT verify) a JWT payload — used only on the Google id_token from the token endpoint.
export function decodeJwtPayload(token: string): Record<string, any> {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(token.split(".")[1])));
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(
  name: string,
  value: string,
  opts: { maxAge?: number; path?: string; sameSite?: "Lax" | "Strict" | "None"; httpOnly?: boolean } = {}
): string {
  let s = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) s += `; Max-Age=${opts.maxAge}`;
  s += `; Path=${opts.path ?? "/"}`;
  if (opts.httpOnly !== false) s += `; HttpOnly`;
  s += `; Secure; SameSite=${opts.sameSite ?? "Lax"}`;
  return s;
}

export function randomToken(bytes = 16): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b64urlEncode(b);
}

export async function getUser(request: Request, env: Env): Promise<SessionUser | null> {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return cookies.session ? verifySession(cookies.session, env.SESSION_SECRET) : null;
}
