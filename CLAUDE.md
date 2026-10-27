# Project Rules

## Project
- Project name: 아홉 경계 (The Ninefold Veil).
- This is a 2D roguelike browser game built with JavaScript, HTML, CSS, and Vite.
- Explain technical concepts in beginner-friendly language when appropriate.

## Model Selection
- Use Sonnet 5.5 as the default model for game development.
- Do not change the active model automatically.
- If Haiku would be more efficient for a simple, repetitive, or narrowly scoped task, explain why and ask the user for approval before switching.
- If Opus would be beneficial for complex debugging, architectural decisions, or difficult reasoning, explain why and ask the user for approval before switching.
- Never switch models without the user's explicit approval.
- If no model change is necessary, continue using Sonnet 5.5.

## Development Workflow
- Work one step at a time.
- Before significant changes, explain the plan and identify the files that will be changed.
- After each step, report what changed and what was tested.
- Before moving to the next step, ask whether the user has questions or is blocked.
- Prefer small, understandable changes over large rewrites.
- Do not introduce dependencies unless necessary and approved by the user.

## Code Safety
- Do not modify unrelated files.
- Preserve existing working functionality.
- Do not overwrite existing work without checking it first.
- Do not commit or push Git changes unless the user explicitly asks.
- Do not create or use subagents unless the user explicitly asks.

## Verification
- Run the relevant build or tests after code changes when appropriate.
- Clearly distinguish verified results from assumptions or untested behavior.

## Workflow and Tool Responsibilities
- Before making substantial changes, read `AI_WORKFLOW_AND_TOOL_RESPONSIBILITIES.md` and follow its workflow and tool responsibilities.
- ChatGPT: leads game design, worldbuilding, narrative, gameplay systems, planning, and design review.
- Higgsfield: produces visual assets only after the estimated credit cost is checked and the user explicitly approves generation.
- Codex: assists with technical planning, architecture review, code review, and independent verification.
- Claude Code: primary implementation and debugging agent.

## Design and Change Control
- Treat approved specifications and explicit user decisions as authoritative.
- Clarify requirements before substantial implementation.
- Do not silently change established mechanics, narrative canon, or art direction.
- Avoid concurrent edits to the same files by multiple agents.
- Before risky changes, recommend a version-control checkpoint (commit) and ask the user first; do not commit unless the user explicitly asks (see Code Safety).
- Keep project documentation consistent with confirmed decisions and implemented features.
