# LOOM vs OpenClaw — What You Might Be Missing

A quick comparison with [OpenClaw](https://github.com/openclaw/openclaw) (personal AI assistant, multi-channel, “the lobster way”) so you can decide what to adopt.

**LOOM** = **home-base app** — the one place you work from (terminal, circuits, sessions, AI). Local-first, retro terminal + circuit board. Optional connections to Slack, Discord, Telegram, etc. can plug in as in/out channels, but the app stays the center.  
**OpenClaw** = personal AI assistant with a **Gateway** (control plane), multi-channel messaging as the primary way you talk to the agent, companion apps, skills registry.

---

## Where LOOM Already Overlaps

| Area | LOOM | OpenClaw |
|------|------|----------|
| **Local-first** | ✅ Ollama + optional cloud | ✅ Gateway on your devices |
| **Single control plane** | ✅ Backend + Socket.IO | ✅ Gateway WebSocket |
| **Sessions** | ✅ Save/load/restore | ✅ Sessions, main/group |
| **Desktop / web UI** | ✅ Terminal feed + Circuit Board, Electron, Docker | ✅ WebChat, Control UI, Canvas |
| **Voice** | ✅ TTS (Orpheus), voice chat modal | ✅ Voice Wake, Talk Mode (ElevenLabs) |
| **Cron / automation** | ✅ Scheduler, cron cells | ✅ Cron, webhooks, wakeups |
| **Docker** | ✅ `make dock-notebook` | ✅ Docker-based installs |
| **Docs** | ✅ README, feature guides, PRODUCT_STATE | ✅ Docs index, runbooks, DeepWiki |

---

## What OpenClaw Has That LOOM Doesn’t (Yet)

### 1. **Onboarding wizard**
- **OpenClaw:** `openclaw onboard --install-daemon` — guided setup (gateway, workspace, channels, skills).
- **LOOM:** Manual steps (install deps, Ollama, “Get base models”), `make help` / README.
- **Idea:** Add a first-run or CLI wizard: `loom onboard` or in-app “Setup wizard” that walks through Ollama, models, optional cloud, and maybe one sample circuit.

### 2. **Connections to other channels**
- **OpenClaw:** WhatsApp, Telegram, Slack, Discord, etc. are primary surfaces — you talk to the agent there.
- **LOOM:** Home base only today (terminal + circuit in browser/Electron); mobile chat is a separate web page. No Slack/Discord/Telegram connectors yet.
- **Idea:** If you want “assistant on the channels you use,” you’d add a **channel layer** (adapters per platform) and route messages to/from the same session/orchestrator. Big feature.

### 3. **Companion apps**
- **OpenClaw:** macOS menu bar app, iOS/Android nodes (Canvas, voice, camera, etc.).
- **LOOM:** Electron desktop; no dedicated mobile app or menu bar.
- **Idea:** Optional “LOOM node” (e.g. React Native or PWA) that talks to your backend for voice/camera/notifications; or a simple menu bar tray that opens the app / shows status.

### 4. **Skills / extensions registry**
- **OpenClaw:** Skills in workspace (`~/.openclaw/workspace/skills`), ClawHub registry, agent can search and pull skills.
- **LOOM:** Circuit templates and modules; no shared “skill” format or public registry.
- **Idea:** Define a **skill contract** (e.g. a SKILL.md + entrypoints), a small **skill registry** (list of repos or JSON), and “Install skill” in the UI or via `/skill install <name>`. Reuse circuit/node ideas as one kind of skill.

### 5. **Agent-to-agent / multi-session coordination**
- **OpenClaw:** `sessions_list`, `sessions_history`, `sessions_send` — agents can message other sessions.
- **LOOM:** Single user session; no multi-agent or session-to-session messaging.
- **Idea:** Add “sessions” API and tools so one circuit or chat can query or send prompts to another named session (e.g. “research” vs “main”). Good for automation and delegation.

### 6. **Structured chat commands**
- **OpenClaw:** `/status`, `/mesh <goal>`, `/new`, `/think <level>`, `/verbose`, `/usage`, `/restart`, etc.
- **LOOM:** Plenty of slash commands (`/help`, `/quick`, `/setup-models`, etc.) but no single “control plane” list in one place.
- **Idea:** Publish a **Chat commands** section in the README (and in-app `/help`) that lists every slash command and what it does, OpenClaw-style.

### 7. **Remote access / exposure**
- **OpenClaw:** Tailscale Serve/Funnel, SSH tunnels; gateway stays local, UI reachable remotely.
- **LOOM:** Docker + “Chat from phone” on LAN; no built-in Tailscale or tunnel story.
- **Idea:** Document “reverse proxy + Tailscale” or “cloudflared” for secure remote access to LOOM (and optionally add a small `loom serve` script that wraps tunnel setup).

### 8. **Security and sandboxing**
- **OpenClaw:** DM pairing, allowlists, sandbox (e.g. Docker) for non-main sessions.
- **LOOM:** Single user; no multi-tenant or “untrusted channel” model yet.
- **Idea:** If you add channels or shared access, add pairing/allowlist and a “sandbox” mode for non-owner sessions (e.g. run circuits in a restricted env).

### 9. **“Doctor” / health and migrations**
- **OpenClaw:** `openclaw doctor` — config checks, migrations, risky settings.
- **LOOM:** `/status`, health endpoint; no dedicated “doctor” CLI.
- **Idea:** Add `loom doctor` (or a “Check setup” in the UI) that validates Ollama, ChromaDB, env, and config and suggests fixes.

### 10. **Contributing and community**
- **OpenClaw:** CONTRIBUTING.md, security policy, many contributors.
- **LOOM:** README says “Contributions welcome”; no CONTRIBUTING.md or SECURITY.md yet.
- **Idea:** Add **CONTRIBUTING.md** (how to run, test, submit PRs) and **SECURITY.md** (how to report issues).

---

## Suggested Priorities (If You Want to Be “More Like OpenClaw”)

**High impact, reasonable scope**
1. **Onboarding wizard** — `loom onboard` or in-app wizard (Ollama, models, one sample circuit).
2. **Chat commands reference** — One place (README + `/help`) listing all slash commands.
3. **`loom doctor`** — Health check CLI (or UI) for Ollama, backend, env.
4. **CONTRIBUTING.md + SECURITY.md** — So the repo feels “open” and safe to contribute to.

**Medium term**
5. **Skills / plugin contract** — Skill format + small registry; circuits as one kind of skill.
6. **Session-to-session tools** — e.g. “send to research session” or run a circuit from another session.
7. **Remote access doc** — How to expose LOOM over Tailscale/cloudflared/SSH.

**Larger bets**
8. **Multi-channel** — Only if you want LOOM to be “assistant on WhatsApp/Telegram/etc.”; big architectural step.
9. **Companion apps** — Menu bar or mobile node; depends on target users.

---

## What LOOM Does Better or Different

- **Retro terminal aesthetic** — Distinct look and feel vs generic chat UIs.
- **Circuit board** — First-class visual pipelines (nodes, templates) vs OpenClaw’s Canvas/tools.
- **Local-first by default** — Ollama-first with optional cloud; OpenClaw is more “connect everything.”
- **Simpler surface** — One app, one backend; no Gateway vs nodes vs channels mental model.

You’re not “missing” everything; you’re making different tradeoffs. Use this list to pick the OpenClaw-style pieces that fit LOOM’s vision (e.g. onboarding + doctor + CONTRIBUTING first, then skills, then maybe channels).
