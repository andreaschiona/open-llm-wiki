# Issue-to-Merge Skill

Full end-to-end workflow for any issue: from creation through
analysis, planning, implementation, PR, and merge.

## Workflow

```text
Issue → Analyze → Plan → Branch → Implement → Commit
  → Push → PR → Verify → Merge → Close
```

## Rules

1. Execute exactly one phase per invocation. Do not skip phases.
2. The phases are: `create-issue`, `analyze`, `plan`, `implement`,
   `pr`, `verify`, `merge`.
3. Each phase handles its own GitHub interactions using `gh` CLI.
4. Do not commit secrets, API keys, or tokens.
5. Branch naming: `issue-{{number}}`.
6. Base branch: `master`.

## Phase: create-issue

Create a GitHub issue with title, body, and labels.

### Procedure (create-issue)

1. Read user's description of the bug/feature.
2. Examine the codebase to understand context.
3. Create the issue using `gh issue create`.
4. Return the issue URL.

## Phase: analyze

Analyze the issue requirements by reading the issue body and
codebase.

### Procedure (analyze)

1. Read the issue title and body with `gh issue view <number>`.
2. Examine the codebase to identify affected files.
3. Post a Functional Requirement Analysis comment on the issue.

### Output (analyze)

```text
## Functional Requirement Analysis

### Problem Statement
[Clear description]

### Affected Areas
[Files, modules, components]

### Acceptance Criteria
- [ ] [criterion]

### Open Questions
- [question]
```

## Phase: plan

Read the analysis and produce a technical implementation plan.

### Procedure (plan)

1. Read the issue and its analysis comments.
2. Examine codebase for affected areas.
3. Post a Technical Implementation Plan comment on the issue.

### Output (plan)

```text
## Technical Implementation Plan

### Overview
[Summary]

### Files to Modify
- `path/to/file`: [changes]

### Implementation Steps
1. [step]

### Dependencies
[prerequisites]

### Risk Assessment
[risks]
```

## Phase: implement

Create a branch, implement the changes, commit, and push.

### Procedure (implement)

1. Create branch `issue-{{number}}` from `master`.
2. Apply all implementation changes (edit files).
3. Commit each logical unit with conventional commit message.
4. Push the branch.
5. Run lint/test commands if available.

## Phase: pr

Open a Pull Request targeting `master`.

### Procedure (pr)

1. Push branch if not already pushed.
2. Create PR using `gh pr create`.
3. Return the PR URL.

## Phase: verify

Read PR check results and fix failures.

### Procedure (verify)

1. Wait for checks with `gh pr checks <number> --watch`.
2. If checks fail, apply fixes and amend the PR branch.
3. Repeat up to 3 retries.
4. Post a status comment on the PR.

## Phase: merge

Merge the PR and close the issue.

### Procedure (merge)

1. Verify checks are passing with `gh pr checks <number>`.
2. Merge with `gh pr merge <number> --squash --delete-branch`.
3. Verify issue is closed with `gh issue view <number>`.
4. Switch back to master.

## Verification

Before finishing each phase, confirm:
- Did I follow the exact phase procedure?
- Did I use the correct branch?
- Did I avoid committing secrets?
