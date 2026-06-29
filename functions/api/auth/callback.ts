import { type Env, setCookie, parseCookies, decodeJwtPayload, signSession } from "../../../lib/auth";

// GET /api/auth/callback?code=...&state=... -> exchange code, set session cookie, go home.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("Cookie"));

  if (!code || !state || state !== cookies.oauth_state) {
    return new Response("Invalid OAuth state. Please try signing in again.", { status: 400 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return new Response("Token exchange failed.", { status: 502 });

  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return new Response("No id_token returned.", { status: 502 });

  const claims = decodeJwtPayload(tokens.id_token);
  if (claims.aud !== env.GOOGLE_CLIENT_ID) return new Response("Unexpected token audience.", { status: 401 });
  if (!claims.email || claims.email_verified === false) return new Response("Email not verified.", { status: 401 });
  if (env.ALLOWED_EMAIL_DOMAIN && claims.hd !== env.ALLOWED_EMAIL_DOMAIN) {
    return new Response("This account's domain is not allowed.", { status: 403 });
  }

  const session = await signSession({ email: claims.email, name: claims.name || claims.email }, env.SESSION_SECRET);

  const headers = new Headers();
  headers.append("Set-Cookie", setCookie("session", session, { maxAge: 60 * 60 * 24 * 30 }));
  headers.append("Set-Cookie", setCookie("oauth_state", "", { maxAge: 0 }));
  headers.set("Location", "/");
  return new Response(null, { status: 302, headers });
};
