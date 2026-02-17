# Skills and Circuits: Unified Model

**Summary:** Skills are the **installable contract** (what you add from a registry or folder). Circuits are the **local visualization and runtime** (how LOOM runs and shows them). LOOM reads skills and turns them into circuits and/or adds cell types that enable new behavior. The Circuit Board is the local way to view and edit them; an **Extensions** library in Settings manages sources and install state.

---

## 1. Mental model

| Concept | What it is | Where it lives |
|--------|------------|----------------|
| **Skill** | Installable unit with a contract (manifest + optional circuit definition and/or new cell type) | Registry, GitHub repo, or local folder; after install → local extension store |
| **Circuit** | A runnable pipeline (nodes/cells + wiring). The way LOOM executes a workflow. | Circuit Board UI, saved in SQLite; can be created from a skill or by hand |
| **Cell type** | Kind of node (e.g. `ai_processor`, `script_execution`, `qdc_run`). Defines what a cell does when the circuit runs. | Built-in in code; skills can **add** new cell types that appear on the board |
| **Extensions library** | UI to add/remove/update skill sources and see what’s installed. Handles “tech stuff” (trust, updates, conflicts). | Settings → Extensions |

So:

- **Skills** = what you install (from a registry or path).
- **Circuits** = how LOOM runs and visualizes workflows (always).
- A skill can:
  - **Provide one or more circuits** → LOOM turns them into saved circuits (and optionally templates), so they show up on the Circuit Board and as `/run <name>`.
  - **Define a new cell type** → LOOM registers it so new nodes of that type appear in the cell palette and are executed by the backend when the circuit runs.
- The **Circuit Board** is just the local surface: same as today, but now some circuits and cell types can come from installed skills.

---

## 2. Skill contract (what LOOM reads)

A **skill** is a folder (or archive) that LOOM can read. Minimum contract:

- **`SKILL.md`** (or `skill.json`) — manifest:
  - `id`, `name`, `version`, `description`
  - Optional: `circuits` (list of circuit definitions, see below)
  - Optional: `cells` (list of custom cell type definitions, see below)
  - Optional: `entrypoints` (e.g. `run: "python run.py"` for backend behavior if needed)

Example `SKILL.md` (front matter + doc):

```yaml
---
id: loom-daily-brief
name: Daily Brief
version: 1.0.0
description: Morning brief and optional notification.
circuits:
  - id: dailybriefing
    name: Daily Briefing
    description: One-shot morning brief.
    # circuit defined inline or in separate file (see below)
cells: []
---
# Daily Brief
Use `/dailybriefing` or `/run dailybriefing` after installing.
```

Example with a **custom cell type** (future):

```yaml
---
id: loom-weather
name: Weather
version: 1.0.0
cells:
  - type: weather_fetch
    label: Weather
    icon: "🌤"
    description: Fetch weather for a location.
    category: Data
    # backend handler: script or API route
---
```

LOOM’s job:

- **If `circuits` is present:** For each item, convert the definition into the same shape as existing circuit templates (cells + wiring). Save as a circuit (and show in templates sidebar / `/circuits`). So “skill” → “circuit” is a one-way transform: skill is the source of truth on disk; circuit is the runtime copy.
- **If `cells` is present:** Register each as a new `ModuleType` (or a dynamic “extension cell” that delegates to the skill’s handler). They show up in the cell type palette and in the circuit editor. Backend needs a way to execute them (e.g. run a skill-provided script, or call an API the skill defines).

---

## 3. Circuit definition inside a skill

A skill’s circuit entry can point to:

- An **inline definition** (same shape as `NotebookTemplate.cells` in the frontend), or
- A **file** (e.g. `circuit.json` or `circuit.yaml`) that describes cells and edges.

LOOM already has:

- `NotebookTemplate`: `id`, `name`, `description`, `icon`, `category`, `cells` (array of cell data without `id`/`status`).
- `SavedCircuit`: same cell shape, persisted.

So a skill’s circuit is just:

- Same cell schema (type, label, content, inputMode, modelSlot, etc.).
- Optional: edges/wiring (if we ever store edges explicitly; today order often implies flow).

Example (inline in manifest or in `circuits/dailybriefing.json`):

```json
{
  "id": "dailybriefing",
  "name": "Daily Briefing",
  "description": "Morning brief with optional notification",
  "cells": [
    { "type": "ai_processor", "label": "Brief", "content": "Generate a short morning brief...", "modelSlot": "A", "inputMode": "previous" },
    { "type": "notification", "label": "Notify", "content": "", "inputMode": "previous" }
  ]
}
```

On install, LOOM:

- Converts this into a circuit (assigns cell ids, status).
- Saves it (e.g. under a namespace like `skill:loom-daily-brief/dailybriefing` or just `dailybriefing` if no conflict).
- Lists it in Circuit Board templates and in `/circuits` so you can run `/run dailybriefing`.

So: **skills that only define circuits don’t require new cell types.** They’re “circuit packs” that LOOM turns into normal circuits.

---

## 3b. Instruction-only skills (Agent Skills) → 1:1 circuit

Skills that follow the [Agent Skills](https://agentskills.io/specification) / [anthropics/skills](https://github.com/anthropics/skills) format (only `name`, `description`, and markdown body, no `circuits` block) are **1:1 mapped** to a runnable circuit:

- LOOM reads the markdown **body** (everything after the YAML frontmatter) as the skill instructions.
- It **synthesizes a circuit** with: `data_input` → one or more `ai_processor` cells → `log_entry`.
- **Auto-detect multi-step:** if the body has clear structure (e.g. `## Step 1`, `## Step 2`, or a top-level numbered list), LOOM splits it into multiple AI cells so each step runs in sequence with the previous step’s output as input. Otherwise a single AI cell runs the full instructions.
- The circuit **name** is the slugified skill `name` (e.g. `my-skill-name` → `/run my-skill-name`).

So any skill from anthropics/skills (or any SKILL.md with just name + description + body) becomes a runnable circuit when installed; multi-step structure is used when present to improve results. LOOM can also suggest **functional cell types** for a step when the text matches: e.g. **vector_search** ("search the knowledge base"), **data_loader** ("load the file"), **image_gen** ("generate an image"), **script_execution** ("run the script"); the suggested cell is prepended so the AI step receives real results. No extra cell type is required: the existing `ai_processor` (and optional helper cells) run with the skill instructions. Install a skill folder from that repo (e.g. path to a clone's `skills/…` subfolder) to get `/run <name>`.

---

## 4. Custom cell types from skills

For skills that need **new behavior** (e.g. “call external API”, “run a specific script”), two approaches:

- **Option A — Script cell + skill script:** The skill ships a script; the circuit uses a generic `script_execution` (or a small set of parameterized cells) that invokes that script. No new cell type; the skill just adds circuits that use existing cells + script paths. Simpler, works with current backend.
- **Option B — Register a new cell type:** The skill declares a new type (e.g. `weather_fetch`). LOOM adds it to the palette and to execution. Backend must support “extension cell” execution (e.g. by type name → script or HTTP call). More flexible, more “tech” to implement (sandboxing, versioning).

Recommendation: **Phase 1 = Option A** (skills as circuit packs + scripts). **Phase 2 = Option B** (skills can declare new cell types and LOOM + backend register and run them).

---

## 5. Extensions library (Settings)

To avoid “tech stuff” (trust, discovery, updates) living in random places:

- **Settings → Extensions** (or “Extensions library”):
  - **Registry / source list:** e.g. “LOOM official”, “GitHub repo URL”, “Local folder”. Optional: allowlist so only trusted registries are used.
  - **Installed extensions:** List of installed skills (name, version, source). Actions: Disable, Remove, Check for updates.
  - **Install from:** URL or path. Validates contract (`SKILL.md` or `skill.json`), then installs (copy or link into a known directory, e.g. `data/skills` or `~/.loom/skills`).
  - **Security:** Only install from configured sources; optional checksum or signature later. Extensions run in the same process as the backend unless we add a sandbox (Phase 2).

This gives one place to manage “what skills do I have” and “where do they come from,” and keeps the rest of the app thinking in terms of circuits and cell types.

---

## 6. Data flow (summary)

1. **User adds a source or installs a skill** (Settings → Extensions).
2. **LOOM reads the skill contract** (SKILL.md / skill.json).
3. **For each `circuits` entry:** LOOM creates a circuit (same format as today) and saves it; it appears on the Circuit Board and as `/run <name>`.
4. **For each `cells` entry (Phase 2):** LOOM registers a new cell type; it appears in the palette and is executed by the backend when the circuit runs.
5. **Circuit Board and terminal** stay unchanged from the user’s perspective: you still see circuits and run them; some just happen to come from installed skills.
6. **Updates / removal:** Extensions library can refresh from source or remove a skill; LOOM can mark circuits from that skill as “from extension X” and optionally remove or disable them on uninstall.

---

## 7. Tech notes

- **Backend:** Needs a small “skill loader” that reads from a configured skills directory and (a) returns list of circuits to merge with saved circuits, (b) in Phase 2, registers extension cell executors. Existing circuit execution stays the same; new cell types need a dispatch in `module_executor` (or similar).
- **Frontend:** Templates and saved circuits can be tagged with `source: 'builtin' | 'saved' | 'skill:<id>'` so the UI can show “From extension: Daily Brief” and allow disabling/removing from Extensions.
- **Conflict handling:** If a skill defines `dailybriefing` and the user already has a saved circuit `dailybriefing`, either namespace (e.g. `skill:loom-daily-brief/dailybriefing`) or prompt to overwrite/skip.
- **Persistence:** Installed skill list and source list can live in Settings (e.g. localStorage or a small JSON in the data folder); circuit storage is unchanged (SQLite).

This keeps **circuits as the single local visualization and execution model**, with **skills as the installable input** that gets turned into circuits (and optionally new cell types), and **Extensions in Settings** as the single place to manage sources and install state.

---

## 8. Existing skills ecosystems

There are already public skill registries and a shared contract LOOM can align with.

### Agent Skills spec (SKILL.md)

- **Spec:** [agentskills.io/specification](https://agentskills.io/specification), [anthropics/skills](https://github.com/anthropics/skills) (`spec/agent-skills-spec.md`).
- **Contract:** A skill is a directory with at least a **`SKILL.md`** file: YAML frontmatter + Markdown body.
  - **Required:** `name` (slug), `description`.
  - **Optional:** `license`, `compatibility`, `metadata`, `allowed-tools`.
  - **Optional dirs:** `scripts/`, `references/`, `assets/`.
- **Progressive use:** Discovery (name + description) → activation (full instructions) → execution (scripts/resources). LOOM’s “circuits from skill” fits as an **extension** of this: we add `circuits` (and optionally `cells`) in frontmatter; the rest stays compatible so skills written for other agents can still be read.

### ClawHub (OpenClaw)

- **Site:** [clawhub.ai](https://clawhub.ai/) — “npm for AI agents.”
- **What it is:** Public registry for OpenClaw skills: 3k+ skills, versioned bundles with `SKILL.md` + supporting files, vector search, semver, stars/comments, CLI (`clawhub search`, `clawhub install`, `clawhub publish`).
- **Format:** Same idea — folder with `SKILL.md`; ClawHub indexes metadata for search and stores versioned bundles.
- **LOOM:** Skills published for OpenClaw are folders with `SKILL.md`. If we support that contract (and optionally our `circuits` / `cells` extension), LOOM could **add ClawHub as an optional registry source** in Extensions: user points to ClawHub or installs via URL; LOOM downloads the bundle and turns any LOOM-specific `circuits` into circuits; plain SKILL.md-only skills could be “documentation + scripts” that we show or run via script cells.

### Other registries

- **askill.sh** — Agent skills registry (40+ agents, one-command install). Different packaging; could be another source type if they expose an API or tarball URL.
- **SkillsMP** — Marketplace on “SKILL.md standard,” 200k+ skills, semantic search; potential future source.
- **Claude Code / Claude plugins** — Marketplace and community registries; often agent-specific; LOOM can stay format-compatible so that skills that ship a `SKILL.md` (and optionally our `circuits`) can be installed from a path or URL.

### Recommendation

- **Adopt the Agent Skills `SKILL.md` contract** (name, description, optional license/compatibility/metadata) so LOOM skills are valid in the broader ecosystem.
- **Extend with `circuits` (and later `cells`)** in frontmatter or a separate manifest so LOOM can turn skills into circuits and cell types.
- **In Extensions library:** Allow “Add source” → ClawHub (or another registry URL), “Install from URL/path,” and “Local folder.” So yes — there are existing skills databases (ClawHub, SkillsMP, agent-specific marketplaces); LOOM can read from them and map compatible skills into circuits while keeping the Circuit Board as the local visualization.
