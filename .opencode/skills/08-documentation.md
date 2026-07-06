# Documentation

## When to Update
After completing any feature or change (Full Protocol), update the relevant documentation files. Small fixes (CSS/typography) skip this step.

## File Map

| File | Purpose | When to Update |
|------|---------|---------------|
| `CHANGELOG.md` | Log all changes per PR | Every completed feature/fix |
| `STATE.md` | Track progress, completed items, next up | Every completed phase or milestone |
| `ROADMAP.md` | High-level roadmap and planned features | When phases are reprioritized or added |
| `ARCHITECTURE.md` | System architecture decisions | When new modules/deletions/refactors occur |
| `README.md` | Project overview, setup, quick start | When setup steps change or major features added |
| `docs/` | User guides, feature documentation | Every new feature or significant UI change |
| `AGENTS.md` | AI agent protocol and workflows | When workflow changes (tiers, commands, locations) |
| `.opencode/skills/*.md` | AI skill files | When standards/guidelines evolve |

## CHANGELOG.md Format
```markdown
## [YYYY-MM-DD] — {Phase/Change Title}

### Backend
- {Change description with file/function references}

### Frontend
- {Change description with component references}

### Tests
- {Test additions/fixes with results}
```

## STATE.md Format
- Current milestone at top with status
- Completed items as checkboxes with brief descriptions
- "Next Up" section with planned work
- Update progress percentages where visible

## Documentation Principles
- **Be concise**: Prefer bullet points over paragraphs
- **Be specific**: Include file paths, function names, component names
- **Be current**: Remove outdated entries rather than leaving stale content
- **Be consistent**: Use the same terminology and formatting as existing docs
- **Reader-first**: Write for a developer unfamiliar with the codebase

## What NOT to Document
- Personal preferences or opinions
- Speculative features not yet in development
- Outdated implementation details superseded by newer approaches
- Test data details (they change and clutter docs)

## Git Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

### Format
```
type(scope): short imperative description

Optional body explaining the why behind the change.
Wrap at 72 characters.

Optional footer: Closes #123
```

### Types
| Type | When to Use |
|------|-------------|
| `feat` | New feature or behavior visible to users |
| `fix` | Bug fix |
| `refactor` | Code restructuring with no behavior change |
| `perf` | Performance improvement |
| `test` | Adding or fixing tests |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, lint (no logic change) |
| `chore` | Build scripts, dependencies, tooling |
| `ci` | CI/CD pipeline changes |

### Rules
- **Scope**: Part of codebase most affected (lowercase): `auth`, `api`, `ui`, `db`, `voucher`, `gst`
- **Subject**: Max 72 characters, imperative mood ("add" not "added"), no period, no capital after colon
- **Body**: Explain *why*, not *what* (diff shows what). Wrap at 72 chars.
- **Footer**: `Closes #123`, `Fixes #456`, `BREAKING CHANGE: description`

### Examples
```
feat(voucher): add e-invoice generation for B2B sales

Adds POST /einvoice/generate endpoint that validates voucher data,
generates IRN via NIC sandbox, and stores the response. Only for
B2B vouchers with GSTIN parties.

Closes #142
```

```
fix(members): prevent non-admin from removing superadmin

Adds check in DELETE /members/{id} that returns 400 if target
user is superadmin. Frontend disables the button with tooltip.

Fixes #189
```

## Pull Request Descriptions
Write PR descriptions that help reviewers do their job without chasing you for context.

### Template
```markdown
## Summary
- 1-3 bullet points. What changed and why. Not implementation details.

## Changes
Group related changes. Use sub-bullets for detail:
- `backend/app/api/v1/vouchers.py` — added validation for negative amounts
- `backend/tests/test_vouchers.py` — added 3 test cases for edge cases

## Test Plan
Concrete steps a reviewer can follow:
- [ ] Run `docker-compose exec -T api pytest tests/` — all pass
- [ ] Create a voucher with negative amount — returns 422
- [ ] Create a voucher with zero amount — returns 422
- [ ] Create a voucher with valid amount — returns 200

## Risks and Notes
Caveats, known limitations, things to watch:
- This change affects the voucher creation flow — verify existing tests pass
- The validation was added at the schema level, not the service level

## Related
- Closes #123
- Related to #456
```

### Tone Rules
- Write for the reviewer, not yourself
- Be specific — "added rate limiting" is useless; "5 req/min limit on login endpoint" is useful
- Assume reviewer knows the codebase but hasn't seen this change
- Flag uncertainty — "I believe this is backwards-compatible but please check..."
