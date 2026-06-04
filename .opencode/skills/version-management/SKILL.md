# Version Management Skill

## Workflow

Issue -> Branch -> Commit -> PR -> Merge -> Release

## Branching

- All feature branches MUST be created from `main`.
- Branch name pattern: `issue-{{number}}`

## Commits

Every commit MUST be formatted according to the Conventional Commits specification:

| Type | Description |
|------|-------------|
| `feat` | A new feature (MINOR bump) |
| `fix` | A bug fix (PATCH bump) |
| `chore` | Maintenance, dependencies, tooling |
| `BREAKING CHANGE` | Incompatible API changes (MAJOR bump) |
| `!:` | Alternative syntax for breaking changes |

Examples:
- `feat: add user authentication endpoint`
- `fix: correct null pointer in login handler`
- `chore: update dependencies`
- `feat!: redesign API response format`

## Pull Requests

- PR title MUST start with a conventional commit type (e.g., `feat:`, `fix:`).
- PR description MUST include `Closes #{{number}}`.

## Version Properties

Version is tracked in: `VERSION`
The version field MUST be updated by the release workflow according to the semver
bump determined from commit history since the last tag.
