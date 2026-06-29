import { type Env, setCookie } from "../../../lib/auth";

// GET /api/auth/logout -> clear the session and return home.
export const onRequestGet: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": setCookie("session", "", { maxAge: 0 }) },
  });
