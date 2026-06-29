import { type Env, getUser } from "../../lib/auth";

// Personal marks live under  interest:{email}  -> JSON string[] of session ids.
// Private to each user; nobody else can read another person's list.

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

// GET /api/interest -> { ids: string[] }
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getUser(request, env);
  if (!user) return unauthorized();
  const raw = await env.NOTES_KV.get(`interest:${user.email}`);
  return Response.json({ ids: raw ? JSON.parse(raw) : [] });
};

// POST /api/interest  body: { id: string, on?: boolean }  (on omitted = toggle)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getUser(request, env);
  if (!user) return unauthorized();

  const { id, on } = (await request.json()) as { id?: string; on?: boolean };
  if (typeof id !== "string") return Response.json({ error: "bad request" }, { status: 400 });

  const key = `interest:${user.email}`;
  const set = new Set<string>(JSON.parse((await env.NOTES_KV.get(key)) || "[]"));
  if (on === true) set.add(id);
  else if (on === false) set.delete(id);
  else set.has(id) ? set.delete(id) : set.add(id);

  const ids = [...set];
  await env.NOTES_KV.put(key, JSON.stringify(ids));
  return Response.json({ ids });
};
