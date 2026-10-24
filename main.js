// Agent Debate: Electron main process. Embeds the local API server.
const { app, BrowserWindow, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.DEBATE_MODEL || "claude-haiku-5-5";                 // fast model for spoken lines
const RESEARCH_MODEL = process.env.RESEARCH_MODEL || "claude-sonnet-5-5";     // web research needs a stronger model
const API_KEY = process.env.ANTHROPIC_API_KEY;
const client = API_KEY ? new Anthropic() : null;
const PUBLIC = path.join(__dirname, "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

// Apps launched from Finder don't inherit the shell PATH, so look for the claude CLI explicitly.
function findClaude() {
  const dirs = [path.join(os.homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", ...(process.env.PATH || "").split(":")];
  for (const d of dirs) { const p = path.join(d, "claude"); if (fs.existsSync(p)) return p; }
  return "claude";
}

async function viaApi(system, prompt, maxTokens, web, model) {
  const params = {
    model: model || (web ? RESEARCH_MODEL : MODEL),
    max_tokens: web ? Math.max(maxTokens, 8000) : Math.max(maxTokens, 2000),  // thinking tokens count toward the cap
    system,
    output_config: { effort: "low" },
    ...(web && { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }] }),
  };
  let messages = [{ role: "user", content: prompt }], text = "";
  for (let i = 0; i < 4; i++) {                   // web search can pause the turn; resume it
    const r = await client.messages.create({ ...params, messages });
    text = r.content.filter(b => b.type === "text").map(b => b.text).join("");
    if (r.stop_reason !== "pause_turn") return text.trim();
    messages = [{ role: "user", content: prompt }, { role: "assistant", content: r.content }];
  }
  return text.trim();
}

function viaCli(system, prompt, web, model) {
  const args = ["-p", "--model", model || (web ? RESEARCH_MODEL : MODEL), "--system-prompt", system, "--no-session-persistence"];
  if (web) args.push("--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch", "WebFetch");
  else args.push("--tools", "");
  return new Promise((resolve, reject) => {
    const p = spawn(findClaude(), args);
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill(); reject(new Error("claude CLI timed out")); }, web ? 280000 : 120000);
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("error", e => { clearTimeout(timer); reject(e); });
    p.on("close", code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || "claude CLI failed")); });
    p.stdin.end(prompt);
  });
}

// web=true gives the model live web search (topic research)
const complete = (system, prompt, maxTokens = 250, web = false, model) =>
  client ? viaApi(system, prompt, maxTokens, web, model) : viaCli(system, prompt, web, model);

function parseJSON(raw, open, close) {
  const a = raw.indexOf(open), b = raw.lastIndexOf(close);
  if (a < 0 || b < a) throw new Error("model did not return JSON");
  return JSON.parse(raw.slice(a, b + 1));
}

// enumerated face features the caricature renderer understands (see public/caricature.js)
const LOOKSPEC =
  '"look": {"skin": one of ["#f6d3b8","#e9b48f","#c98d63","#8d5a3b","#5a3a28","#f3c9a5"], ' +
  '"hair": one of [bald,short,spiky,long,curly,sidepart,mohawk,bun,afro], ' +
  '"hairColor": one of ["#2b1d14","#5a3a1e","#c68b3e","#e8c872","#9a9a9a","#d9d9d9","#a3322a","#2d4a8a"], ' +
  '"head": one of [round,long,square,pear], "brows": one of [flat,angry,raised,worried], "nose": one of [small,big,pointy], ' +
  '"mouth": one of [smile,smirk,flat,frown,grin], "facial": one of [none,beard,mustache,goatee,stubble], ' +
  '"glasses": one of [none,round,square,monocle,sunglasses], ' +
  '"hat": one of [none,tophat,cap,beanie,headband,witchhat,goggles,leaves,bandana]}';

const TACTICS =
  "e.g. 'attacks the other side's evidence first', 'turns every point into a personal story', 'concedes a small point then pivots hard', " +
  "'answers with a pointed question', 'argues by vivid analogy', 'hammers one statistic', 'reframes the question itself', 'appeals to a principle and refuses to budge'";

// ---- Speech: macOS `say` is far more reliable than the browser engine (no cut-offs, no pause bugs, no novelty voices).
// A hand-picked list of clean voices, alternating male/female, so every debater sounds distinct and natural.
const GOOD_VOICES = ["Daniel", "Samantha", "Rishi", "Karen", "Reed (English (US))", "Moira", "Rocko (English (US))", "Tessa", "Eddy (English (US))", "Shelley (English (US))", "Flo (English (US))", "Sandy (English (US))", "Kathy"];
let voiceCache = null;
function listVoices() {
  if (voiceCache) return Promise.resolve(voiceCache);
  return new Promise(resolve => {
    require("child_process").execFile("say", ["-v", "?"], (err, out) => {
      if (err) return resolve([]);
      const have = out.split("\n").map(l => l.replace(/\s+#.*$/, "").match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s*$/)).filter(Boolean).map(x => ({ name: x[1], lang: x[2] }));
      const enhanced = have.filter(v => v.lang.startsWith("en_") && /\((Premium|Enhanced)\)/.test(v.name)).map(v => v.name);  // downloaded high-quality voices first
      const good = GOOD_VOICES.filter(n => have.some(v => v.name === n));
      resolve(voiceCache = [...enhanced, ...good]);
    });
  });
}
const speaking = new Set();
function stopSpeech() { for (const p of speaking) p.kill("SIGTERM"); }
function sayText(text, voice, wpm) {
  return new Promise(resolve => {
    const args = ["-r", String(Math.round(Math.min(280, Math.max(110, wpm || 185))))];
    if (voice) args.push("-v", voice);
    const p = spawn("say", args);
    speaking.add(p);
    p.on("close", (code, sig) => { speaking.delete(p); resolve({ aborted: !!sig }); });
    p.on("error", () => { speaking.delete(p); resolve({ error: true }); });
    p.stdin.on("error", () => {});
    p.stdin.end(String(text).replace(/\[\[/g, ""));   // [[ ... ]] would be read as speech commands
  });
}

const transcriptText = t => t.map(x => `${x.name}: ${x.text}`).join("\n") || "(nothing said yet)";

const handlers = {
  // One spoken line from one agent.
  async turn(d) {
    const me = d.agent;
    const roster = d.agents.map(a => `- ${a.name}: ${a.trait}`).join("\n");
    let system =
      `You are ${me.name} in a live, spoken multi-person debate. Your personality and stance: ${me.trait}\n` +
      `Debate topic: ${d.topic}\n\nParticipants:\n${roster}\n\n`;
    if (me.secret) system += `Your private motive (never state it outright; let it quietly colour what you argue and how hard you push): ${me.secret}\n`;
    if (me.tactic) system += `Your characteristic way of attacking and defending: ${me.tactic}. Use it often.\n`;
    if (me.secret || me.tactic) system += "\n";
    if (d.research) system += `VERIFIED BACKGROUND (from recent news and web research; use it for facts and numbers, cite dates when you use it, and do not invent other statistics):\n${d.research}\n\n`;
    system +=
      "Rules: stay fully in character and hold your own distinct viewpoint. Speak in 1-3 punchy " +
      "sentences (max ~60 words), as spoken words only: no stage directions, no markdown, no " +
      "emojis, no name prefix. Respond directly to what was just said, addressing a participant " +
      "by name when disagreeing, challenging or building on them. Do not repeat points already " +
      "made; advance the argument with a fresh fact, angle or rebuttal. Do not seek false consensus.";
    if (d.moderator_note) system += `\nThe human moderator just interjected; address it: ${d.moderator_note}`;
    const prompt = d.transcript.length
      ? `Debate so far:\n${transcriptText(d.transcript)}\n\nYour turn, ${me.name}.`
      : `You open the debate, ${me.name}. State your position on the topic.`;
    return { text: await complete(system, prompt) };
  },

  // Cast of real-world stakeholders (professions, camps), no web needed.
  async personas(d) {
    const system = "You design debate casts. Output only valid JSON, no prose, no code fences.";
    const prompt =
      `Debate topic: ${d.topic}\n\nCast 8 realistic debaters for this specific topic: the real-world people, professions, stakeholders and ideological camps ` +
      "who would genuinely argue about it, e.g. for a millionaire-tax debate: a socialist, a billionaire, a schoolteacher, a small-business owner, a tax lawyer, a libertarian economist, a nurse, a retiree. " +
      "Use plain, recognisable role names (1-3 words, like 'The Billionaire' or 'Public School Teacher'). No fantasy, fairy-tale or fictional characters, and not named real people. " +
      "Cover the full range of views on THIS topic, including opposing camps and a couple of unexpected but plausible perspectives, each with a clearly different stance. " +
      "Return a JSON array of objects: " +
      '{"name": the role, "emoji": one emoji that suits the role, "trait": one sentence on their stance on THIS topic, their background/interests and how they talk, ' +
      `"secret": one sentence private motive or fear that quietly drives their position (something they would not say outright), ` +
      `"tactic": a short phrase for how they fight in an argument (${TACTICS}), ` +
      LOOKSPEC + " " +
      "chosen so the face is a charming caricature that fits the person and their job (realistic accessories only: e.g. tophat for a wealthy tycoon, glasses for an academic, cap for a tradesperson; avoid witchhat, goggles and leaves unless truly fitting); vary faces widely}.";
    const raw = await complete(system, prompt, 3500);
    const items = parseJSON(raw, "[", "]");
    return { personas: items.slice(0, 8).map(x => ({ name: String(x.name), emoji: String(x.emoji || "🎭"), trait: String(x.trait), secret: x.secret && String(x.secret), tactic: x.tactic && String(x.tactic), look: x.look })) };
  },

  // Sourced briefing on the latest news and facts for the topic.
  async research(d) {
    const system = "You are a meticulous research assistant with web search. Output only valid JSON, no prose, no code fences.";
    const prompt =
      `Topic for a debate: ${d.topic}\n\nSearch the web for the latest news, data and expert analysis. Write a briefing that debaters on every side can use: ` +
      "the current state of play with dates, key numbers (with their source and year), the strongest arguments for and against, notable controversies, and who the main actors are. " +
      "Be factual and balanced. State clearly what is unconfirmed or disputed; never invent figures. " +
      'Return JSON: {"brief": a briefing of at most 350 words, "sources": [{"title": "", "url": ""}]} with up to 10 of the sources you actually used.';
    const o = parseJSON(await complete(system, prompt, 2500, true), "{", "}");
    return { brief: String(o.brief || ""), sources: Array.isArray(o.sources) ? o.sources.filter(s => s && s.url).slice(0, 10) : [] };
  },

  // Private motive + attack habit for agents that don't already have them (archetypes, custom).
  async traits(d) {
    const system = "You are a debate coach. Output only valid JSON, no prose, no code fences.";
    const prompt =
      `Debate topic: ${d.topic}\nDebater: ${d.name}: ${d.trait}\n\nReturn one JSON object: {"secret": one sentence private motive or fear that quietly drives this debater's position on THIS topic (something they would not say outright), ` +
      `"tactic": a short phrase for how they fight in an argument (${TACTICS})}.`;
    const o = parseJSON(await complete(system, prompt, 400), "{", "}");
    return { secret: String(o.secret || ""), tactic: String(o.tactic || "") };
  },

  async look(d) {
    const system = "You are a caricature artist. Output only valid JSON, no prose, no code fences.";
    const prompt =
      `Design the caricature face for this debater.\nName: ${d.name}\nPersonality: ${d.trait}\n\n` +
      "Pick every feature so the face visibly expresses the personality (age, temperament, profession, attitude): e.g. angry brows and a frown for a grump, " +
      "a grin and raised brows for an enthusiast, glasses for a bookish type, a tophat for a wealthy tycoon, a cap for a tradesperson. Use fantasy accessories (witchhat, leaves, goggles) only if the description truly calls for them. Return one JSON object: " +
      '{"emoji": one emoji that is their signature symbol, ' + LOOKSPEC + "}.";
    const o = parseJSON(await complete(system, prompt, 400), "{", "}");
    return { emoji: String(o.emoji || "✨"), look: o.look };
  },

  async voices() { return { voices: await listVoices() }; },
  async speak(d) { return sayText(d.text, d.voice, d.wpm); },
  async stopspeak() { stopSpeech(); return { ok: true }; },

  // The judge: who won (if anyone), why, and where the debate landed.
  async outcome(d) {
    const system = "You are an impartial, rigorous debate judge. Output only valid JSON, no prose, no code fences.";
    const roster = d.agents.map(a => `- ${a.name}: ${a.trait}`).join("\n");
    const prompt =
      `Topic: ${d.topic}\n\nParticipants:\n${roster}\n\n` +
      (d.research ? `Verified background facts (for judging accuracy):\n${d.research}\n\n` : "") +
      `Transcript:\n${transcriptText(d.transcript)}\n\n` +
      "Judge the debate on: strength and coherence of arguments, use of accurate evidence (penalise made-up or wrong facts), how well each side answered rebuttals, and consistency. " +
      "Do NOT pick a winner because of which political or moral side you prefer; judge the quality of the debating only. If nobody clearly prevailed, say so. " +
      'Return one JSON object: {"verdict": "winner" or "draw" or "unresolved", "winner": the exact participant name or null, "headline": at most 12 words, ' +
      '"winner_reason": 2-3 sentences on why they won (or why there was no winner), ' +
      '"scores": [{"name": exact participant name, "score": 0-100, "summary": one sentence on how they did}] for EVERY participant, ' +
      '"key_arguments": [{"name": exact participant name, "point": one sentence}] with the 4-6 strongest arguments made, ' +
      '"turning_points": 1-3 short strings describing moments the debate shifted, ' +
      '"where_it_landed": 2-4 sentences on the state of the debate at the end: what got settled, what did not, and which way it leans, ' +
      '"common_ground": 0-3 short strings, "unresolved": 0-3 short strings}.';
    return parseJSON(await complete(system, prompt, 3000, false, RESEARCH_MODEL), "{", "}");
  },

  async summary(d) {
    const system = "You are a neutral debate analyst. Be concise and concrete.";
    const prompt =
      `Topic: ${d.topic}\nParticipants: ${d.agents.map(a => a.name).join(", ")}\n\nTranscript:\n${transcriptText(d.transcript)}\n\n` +
      "Summarize: 1) each participant's core position (one line each), 2) the sharpest points of " +
      "disagreement, 3) any common ground. Plain text, under 200 words.";
    return { text: await complete(system, prompt, 500) };
  },
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    const send = (code, body, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(body); };
    if (req.method === "POST") {
      const name = req.url.replace("/api/", "");
      if (!req.url.startsWith("/api/") || !handlers[name]) return send(404, "{}");
      let body = "";
      for await (const c of req) body += c;
      try { send(200, JSON.stringify(await handlers[name](JSON.parse(body)))); }
      catch (e) { send(500, JSON.stringify({ error: e.message })); }
      return;
    }
    const rel = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return send(404, "Not found", "text/plain");
    send(200, fs.readFileSync(file), MIME[path.extname(file)] || "application/octet-stream");
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 640, backgroundColor: "#0f1220", title: "Agent Debate",
    titleBarStyle: "hiddenInset",
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.loadURL(`http://127.0.0.1:${port}/`);
});
app.on("window-all-closed", () => { stopSpeech(); app.quit(); });
app.on("before-quit", stopSpeech);
