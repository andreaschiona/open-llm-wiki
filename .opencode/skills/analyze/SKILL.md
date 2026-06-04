# Analyze Skill

## Purpose

This skill is activated when the `/oc analyze` command is detected.

## RULES -- ABSOLUTE CONSTRAINTS

1. You MUST NOT create any branch.
2. You MUST NOT create any commit.
3. You MUST NOT create any Pull Request.
4. You MUST NOT modify any file in the repository.
5. Your ONLY action is to post a single comment on the current issue.

## Procedure

1. Read the issue title and body.
2. Read all existing comments on the issue.
3. Examine the codebase to understand affected areas.
4. Compose a detailed functional requirement analysis.
5. Post it as a comment on the issue using `gh issue comment`.

## Output Format

Your comment MUST follow this structure:

```
## Functional Requirement Analysis

### Problem Statement
[Clear description of what needs to be solved]

### Affected Areas
[List of files, modules, or components impacted]

### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- ...

### Open Questions
- [Any ambiguities or decisions needed]
```

## Verification

Before finishing, confirm:
- Did I create any branch? If yes, ABORT -- you violated the rules.
- Did I create any PR? If yes, ABORT -- you violated the rules.
- Did I post exactly one comment? If no, something went wrong.
