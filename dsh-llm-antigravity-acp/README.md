# dsh-llm-antigravity-acp — inference-only local fork

Version: **0.4.0-local.1**. Scope: existing Task `20261111-161609-agy安装与ACP额度裁剪及面板复用`, branch `local/acp-inference-only`, upstream base `0a90ec37c69430608084e33ebc2f891e328c9e89`.

## Authentication gate — not yet verified

This fork supplies an ACP inference bridge, **not authentication or quota management**. It uses exactly one system account (`default`). The optional `accountLabel` is a local remark, never an email or signed-in identity.

- The official `agy` process alone owns login, credential access and refresh. The plugin does not read/copy OAuth files, decode credentials, create token links, point at OCX tokens, create/unlock keyrings, or expose login RPCs.
- `--gemini-dir <plugin home>` and `--app-data-dir agy` remain isolated so DSH bridge rules/settings do not consume global CLI rules, skills or MCP configuration. The OS home/environment is inherited; no extra account sandbox is created.
- **Linux authentication sharing with that isolated app-data directory is NOT VERIFIED.** Removing the old file-copy workaround may mean the official CLI cannot find its login. A successful build, ACP initialization or cached catalog is not proof that inference is usable. An AUTH failure is reported, not bypassed. The parent task must verify the official CLI's supported sharing behavior; any additional OAuth-file copy needs separate user approval.
- This implementation was validated with a fake CLI only. No real `agy acp`, login, Google business query, DSH-profile modification, deployment or restart was performed. Until the parent completes admission, use `warmup: false` when preparing configuration; the plugin can mount without prior login and without launching ACP.

## What remains

DSH adapter → official ACP stdio → one independent ACP session per DSH session/purpose → per-tenant loopback MCP bridge → DSH-owned tools. Parent and child sessions may run concurrently; they do not share a turn.

- Streaming text/reasoning, model/effort selection, dynamic tools, tool permissions, bridge bearer isolation and cancellation.
- Warm session reuse, durable session index/native `session/load`, bounded transcript replay after rewritten history, auxiliary sessions and subagent concurrency.
- Long-running tool relay (`dsh_await_result`), long-decode continuation and images.
- Per-generation token usage from local conversation SQLite databases, falling back to normalized prompt usage. These are inference usage statistics, **not subscription quota queries**.
- Original stable failure codes and finite harness retry policy (maxRetries 4). QUOTA is not made retryable; transient RATE_LIMIT keeps the upstream retry-after. No hidden multi-account retry, pool cooldown, scheduling or failover remains. Existing bounded degraded-route re-answer semantics (two grants per identical request) remain.
- Optional local context-unlock check/patch behavior remains. It is separate from authentication and does not grant model entitlement.

## Removed

Quota pill, quota settings/status details, quota refresh/warmup/RPCs, QuotaReader, CloudCode subscription/model-entitlement/quota queries and OAuth refresh; credential/email readers and automatic token copies; account editors/login flows, per-account model/context settings and multi-account failover. No generic authentication/multi-source framework was added. Existing external quota panels are not implemented or modified by this package.

## Real model discovery

Only ACP `session/new` / `session/load` configuration options and `models.availableModels` populate the catalog. Initial discovery still uses `warmupSlotViaAcp` and normal sessions still use `observeSlotCatalog`. There is no hardcoded fallback model list. A first run has an empty/unobserved catalog until ACP answers; an allowlist cannot invent models.

The optional disk cache is tagged `source: acp`. Legacy unproven caches (including upstream CloudCode/fallback data) are ignored. A previously observed ACP cache can populate the picker on restart, but `observed` remains false until this process receives a live observation. Cached names are not an authentication or entitlement guarantee. Efforts derive from real configuration/inventory; model availability is ultimately enforced by official ACP errors.

## Configuration

The custom settings card and composer keep model/effort controls, context window and long-decode continuation. The only account control is a local remark (blank allowed; whitespace normalized; at most 64 Unicode codepoints).

| Field | Default | Meaning |
|---|---|---|
| `provider` / `displayName` | `antigravity` / `Antigravity` | Provider route/group |
| `command` | blank | Absolute official CLI path, otherwise standard local/PATH discovery |
| `home` | blank | Isolated config/session cache under `$DSH_HOME/cache/antigravity-acp` |
| `accountLabel` | blank | Display-only system-account remark |
| `visibleModels` | `[]` | Provider-wide narrowing allowlist over observed models |
| `contextWindow` | `0` | Auto ceiling: 256,000 locked or 1,048,576 unlocked; GPT-OSS 131,072; explicit global override supported |
| `defaultEffort` | `high` | Default requested thought level |
| `autoPatch` / `patchScript` | true / blank | Optional existing local context-unlock check/patch |
| `maxLiveSessions` | 16 | Concurrent retained ACP sessions |
| `idleSessionTtlMs` | 1,800,000 | Idle session/process sweep |
| `parkSettleMs` / `coldSwitchSettleMs` | 250 / 80 | Tool grouping / cold model-switch settle |
| `keepAliveMs` / `relayAfterMs` | 15,000 / 85,000 | MCP keepalive / long-tool relay |
| `longDecodeContinuations` | 3 | Bounded automatic long-output continuation |
| `warmup` | true | Start ACP model discovery on plugin activation; **set false pending authentication admission** |

Retired `accounts`, `configVersion`, quota and legacy migration fields no longer drive runtime behavior. There is no automatic boot-time settings-profile migration/writeback. Explicit UI saves persist only supported fields via the host settings service. Existing isolated local settings are retained; host CLI settings are never inherited.

## Local validation

Package scripts accept existing dependency locations explicitly; they do not install packages, scan profiles, create symlinks, or change the global DSH installation. When normal local dependencies are available no override is needed; in this workspace:

```sh
export DSH_NODE_MODULES=/home/ubuntu/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules
export DSH_TSC=/home/ubuntu/deepseek-harness/node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/bin/tsc
npm run typecheck
npm run build
npm test
```

The compiler path above is an existing local validation dependency, not a required runtime location. Build writes local `lib/`; check shared consumption before building anywhere else. This baseline tracks precompiled `lib/`, so this fork updates it together with source and removes retired executable modules. Tests use the scripted fake CLI plus temporary directories, in-memory UI and stub services. No real CLI is needed.

## Limits

Authentication sharing and real model inference remain unverified by this change. No profile is installed or activated here. ACP does not expose sampling controls such as temperature/stop/maxTokens; upstream model listings, client allowlists, availability and rate limits remain official CLI responsibilities. Local token-usage/degraded-route detection still depends on official conversation database formats and Node's SQLite support. There is no multi-account fallback if the sole system account cannot serve a request.
