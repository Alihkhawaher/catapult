# Catapult llama.cpp Options Analysis

## How This Analysis Was Performed

### Step 1: Extract Parameters from C++ Source

The extraction pipeline parses `arg.cpp` directly (the C++ source code) instead of the README:

```bash
python scripts/extract_from_source.py   # Parses arg.cpp → upstream_flags.json
python scripts/build_spec.py            # Builds llama-spec.json from upstream
```

The extractor reads every `add_opt(common_arg(...))` registration in `common_params_parser_init()` and extracts:
- **Flags**: canonical name, short aliases, negated forms (`--no-*`)
- **Type**: from lambda signature handler (`int`→integer, `string`→string, `bool`→bool, `void`→bool flag)
- **Float detection**: checks lambda body for `std::stof()`/`std::stod()` calls
- **Enum detection**: checks value_hint (`<0|1>`, `[on|off]`) and help text ("allowed values: ...")
- **Category**: from `.set_sampling()`, `.set_spec()` tags and keyword matching on flag names
- **Default**: extracted from help text "default: ..." with format string rejection (`%d`, `%s`, `%.2f` are rejected)

Result: **340 unique flags** extracted from source (246 from the old README approach).

### Step 2: Compare with Previous Codebase

Mapped current parameter keys to their CLI flag equivalents and computed the difference.

### Step 3: Generate Spec

`build_spec.py` applies typed overrides for params where the ServerConfig struct field name differs from the CLI flag (e.g. `ctx-size` → `n_ctx`), then writes the final `llama-spec.json`.

---

## Current State (Before Update)

| Metric | Count |
|--------|-------|
| TUI params (params.rs) | 176 |
| Typed ServerConfig fields | 20 |
| GUI hardcoded widgets | ~90 |
| Migration rules | 3 drop + 21 rename |
| Default n_batch | 512 |
| Default parallel | 1 |

## After Update

| Metric | Count |
|--------|-------|
| Spec params (llama-spec.json) | 343 |
| Typed ServerConfig fields | 23 |
| GUI dynamic from spec | All extra_params |
| Migration rules | 3 drop + 24 rename |
| Default n_batch | 2048 |
| Default parallel | -1 (auto) |
| Categories | 6 (Context, Hardware, Sampling, Server, Chat, Advanced) |

---

## New Switches (Added from Upstream)

These flags exist in the latest llama.cpp but were not in the codebase. They are now available via `extra_params` in the spec.

### Context & Memory (7 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `swa-checkpoints` | integer | 0 | Number of SWA checkpoints |
| `defrag-thold` | float | -1.0 | KV defragmentation threshold |
| `yarn-ext-factor` | float | -1.0 | YaRN extrapolation mix factor |
| `yarn-orig-ctx` | integer | 0 | YaRN original context size |
| `yarn-attn-factor` | float | 1.0 | YaRN attention scaling factor |
| `yarn-beta-fast` | float | 32.0 | YaRN low correction dim beta |
| `yarn-beta-slow` | float | 1.0 | YaRN high correction dim beta |

### Hardware & Threading (10 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `cpu-mask-batch` | string | — | CPU affinity mask for batch processing |
| `cpu-range-batch` | string | — | CPU affinity range for batch |
| `cpu-strict-batch` | enum | 0 | Strict CPU affinity for batch |
| `prio-batch` | enum | 0 | Thread priority for batch |
| `poll-batch` | integer | — | Polling level for batch |
| `cpu-mask-draft` | string | — | CPU affinity mask for draft model |
| `cpu-range-draft` | string | — | CPU affinity range for draft |
| `cpu-strict-draft` | enum | 0 | Strict CPU affinity for draft |
| `prio-draft` | enum | 0 | Thread priority for draft model |
| `poll-draft` | integer | — | Polling level for draft model |

### Sampling (6 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `dry-sequence-breaker` | string | — | DRY sequence breaker characters |
| `logit-bias` | string | — | Token logit bias (id:bias,...) |
| `sampler-seq` | string | — | Custom sampler sequence override |
| `grammar` | string | — | GBNF grammar file for constrained generation |
| `json-schema` | string | — | JSON schema for constrained output |
| `json-schema-file` | string | — | JSON schema file path |

### Server & Networking (14 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `cors-origins` | string | — | Allowed CORS origins |
| `cors-headers` | string | — | Allowed CORS headers |
| `cors-methods` | string | — | Allowed CORS methods |
| `cors-credentials` | bool | off | Allow CORS credentials |
| `path` | string | — | Static files serving path |
| `sse-ping-interval` | integer | — | SSE ping interval (seconds) |
| `sleep-idle-seconds` | integer | 0 | Auto-unload after idle |
| `model-url` | string | — | Download model from URL |
| `hf-repo` | string | — | HuggingFace repo for model |
| `hf-file` | string | — | HuggingFace file to load |
| `hf-repo-v` | string | — | HF repo for vision model |
| `hf-file-v` | string | — | HF file for vision model |
| `hf-token` | string | — | HF authentication token |
| `rpc` | string | — | RPC servers for distributed inference |

### Chat & Templates (6 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `reasoning-preserve` | bool | off | Preserve reasoning tokens in context |
| `embd-normalize` | integer | — | Normalize embeddings (0=none, 2=L2) |
| `mcp-servers-config` | string | — | MCP servers config file |
| `mcp-servers-json` | string | — | MCP servers JSON string |
| `mmproj-auto` | bool | off | Auto-detect multimodal projector |
| `load-mode` | string | — | Model loading mode |

### Speculative Draft (11 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `spec-draft-hf` | string | — | HF repo for draft model |
| `spec-draft-backend-sampling` | bool | off | Backend sampling for draft |
| `spec-draft-cpu-mask` | string | — | CPU mask for draft model |
| `spec-draft-cpu-range` | string | — | CPU range for draft model |
| `spec-draft-cpu-strict` | enum | 0 | Strict CPU for draft |
| `spec-draft-cpu-strict-batch` | enum | 0 | Strict CPU for draft batch |
| `spec-draft-cpu-mask-batch` | string | — | CPU mask for draft batch |
| `spec-draft-prio` | enum | 0 | Priority for draft model |
| `spec-draft-prio-batch` | enum | 0 | Priority for draft batch |
| `spec-draft-poll` | integer | — | Polling for draft model |
| `spec-draft-poll-batch` | integer | — | Polling for draft batch |

### Logging (3 new)

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `log-disable` | bool | off | Disable logging entirely |
| `log-prompts-dir` | string | — | Directory to log prompts to |
| `profile-output` | string | — | Profiling JSON output file |

---

## Changed Switches (Defaults Updated)

| Parameter | Old Default | New Default | Reason |
|-----------|-------------|-------------|--------|
| `n_batch` | 512 | **2048** | Upstream changed default batch size |
| `parallel` | 1 | **-1 (auto)** | Upstream uses auto-detection by default |

The `parallel` field type was changed from `u32` to `i32` to support the `-1` (auto) value.

---

## Updated Switches (Renamed/Migrated)

These flags were renamed in upstream llama.cpp. The spec's migration system handles them automatically.

| Old Flag | New Flag | Status |
|----------|----------|--------|
| `draft` | `spec-draft-n-max` | Renamed |
| `draft-max` | `spec-draft-n-max` | Renamed |
| `draft-n-max` | `spec-draft-n-max` | Renamed |
| `draft-min` | `spec-draft-n-min` | Renamed |
| `draft-n-min` | `spec-draft-n-min` | Renamed |
| `model-draft` | `spec-draft-model` | Renamed |
| `ctx-size-draft` | `spec-draft-ctx-size` | Renamed |
| `n-gpu-layers-draft` | `spec-draft-ngl` | Renamed |
| `gpu-layers-draft` | `spec-draft-ngl` | Renamed |
| `device-draft` | `spec-draft-device` | Renamed |
| `threads-draft` | `spec-draft-threads` | Renamed |
| `threads-batch-draft` | `spec-draft-threads-batch` | Renamed |
| `cpu-moe-draft` | `spec-draft-cpu-moe` | Renamed |
| `draft-cpu-moe` | `spec-draft-cpu-moe` | Renamed |
| `n-cpu-moe-draft` | `spec-draft-n-cpu-moe` | Renamed |
| `override-tensor-draft` | `spec-draft-override-tensor` | Renamed |
| `draft-p-min` | `spec-draft-p-min` | Renamed |
| `draft-p-split` | `spec-draft-p-split` | Renamed |
| `hf-repo-draft` | `spec-draft-hf` | Renamed |
| `cache-type-k-draft` | `spec-draft-type-k` | Renamed |
| `cache-type-v-draft` | `spec-draft-type-v` | Renamed |
| `webui-config` | `ui-config` | Renamed |
| `webui-config-file` | `ui-config-file` | Renamed |
| `webui-mcp-proxy` | `ui-mcp-proxy` | Renamed |

### Dropped (Removed from Upstream)

| Flag | Reason |
|------|--------|
| `spec-ngram-size-n` | Removed, use `spec-ngram-*-size-n` instead |
| `spec-ngram-size-m` | Removed, use `spec-ngram-*-size-m` instead |
| `spec-ngram-min-hits` | Removed, use `spec-ngram-*-min-hits` instead |

---

## Expanded Switches (New Options Added)

### New Speculative N-gram Families

The upstream added multiple ngram speculative decoding types, each with their own size/hit parameters:

| Family | Params |
|--------|--------|
| `ngram-simple` | `spec-ngram-simple-size-n`, `spec-ngram-simple-size-m`, `spec-ngram-simple-min-hits` |
| `ngram-map-k` | `spec-ngram-map-k-size-n`, `spec-ngram-map-k-size-m`, `spec-ngram-map-k-min-hits` |
| `ngram-map-k4v` | `spec-ngram-map-k4v-size-n`, `spec-ngram-map-k4v-size-m`, `spec-ngram-map-k4v-min-hits` |
| `ngram-mod` | `spec-ngram-mod-n-min`, `spec-ngram-mod-n-max`, `spec-ngram-mod-n-match` |

### New Enum Values

| Param | Old Values | New Values Added |
|-------|------------|------------------|
| `reasoning-format` | `auto`, `none`, `deepseek` | + `deepseek-legacy` |
| `spec-type` | — | `draft-simple`, `draft-eagle3`, `draft-mtp`, `ngram-cache`, `ngram-simple`, `ngram-map-k`, `ngram-map-k4v`, `ngram-mod` |

---

## Parameter Count by Category

| Category | Before | After | Delta |
|----------|--------|-------|-------|
| Context | 18 | 25 | +7 |
| Hardware | 30 | 40 | +10 |
| Sampling | 28 | 34 | +6 |
| Server | 33 | 47 | +14 |
| Chat | 17 | 23 | +6 |
| Speculative | 25 | 36 | +11 |
| Advanced | 12 | 13 | +1 |
| Logging | 10 | 13 | +3 |
| **Total** | **176** | **231** | **+55** |

---

## Architecture Change

### Before: Hardcoded in Three Places

```
params.rs (1600 lines)     → TUI autocomplete
Server.tsx (500 lines JSX) → GUI widgets
server.rs (migrations)     → CLI arg migration
```

### After: Single JSON Source

```
llama-spec.json (1 file)
    ├── TUI reads via Rust loader
    ├── GUI reads via IPC command
    └── Migrations read from spec
```

### Files Created

| File | Purpose |
|------|---------|
| `src-tauri/llama-spec.json` | The spec file (231 params) |
| `src-tauri/src/llama_spec.rs` | Rust loader module |
| `scripts/gen_spec.py` | Generator script |
| `LLAMA_SPEC.md` | Implementation docs |

### Files Modified

| File | Change |
|------|--------|
| `src-tauri/src/config.rs` | Added `llama_spec_path()` |
| `src-tauri/src/lib.rs` | Spec in AppState, IPC commands |
| `src-tauri/src/server.rs` | Defaults updated, parallel type changed |
| `src-tauri/src/tui/app.rs` | Spec in TuiApp |
| `src-tauri/src/tui_main.rs` | Load spec on startup |
| `src-tauri/src/tui/tabs/server.rs` | Spec-driven autocomplete/overrides |
| `src/pages/Server.tsx` | Spec-driven migrations |
| `src/pages/Server.migrate.test.ts` | Updated for spec-driven tests |
| `src/types/index.ts` | Added LlamaSpec types |

---

## Commands Reference

### Extract upstream flags
```powershell
python -c "import urllib.request,re; data=urllib.request.urlopen('https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md',timeout=30).read().decode('utf-8'); flags=set(); [flags.update(re.findall(r'--([a-zA-Z][a-zA-Z0-9_-]*)', line)) for line in data.split('\n') if '|' in line and '--' in line]; [print(f) for f in sorted(flags)]"
```

### Extract current params from codebase
```powershell
Select-String -Path 'src-tauri\src\tui\params.rs' -Pattern 'key: "' | ForEach-Object { $_.Line.Trim() } | Sort-Object -Unique
```

### Regenerate spec file
```powershell
python scripts\gen_spec.py
```

### Verify spec file
```powershell
python -c "import json; d=json.load(open('src-tauri/llama-spec.json')); print(f'Version: {d[\"version\"]}, Params: {len(d[\"params\"])}')"
```

### Run all tests
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
npx vitest run
```

---

## Build Workflow

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)

### Development (with hot-reload)
```powershell
npm run dev
```
This starts the Vite dev server on `localhost:1420` and opens the Tauri window with hot-reload.

### Production Build

The correct way to build a release is **always** through Tauri's build command — it handles both frontend bundling and Rust compilation, and **embeds the frontend assets into the binary**:

```powershell
# Full build (frontend + Rust + installer bundles)
npx tauri build
```

This runs `npx tsc && npx vite build` automatically (the `beforeBuildCommand`), then compiles the Rust binary with the frontend embedded.

**Do NOT use `cargo build` directly for release** — it skips frontend bundling, so the binary has no UI and shows `localhost refused to connect`.

### Output

| Output | Location |
|--------|----------|
| Release binary | `src-tauri/target/release/catapult.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/Catapult_0.1.5_x64_en-US.msi` |
| NSIS installer | `src-tauri/target/release/bundle/nsis/Catapult_0.1.5_x64-setup.exe` |
| TUI binary | `src-tauri/target/release/catapult-tui.exe` |

### Frontend-only build (for testing)
```powershell
npx tsc && npx vite build
```
This creates `dist/` but doesn't embed it into the binary. Only useful for testing the frontend separately.

### TUI build (no frontend needed)
```powershell
cargo build --manifest-path src-tauri/Cargo.toml --release --bin catapult-tui
```


