# open-llm-wiki -- Agent Instructions

## STOP -- Read This First

You are handling a `/oc` slash command. You MUST:
1. Parse the command from the triggering comment (analyze, plan, fix, implement, fixCheck, review).
2. Execute ONLY that command's behavior as defined below.
3. For `analyze` and `plan`: POST A COMMENT ONLY. Do NOT edit files, create branches, or PRs.
4. For `fix`: push a branch only. Do NOT create a PR.
5. For `implement`: this is the ONLY command that creates a PR.

If the command is `analyze` or `plan`, your job is DONE after posting one comment via `gh issue comment`.
DO NOT touch any source code files for analyze or plan commands.

## IMPORTANT: Auto-update disabled

The `autoupdate` option in `opencode.json` is set to `false`. Do NOT attempt to update the
`@opencode-ai/plugin` version in `.opencode/package.json`. If you see that file change, skip it.
The plugin version should only be updated manually by the repo owner. Any auto-update would
create a noise PR with no real changes, which is not desired.

## Project Overview

This project uses Node.js with a Tauri (Rust) backend.

## Verified Commands

| Action | Command |
|--------|---------|
| Build  | `echo 'no build'` |
| Test   | `npx vitest run` |
| Lint   | `echo 'no linter'` |

## Environment

No special environment constraints.

## OpenCode Protocol

The agent MUST handle slash-commands found in issue or PR comments.

### Parsing

When opencode is triggered by a comment:
1. Read the comment body from the triggering event.
2. If the comment starts with `/oc` or `/opencode`, extract the first whitespace-delimited token immediately following the prefix.
3. The remainder of the comment (after the command token) is the **instruction payload**.
4. Route to the appropriate behaviour based on the command token.

### Dispatch Table

| Command | Scope | Behaviour |
|---------|-------|-----------|
| `/oc fix` | Issue | Apply a quick corrective change. Analyse the issue, create a throwaway fix branch from `master`, apply the fix, commit with `fix:` prefix, and push. Do NOT create a PR. The instruction payload may describe the fix intent. |
| `/oc analyze` | Issue | Read the issue body and all comments. Perform a critical analysis, then post a detailed functional requirement as a new issue comment. Include: problem statement, affected areas, acceptance criteria, and open questions. The instruction payload may scope the analysis. |
| `/oc plan` | Issue | (Requires prior analyze comment) Read the analysed functional requirement from the issue. Produce a technical implementation plan with file-level breakdown, and post it as a new issue comment. List each file to create or modify, the approach, and any dependencies. |
| `/oc implement` | Issue | (Requires prior plan comment) Create a feature branch named `issue-{{number}}` from `master`. Implement the plan file-by-file, committing each logical unit with a conventional commit message. Open a Pull Request targeting `master` that includes `Closes #{{number}}` in the description. |
| `/oc fixCheck` | PR | Read the PR's automated check results (lint errors, test failures). For each failure, apply a fix, amend the PR branch, and re-trigger checks. Repeat up to 3 retries. When done (all passing or retries exhausted), post a status comment on the PR. |
| `/oc review` | PR | Perform a full code review AND automated fix. Read the PR diff and file changes, produce a structured review comment with: changed file summary, code quality analysis, bug findings, and improvement suggestions. Then execute the same fix logic as `/oc fixCheck`: read check results, apply fixes, amend the PR branch, and re-trigger checks up to 3 retries. Post both the review and the fix status as PR comments. |

### CRITICAL RULES -- READ BEFORE ACTING

- **`/oc analyze` MUST ONLY post a comment.** NEVER create branches, commits, or PRs for analyze.
- **`/oc plan` MUST ONLY post a comment.** NEVER create branches, commits, or PRs for plan.
- **`/oc fix` MUST NOT create a PR.** Only push the fix branch.
- **`/oc implement` is the ONLY command that creates a PR.**
- **`/oc fixCheck` and `/oc review` MUST NOT create a new branch or PR; they work on the existing PR branch.**
- If the command is `analyze`, your ENTIRE output is a GitHub issue comment. Nothing else.
- Execute EXACTLY ONE command per invocation. Do not chain or anticipate next steps.

### Instruction Payload

Any text after the command token is the instruction payload. The agent MAY use it for additional context:
- `/oc fix add null guard` → command `fix`, payload `add null guard`
- `/oc analyze` → command `analyze`, payload empty

### Model Overrides

The workflow sets the model based on keywords anywhere in the comment (case-insensitive):

| Keyword | Model |
|---------|-------|
| `GEMINI` | `google/gemini-2.5-flash` |
| `BIGPICKLE` | `opencode/big-pickle` |
| `NEMOTRON` | `opencode/nemotron-3-super-free` |
| (default) | `opencode/deepseek-v4-flash-free` |

## Commit Convention

Every commit MUST follow the Conventional Commits specification:
- `feat: ...` -- a new feature
- `fix: ...` -- a bug fix
- `chore: ...` -- maintenance, dependencies, tooling
- `BREAKING CHANGE: ...` or `feat!: ...` -- incompatible API changes

## Branch Naming

Feature branches MUST follow the pattern: `issue-{{number}}`
Always branch from `master`.

## Version Configuration

Version is stored in: `VERSION`
