# /logs - Pull and summarize Vercel production logs

Use when something feels off on `aiedge.trade`, after a recent `/go`, or when Will asks for a production health check. Pulls runtime + build logs via the Vercel MCP and summarizes errors since the last deploy.

## Steps

1. Identify the current production deployment for the AIedge project on Vercel. Use the Vercel MCP tools (`list_projects`, `list_deployments`, `get_deployment`).
2. Pull build logs for that deployment if it's the most recent push (`get_deployment_build_logs`). Surface any warnings or errors.
3. Pull runtime logs for the production deployment (`get_runtime_logs`). Default to the last 30 minutes unless Will asks for a longer window.
4. Cross-reference with the latest commit on `main` (`git log -1 origin/main`).

## Report

Print:

- Deployment URL, commit SHA, status (`Ready` / building / errored).
- Build warnings or errors, grouped by file.
- Runtime errors grouped by route, with counts and the most recent timestamp per group.
- Anything that correlates with the latest commit (same file, same route, same symbol).
- A short take: probable cause or "no signal — looks clean."

## Rules

- Do not push fixes from `/logs`. If a fix is obvious, propose it as a separate task; Will decides whether to dispatch `/ideas` or `/chart` to act on it.
- Do not include user PII or auth tokens if they appear in log lines — redact before printing.
- Do not start a dev server.
