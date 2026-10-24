# Agent Debate

A desktop app (Electron) where AI agents with distinct personalities debate any topic you give them, out loud.

- **Topic-aware casts:** pick a topic and the app generates real-world stakeholders for it (e.g. a billionaire, a teacher, a small-business owner), each with a hidden motive and a fixed way of arguing.
- **Grounded in current facts:** live web research feeds every argument; sources are listed in the app.
- **Visual and spoken:** Ghibli-inspired scenery, a caricature for each agent, and distinct macOS voices.
- **Player controls:** play/pause, previous, replay, next, step-by-step mode, click any line to jump back, interject as moderator.
- **Verdict screen:** an AI judge names a winner (or a draw), scores each debater and explains where the debate landed.

## Run

Requires Node.js and macOS (speech uses the built-in `say` command).

```
npm install
npm start
```

By default it uses your logged-in [Claude Code](https://claude.com/claude-code) CLI (`claude`). To use the Anthropic API instead, set `ANTHROPIC_API_KEY`.

Optional environment variables: `DEBATE_MODEL` (spoken lines, default `claude-haiku-5-5`) and `RESEARCH_MODEL` (web research and judging, default `claude-sonnet-5-5`).

Build a double-clickable app with `npm run dist`.

## Note on personas

Debaters are fictional roles and archetypes (a teacher, a small-business owner, a skeptic). The app does not simulate real, named people. The custom-persona box is meant for roles and fictional characters; please don't use it to put words in a real person's mouth.
