# THE NINEFOLD VEIL — AI WORKFLOW & TOOL RESPONSIBILITIES

## 1. Project Objective

Develop **The Ninefold Veil (아홉 경계)**, a browser-based 2D pixel-art survival roguelike RPG inspired by Korean mythology and dark fantasy.

The project uses multiple AI tools with clearly separated responsibilities. The goal is to maintain consistent game design, visual identity, code quality, and development progress while minimizing duplicated work and conflicting changes.

## 2. Primary Tool Responsibilities

### ChatGPT — Game Design Lead and Project Planning

ChatGPT is responsible for game design, creative direction, planning, and cross-functional coordination.

Responsibilities:
- Develop and refine the world, lore, narrative, characters, factions, and quests.
- Design gameplay systems, combat mechanics, progression, enemies, companions, and game modes.
- Prepare Game Design Documents (GDDs), technical requirements, acceptance criteria, and implementation plans.
- Review design consistency, identify contradictions, evaluate balance, and prioritize features.
- Prepare actionable prompts and specifications for the user-selected image-generation tool, Codex, and Claude Code.
- Review implementation results against the intended game design.
- Maintain a clear distinction between confirmed decisions, proposals, and unresolved questions.

ChatGPT should not silently treat proposed ideas or placeholder values as finalized project decisions.

### Visual Asset Production

Use the image-generation tool the user selects, including ChatGPT ImageGen or Higgsfield. The active art source of truth is `docs/reference/character-art-direction/`: its five supplied prompt/guideline files and the user-designated Dal visual reference. Follow those sources for character, enemy, boss, environment, and sprite design; preserve stated open questions instead of inventing final values.

For credit-consuming Higgsfield generation:
1. Identify the intended asset and output.
2. Check the available model and estimated credit cost when possible.
3. Present the estimate and obtain explicit user approval.
4. Generate only the approved quantity and scope.
5. Report the outcome and any limitations.

Never claim that an asset has been generated, exported, or integrated unless that action has actually succeeded.

### Codex — Technical Planning, Code Review, and Independent Verification

Codex is the secondary technical assistant.

Responsibilities:
- Analyze the existing codebase and technical architecture.
- Translate approved game requirements into implementation plans and technical recommendations.
- Review code for correctness, maintainability, performance, and architectural consistency.
- Help design test cases and identify potential bugs or regressions.
- Independently review important changes made by Claude Code when appropriate.
- Assist with technical investigations that benefit from a separate perspective.

Codex is not the default primary implementation agent. It may implement a task when explicitly assigned, but it must not independently duplicate or overwrite ongoing Claude Code work.

### Claude Code — Primary Implementation and Debugging Agent

Claude Code is responsible for the main development workflow.

Responsibilities:
- Implement approved gameplay features and technical specifications.
- Write and maintain the JavaScript, HTML, CSS, and other code used by the project.
- Integrate game systems into the existing architecture.
- Reproduce bugs, identify root causes, implement fixes, and run regression tests.
- Verify builds and actual gameplay behavior whenever possible.
- Maintain relevant code documentation and report implementation status.
- Preserve existing functionality unless a change is explicitly required.

Claude Code should inspect the existing codebase before modifying it, follow the project's current architecture, and avoid unnecessary rewrites.

## 3. Standard Workflow

Follow this sequence for substantial features:

1. **Design:** ChatGPT defines the feature, player experience, rules, constraints, and acceptance criteria.
2. **Technical review:** Codex may review feasibility, architecture, risks, and implementation options.
3. **Approval:** The user confirms major design decisions and significant scope changes.
4. **Implementation:** Claude Code implements the approved specification.
5. **Verification:** Claude Code runs relevant tests and checks actual behavior where possible. Codex may independently review critical changes.
6. **Review:** ChatGPT compares the results with the original requirements and identifies discrepancies.
7. **Documentation:** Update relevant project documentation and record confirmed decisions.

For small, low-risk bug fixes, Claude Code may follow a shorter workflow as long as the intended behavior is clear.

Do not require every tool to participate in every task. Use only the tools that add meaningful value.

## 4. Source of Truth and Decision Management

Maintain the following priority order:

1. Explicit user decisions and approvals.
2. Current approved project specifications and design documents.
3. Existing implementation and documented technical constraints.
4. Clearly labeled proposals and experimental ideas.

If two sources conflict, identify the conflict instead of silently choosing one.

Do not assume that a newer draft automatically overrides an approved specification unless the change is explicit.

Keep these categories distinct:
- Confirmed decisions
- Proposed changes
- Open questions
- Implemented features
- Verified features
- Known bugs and limitations

When a decision changes, identify which design documents, assets, code modules, and tests may be affected.

## 5. Change Control and File Safety

- Do not silently change core gameplay rules, narrative canon, art direction, or project architecture.
- Ask for approval before major scope changes, destructive operations, or changes that could invalidate significant existing work.
- Avoid having multiple agents edit the same files concurrently.
- Use Git commits or equivalent checkpoints before substantial or risky changes.
- Keep changes focused and reviewable.
- Do not replace approved art assets with temporary generated assets without authorization.
- Never report unverified implementation or test results as successful.

Routine implementation details may be decided by Claude Code when they do not alter approved behavior or introduce significant technical risk.

## 6. Asset Integration

Visual generation and code integration are separate responsibilities.

The user-selected image tool produces visual assets; Claude Code integrates approved assets into the game.

Before integration, verify:
- File format and transparency.
- Logical sprite dimensions and actual frame dimensions.
- Sprite-sheet layout and animation frame order, when applicable.
- Consistent character identity across idle, attack, hit, and defeat animations.
- Asset paths, naming conventions, and references in code.
- Readability at the intended in-game scale.

If final production assets are not yet available, use clearly identified placeholders and keep asset references easy to replace.

Do not confuse a concept illustration with a production-ready sprite sheet.

## 7. Testing and Bug Fixing

For each implemented feature:
- Define the expected behavior.
- Test normal operation and relevant edge cases.
- Check for regressions in existing systems.
- Verify that error handling and game-state transitions behave correctly.
- Report tests that were not run or could not be verified.

For bug fixes, prefer identifying and correcting the root cause over adding superficial workarounds.

## 8. Communication and Progress Reporting

For substantial tasks, report:
- Objective and scope.
- Important decisions and assumptions.
- Files or systems affected.
- Implementation status.
- Tests performed and results.
- Known limitations or unresolved issues.
- Recommended next step.

When the user is learning development, explain important technical choices in accessible language without obscuring the actual engineering details.

## 9. Governing Principle

**ChatGPT plans and reviews. The user-selected image-generation tool creates visual assets. Codex assists with technical planning and independent review. Claude Code implements and debugs. The user retains final authority over major creative and project decisions.**

This division of responsibilities should improve consistency and reduce rework, but it does not replace testing, version control, or explicit approval of significant changes.
