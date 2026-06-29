import { type Env, getUser } from "../../lib/auth";

// GET /api/me -> { user: { email, name } | null }
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getUser(request, env);
  return Response.json({ user });
};
