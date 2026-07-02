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
