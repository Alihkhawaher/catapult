# Updating Catapult to Latest llama.cpp Options

## Overview

Catapult uses an external JSON spec file (`llama-spec.json`) as the single source of truth for all llama.cpp server parameters. This file drives:

- **TUI** autocomplete and parameter forms
- **GUI** dynamic parameter rendering
- **Server** CLI argument building and migration logic

The spec file is **embedded in the binary** as a default, then **extracted to disk on first launch**. Users can edit the disk copy to add/modify parameters without rebuilding.

## How It Works

```
Binary starts
    │
    ├── Read {data_dir}/catapult/llama-spec.json
    │   ├── EXISTS → use it (user may have customized it)
    │   └── MISSING → extract embedded copy to disk, then use it
    │
    ├── TUI: parse JSON → Vec<ParamDef> for autocomplete/forms
    ├── GUI: expose via IPC → Server.tsx renders dynamically
    └── Server: parse migrations from JSON for migrate_extra_params()
```

## File Locations

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%/catapult/llama-spec.json` |
| macOS    | `~/Library/Application Support/catapult/llama-spec.json` |
| Linux    | `~/.local/share/catapult/llama-spec.json` |

## Spec File Structure

```json
{
  "version": 1,
  "source": "https://github.com/ggml-org/llama.cpp/blob/master/common/arg.cpp",
  "migrations": {
    "drop": ["spec-ngram-size-n", ...],
    "rename": { "draft": "spec-draft-n-max", ... }
  },
  "defaults": { "n_batch": 2048, "parallel": -1 },
  "params": [
    {
      "key": "temperature",
      "label": "Temperature",
      "description": "Sampling temperature (0=greedy, higher=more random)",
      "type": "float",
      "min": 0,
      "max": 2,
      "step": 0.01,
      "decimals": 2,
      "default": "0.80",
      "category": "Sampling",
      "typed": true,
      "cli_flag": "temp"
    },
    ...
  ]
}
```

### Param Types

| Type | Widget (TUI) | Widget (GUI) | Extra Fields |
|------|-------------|--------------|--------------|
| `"integer"` | Number input | `NumberInput` | `min`, `max`, `step` |
| `"float"` | Number input | `NumberInput` or `Slider` | `min`, `max`, `step`, `decimals` |
| `"bool"` | Checkbox | `Toggle` | — |
| `"string"` | Text input | `TextInput` | — |
| `"enum"` | Dropdown | `SelectInput` | `enum_values: [...]` |

When `min`/`max` are present on a numeric type, the GUI renders a **slider**.

### Widget Hints

The optional `widget` field on a param controls special rendering:

| Widget | TUI | GUI | Use for |
|--------|-----|-----|---------|
| `"slider"` | (n/a) | Slider with min/max/step | Numeric params with range (temperature, top-k, etc.) |
| `"file"` | Text input | Text input + **Browse** file button | File paths (LoRA, grammar, SSL certs, API keys, etc.) |
| `"model"` | Model picker popup | Dropdown of installed GGUF models + **Browse** button | GGUF model paths (spec-draft-model, etc.) |

The `"model"` widget filters out the main model (the one selected at the top of the Server page) from the dropdown, since you wouldn't use the same model as both main and draft. Users can still type a custom path for models not in scanned directories.

File-path params are automatically detected from the upstream `arg.cpp` source (value hint `"FNAME"`) and assigned the appropriate widget when the spec is rebuilt with `build_spec.py`.

### Categories

Params are grouped into 6 tabs: `Context`, `Hardware`, `Sampling`, `Server`, `Chat`, `Advanced`

### Typed vs Extra Params

- **`typed: true`** — Mapped to a `ServerConfig` struct field with specialized GUI handling
- **`typed: false`** — Stored in `extra_params: HashMap<String, String>`, passed through as `--flag value`

## Updating Parameters

### To add a new llama.cpp flag:

1. Edit `llama-spec.json` in the app data directory (`%APPDATA%/catapult/llama-spec.json`)
2. Add a new entry to the `params` array with the appropriate `category` and `type`
3. Restart the app — the new parameter appears in both TUI autocomplete and GUI Server tab automatically

**No code changes, no rebuild needed.** The GUI renders all parameter widgets dynamically from the spec.

### How the GUI renders params

- **Tabs are fixed**: Context, Hardware, Sampling, Server, Chat, Advanced
- **Params within each tab are dynamic**: driven by `spec.params.filter(p => p.category === ...)`
- **Widget type is driven by the param's `type` field**:
  - `bool` → Toggle
  - `enum` → SelectInput dropdown with `enum_values`
  - `integer`/`float` with `min`/`max` → Slider
  - `integer`/`float` without → NumberInput
  - `string` with `widget: "file"` → TextInput + Browse file button
  - `string` with `widget: "model"` → Model dropdown + Browse GGUF button
  - `string` → TextInput
- **Typed params** (`typed: true`) read/write from `ServerConfig` fields directly
- **Non-typed params** (`typed: false`) read/write from `extra_params[cli_flag]`

### To update to latest upstream llama.cpp:

```bash
python scripts/extract_from_source.py   # Parse arg.cpp → upstream_flags.json
python scripts/build_spec.py            # Build llama-spec.json from upstream
```

The extractor reads `tmp/arg.cpp` (cached locally) or fetches it from GitHub. It parses every `add_opt(common_arg(...))` registration to extract types, categories, enum values, and defaults programmatically from the C++ source code.

### To reset to defaults:

Delete `llama-spec.json` from the data directory. The app will re-extract the embedded copy on next launch.

## Current Stats

- **343 parameters** across 6 categories
- **23 typed fields** (model, host, port, temperature, etc.)
- **320 extra params** (grammar, CORS, YaRN, speculative, etc.)
- **24 rename migrations**, 3 drop migrations
- **Default changes**: `n_batch` 512→2048, `parallel` 1→-1 (auto)

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/llama-spec.json` | The complete spec file (343 params) |
| `scripts/extract_from_source.py` | Source-based extractor (parses `arg.cpp`) |
| `scripts/build_spec.py` | Spec builder with typed overrides |
| `src-tauri/src/llama_spec.rs` | Spec loader module |
| `src-tauri/src/config.rs` | Added `llama_spec_path()` helper |
| `src-tauri/src/lib.rs` | Added spec to AppState, IPC commands, migration |
| `src-tauri/src/server.rs` | Updated defaults (n_batch, parallel), parallel type u32→i32 |
| `src-tauri/src/tui/app.rs` | Added spec to TuiApp |
| `src-tauri/src/tui_main.rs` | Load spec on startup |
| `src-tauri/src/tui/tabs/server.rs` | Use spec for autocomplete and overrides |
| `src/pages/Server.tsx` | Load spec via IPC, dynamic param rendering |
| `src/pages/Server.migrate.test.ts` | Updated tests for spec-driven migrations |
| `src/types/index.ts` | Added LlamaSpec, LlamaParamDef types |

The app automatically picks up changes on restart. No Rust/TypeScript code changes needed for new params.

## Migration System

The spec file includes a `migrations` section that handles:
- **Drop**: Flags removed from upstream (e.g., `spec-ngram-size-n`)
- **Rename**: Flags renamed upstream (e.g., `draft` → `spec-draft-n-max`)

Migrations are applied:
- In Rust: via `LlamaSpec::migrate_extra_params()`
- In TypeScript: via `migrateExtraParams(extra, spec)`
- On preset load, session restore, and server start
