import { type Env, getUser } from "../../lib/auth";

// Shared team state lives under a single key  claimed  ->
//   { [sessionId]: { email, name, at } }
// Anyone can READ it (so the badge shows for everyone, even logged out).
// Only signed-in users can claim; only the claimer can release.
// Single-key store = last-write-wins. Fine for a small team; if you ever need
// stronger concurrency, split into claimed:{id} keys or use Durable Objects.

const KEY = "claimed";
type ClaimMap = Record<string, { email: string; name: string; at: number }>;

const readMap = async (env: Env): Promise<ClaimMap> => JSON.parse((await env.NOTES_KV.get(KEY)) || "{}");

// GET /api/claimed -> { claimed: ClaimMap }
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({ claimed: await readMap(env) });
};

// POST /api/claimed  body: { id: string, action: "claim" | "release" }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, action } = (await request.json()) as { id?: string; action?: string };
  if (typeof id !== "string") return Response.json({ error: "bad request" }, { status: 400 });

  const map = await readMap(env);

  if (action === "release") {
    if (map[id] && map[id].email !== user.email) {
      return Response.json({ error: "not yours", claimed: map }, { status: 403 });
    }
    delete map[id];
  } else {
    if (map[id] && map[id].email !== user.email) {
      return Response.json({ error: "already claimed", claimed: map }, { status: 409 });
    }
    map[id] = { email: user.email, name: user.name, at: Date.now() };
  }

  await env.NOTES_KV.put(KEY, JSON.stringify(map));
  return Response.json({ claimed: map });
};
