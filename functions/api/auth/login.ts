import { type Env, setCookie, randomToken } from "../../../lib/auth";

// GET /api/auth/login -> redirect the browser to Google's consent screen.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  const state = randomToken(16);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  // Hint Google to a workspace domain (and pre-filter) if one is configured.
  if (env.ALLOWED_EMAIL_DOMAIN) params.set("hd", env.ALLOWED_EMAIL_DOMAIN);

  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      // Short-lived state cookie to defend against CSRF on the callback.
      "Set-Cookie": setCookie("oauth_state", state, { maxAge: 600 }),
    },
  });
};
