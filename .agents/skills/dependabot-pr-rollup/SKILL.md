---
name: dependabot-pr-rollup
description: Find open Dependabot PRs for ruff-action, compare each PR head to its base branch, replay only the remaining npm and GitHub Actions changes in a fresh worktree and branch, run repository validation, and optionally commit, push, and open a PR. Use when you want to batch or manually replicate active Dependabot updates.
license: MIT
compatibility: Requires git, git worktree, gh CLI auth, npm, and a GitHub repo with an origin remote.
---

# Dependabot PR Rollup

## When to use

Use this skill when the user wants to:
- find all open Dependabot PRs in this repo
- reproduce their net effect in one local branch
- validate the result with the repo's standard checks
- optionally commit, push, and open a PR

## Workflow

1. Inspect the current checkout state, but do not reuse a dirty worktree.
2. List open Dependabot PRs with `gh pr list --state open --author app/dependabot`.
3. For each PR, collect the title, base branch, head branch, changed files, and relevant diffs.
4. Compare each PR head against `origin/<base>` instead of trusting the PR title. Dependabot PRs can already be partially merged, superseded by newer versions, or have no remaining net effect.
5. Create a new worktree and branch from `origin/<base>`.
6. Reproduce only the remaining dependency changes in the new worktree.
   - Inspect `package.json` before editing npm dependencies.
   - Run `npm ci --ignore-scripts` before applying npm updates so dependency commands run from a clean install.
   - Use `npm install ... --ignore-scripts` for direct npm dependency changes so `package-lock.json` stays in sync.
   - Preserve whether an npm package is a `dependency` or `devDependency`.
   - When updating `@biomejs/biome`, also update the Biome schema URL version in `biome.json` to match the installed Biome version.
   - For GitHub Actions updates, apply the net workflow-file changes from the Dependabot PR heads after confirming they still apply cleanly to the selected base.
7. Run `npm run all`.
8. If requested, commit the changed source, lockfile, workflow files, and generated artifacts, then push and open a PR.

## Repo-specific notes

- Use `gh` for GitHub operations.
- Keep the user's original checkout untouched by working in a separate worktree.
- This repo has Dependabot configured for both `npm` and `github-actions`.
- In this repo, `npm run all` is the safest validation command because it runs build, check, package, and unit tests.
- `npm run check` may rewrite files with Biome; include those intentional formatting changes.
- If dependency changes affect bundled output, include the regenerated `dist/` files from `npm run package`.

## Report back

Always report:
- open Dependabot PRs found
- which PRs required no net changes
- new branch name
- new worktree path
- files changed
- `npm run all` result
- if applicable, commit SHA and PR URL
