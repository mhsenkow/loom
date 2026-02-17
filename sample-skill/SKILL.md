---
id: loom-sample
name: LOOM Sample Skill
version: 1.0.0
description: Minimal example skill. One circuit that echoes your message with a twist.
circuits:
  - id: sample-echo
    name: Sample Echo
    description: Type something, get a one-line friendly echo from the AI.
    cells:
      - type: data_input
        label: Input
        content: ''
        inputMode: none
      - type: ai_processor
        label: Echo
        content: "Reply in one short sentence. Echo the user's message in a friendly, slightly playful way. No preamble."
        modelSlot: A
        inputMode: previous
      - type: log_entry
        label: OUTPUT
        content: ''
        inputMode: previous
---

# LOOM Sample Skill

Install this from **Settings → Extensions** to try the skill system.

- **From path:** paste the path to this folder (e.g. `/path/to/loom/sample-skill`).
- **From GitHub:** use the repo URL; LOOM will fetch the default branch and look for this folder. Or use a zip URL of a repo that contains a `sample-skill` with `SKILL.md`.

After installing, run in the terminal:

- `/circuits` — you should see **Sample Echo**.
- `/run sample-echo` or `/sample-echo` — then type something and get a one-line echo.

This skill uses the same [SKILL.md format](https://agentskills.io/specification) as ClawHub and the Agent Skills spec, with LOOM’s `circuits` extension.
