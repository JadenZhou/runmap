# Contributing

## Setup
```sh
nvm use                 # Node 22 (see .nvmrc)
npm install             # installs both workspaces
npm run dev             # API on :3001, app on http://localhost:5173
```

## Workflow
1. **Pick or open an issue.** Assign it to yourself so nobody else starts the same work.
2. **Branch from `main`:** `git switch -c feat/sport-picker`.
   Prefixes: `feat/`, `fix/`, `docs/`, `chore/`.
3. **Commit with [Conventional Commits](https://www.conventionalcommits.org):**
   `feat: sport picker for run and ride`, `fix: route doubles back at waypoints`.
4. **Open a pull request** with `Closes #<issue>` in the description. Fill in the
   template and add screenshots for anything visible.
5. **Review, then CI.** `main` is protected: nobody pushes to it directly, and both CI
   checks must pass. Approvals aren't required, since the project is maintained by
   one person. Instead, run `/code-review` on every code PR and fix what it finds
   before merging.
6. **Squash-merge** and delete the branch.

Keep PRs small: one feature or one fix each.

## Before pushing
```sh
npm run check     # lint, format check, types, tests, build
npm run format    # fixes formatting if the check fails
```

## Working with Claude Code
- `CLAUDE.md` holds the project rules, and every Claude session reads it. When you
  correct Claude about something project-specific, add it there in the same PR.
- Claude can write the code, but read every diff before merging.
