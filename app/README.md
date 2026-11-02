# Legend Finance Hub — app

Next.js + React app (from the Snowflake App Runtime template) for the Legend Biotech finance demo.
See the repository [README](../README.md) for install, the demo script and how the close workflow works.

```bash
npm ci
npm run dev -- -p 3010     # http://localhost:3010
npm test                   # unit tests (vitest)
```

Configuration comes from `.env.local`, which `install.sh` writes (see `.env.example`):

| Variable | Purpose |
|---|---|
| `SNOWFLAKE_CONNECTION_NAME` | `snow` CLI connection used for all queries |
| `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE` | Warehouse and role for queries |
| `LEGEND_DB` | Database created by the installer (default `LEGENDBIO`) |
| `LEGEND_AGENT_VIA_SQL=1` | Call the agent via `DATA_AGENT_RUN` instead of the REST API |

## Code map

| Path | What |
|---|---|
| `app/*/page.tsx` | Server-rendered pages querying `${LEGEND_DB}.FINANCE` |
| `app/api/chat` | Streams the Cortex Agent's answer to the Assistant panel |
| `app/api/close/*` | Close agent run, issues and actions, rules editor, Assistant-drafted emails |
| `app/api/scenarios` | What-if functions and saved scenarios |
| `lib/agent.ts` | Cortex Agent client (REST with PAT/OAuth, SQL fallback) |
| `lib/snowflake.ts`, `lib/sar-sdk/` | Template query helpers (connection pooling, auth). Don't modify |
| `components/finance/*` | Charts, Assistant panel, close agent, issues board, rules editor, scenarios |

When running tests inside Cortex Code, unset `SNOWFLAKE_DEFAULT_CONNECTION_NAME` first. One template test reads it from the environment.
