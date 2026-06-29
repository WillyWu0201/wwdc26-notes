// Pipeline step 1 — fetch.
// Scrapes the WWDC26 video index for the session list, then each session page for
// chapters / description / code. Saves raw JSON to .cache/raw/{id}.json (gitignored),
// skipping anything already cached so re-runs are incremental.
//
// NOTE: this targets the page structure observed at build time. Apple occasionally
// changes their markup — if a field comes back empty, adjust the regexes below.
//
// Run:  npm run fetch

import { mkdir, readdir, writeFile } from "node:fs/promises";

const YEAR = "2026";
const INDEX = `https://developer.apple.com/videos/wwdc${YEAR}/`;
const RAW_DIR = ".cache/raw";

const stripTags = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const toSeconds = (mmss: string) => {
  const p = mmss.split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

interface IndexEntry { id: string; title: string; duration: number; }

async function getIndex(): Promise<IndexEntry[]> {
  const html = await (await fetch(INDEX)).text();
  const seen = new Map<string, IndexEntry>();
  // Each session is an <a href=".../wwdc2026/NNN/"> whose text is "Title MM:SS Title".
  const re = new RegExp(`<a[^>]+href="[^"]*\\/videos\\/play\\/wwdc${YEAR}\\/(\\d+)\\/?"[^>]*>([\\s\\S]*?)<\\/a>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const text = decode(stripTags(m[2]));
    const dur = text.match(/(\d+:\d{2}(?::\d{2})?)/);
    const title = dur ? text.slice(0, text.indexOf(dur[1])).trim() : text;
    seen.set(id, { id, title, duration: dur ? toSeconds(dur[1]) : 0 });
  }
  return [...seen.values()];
}

interface RawSession extends IndexEntry {
  description: string;
  chapters: [number, string][];
  code: string[];
}

async function getSession(entry: IndexEntry): Promise<RawSession> {
  const html = await (await fetch(`https://developer.apple.com/videos/play/wwdc${YEAR}/${entry.id}/`)).text();
  const description = decode((html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/) || [])[1] || "");
  const chapters: [number, string][] = [];
  // Chapter anchors carry ?time=SECONDS with the chapter label as text.
  const cre = /\?time=(\d+)"[^>]*>([\s\S]*?)<\/a>/g;
  let cm: RegExpExecArray | null;
  const cseen = new Set<number>();
  while ((cm = cre.exec(html))) {
    const t = Number(cm[1]);
    const label = decode(stripTags(cm[2]));
    if (label && !cseen.has(t)) { cseen.add(t); chapters.push([t, label]); }
  }
  chapters.sort((a, b) => a[0] - b[0]);
  const code: string[] = [];
  const codeRe = /<code[^>]*>([\s\S]*?)<\/code>/g;
  let xm: RegExpExecArray | null;
  while ((xm = codeRe.exec(html))) {
    const block = decode(xm[1].replace(/<[^>]+>/g, ""));
    if (block.trim().length > 12) code.push(block.trim());
  }
  return { ...entry, description, chapters, code };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const done = new Set((await readdir(RAW_DIR).catch(() => [])).map((f) => f.replace(".json", "")));
  const entries = await getIndex();
  console.log(`Index: ${entries.length} sessions. Already cached: ${done.size}.`);
  let n = 0;
  for (const e of entries) {
    if (done.has(e.id)) continue;
    try {
      const raw = await getSession(e);
      await writeFile(`${RAW_DIR}/${e.id}.json`, JSON.stringify(raw, null, 2));
      console.log(`  ✓ ${e.id}  ${e.title}`);
      n++;
      await new Promise((r) => setTimeout(r, 400)); // be polite
    } catch (err) {
      console.warn(`  ! ${e.id} failed:`, (err as Error).message);
    }
  }
  console.log(`Fetched ${n} new sessions into ${RAW_DIR}.`);
}

main();
