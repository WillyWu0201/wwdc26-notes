import { type Env, getUser } from "../../lib/auth";

// Shared team comments live under a single key  comments  ->
//   { [sessionId]: [ { email, name, text, at } ] }
// Anyone can READ (so the discussion shows for everyone). Only signed-in users can post,
// and only the author can delete their own comment. Single-key store = last-write-wins,
// fine for a small team (same trade-off as claimed.ts).

const KEY = "comments";
type Comment = { email: string; name: string; text: string; at: number };
type CommentMap = Record<string, Comment[]>;

const readMap = async (env: Env): Promise<CommentMap> => JSON.parse((await env.NOTES_KV.get(KEY)) || "{}");

// GET /api/comments -> { comments: CommentMap }
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({ comments: await readMap(env) });
};

// POST /api/comments  body: { id: string, text?: string, action?: "add" | "delete", at?: number }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, text, action, at } = (await request.json()) as { id?: string; text?: string; action?: string; at?: number };
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) return Response.json({ error: "bad request" }, { status: 400 });

  const map = await readMap(env);
  const list = map[id] || [];

  if (action === "delete") {
    map[id] = list.filter((c) => !(c.email === user.email && c.at === at));
  } else {
    const t = (text || "").trim();
    if (!t) return Response.json({ error: "empty comment" }, { status: 400 });
    list.push({ email: user.email, name: user.name, text: t.slice(0, 500), at: Date.now() });
    map[id] = list.slice(-100); // keep the most recent 100 per session
  }

  await env.NOTES_KV.put(KEY, JSON.stringify(map));
  return Response.json({ comments: map });
};
