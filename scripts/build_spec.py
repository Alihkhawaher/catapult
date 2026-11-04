#!/usr/bin/env python3
"""Build llama-spec.json from upstream_flags.json (source-based format).

The upstream_flags.json now contains type, category, and enum_values directly
from arg.cpp -- no more guessing from README prose.
"""
import json, os

flags_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "upstream_flags.json")
with open(flags_path, "r", encoding="utf-8") as f:
    upstream = json.load(f)

# Skip meta/utility commands
SKIP = {"help", "usage", "version", "cache-list", "completion-bash"}

# Params whose value_hint is "FNAME" but which should NOT get a file-browse widget
# (they are output files, URLs, or not useful to browse for)
FNAME_SKIP_WIDGET = {
    "file",               # --file: prompt input file (CLI-only, not server)
    "output",             # --output: output file
    "binary-file",        # --binary-file: CLI-only
    "in-file",            # --in-file: CLI-only
    "system-prompt-file", # --system-prompt-file: CLI-only
    "context-file",       # --context-file: CLI-only
    "positive-file",      # --positive-file: cvector generator
    "negative-file",      # --negative-file: cvector generator
    "save-all-logits",    # --save-all-logits: perplexity
    "prompt-cache",       # --prompt-cache: CLI-only
    "mmproj",             # --mmproj: already typed with special handling
    "model",              # --model: already handled by main model picker
    "tts-lang",           # --tts-lang: language code, not a file path
}

# Params that should get widget: "model" (dropdown of installed GGUF models)
MODEL_WIDGET_PARAMS = {
    "spec-draft-model",
    "vocoder-model",
}

# ServerConfig struct field overrides: cli_flag -> extra fields
# Only specify what differs from upstream. The rest comes from upstream_flags.json.
TYPED = {
    "ctx-size":      {"key": "n_ctx",          "default": "0"},
    "n-predict":     {"key": "n_predict",      "default": "-1"},
    "batch-size":    {"key": "n_batch",        "default": "2048"},
    "ubatch-size":   {"key": "n_ubatch",       "default": "512"},
    "flash-attn":    {"key": "flash_attn",     "default": "auto"},
    "cache-type-k":  {"key": "cache_type_k",   "default": "f16"},
    "cache-type-v":  {"key": "cache_type_v",   "default": "f16"},
    "n-gpu-layers":  {"key": "n_gpu_layers",   "default": "-1"},
    "threads":       {"key": "n_threads",      "default": ""},
    "cont-batching": {"key": "cont_batching",  "default": "on"},
    "mlock":         {"key": "mlock",          "default": "off"},
    "no-mmap":       {"key": "no_mmap",        "default": "off"},
    "temp":          {"key": "temperature",    "default": "0.80",
                      "widget": "slider", "min": 0, "max": 2, "step": 0.01, "decimals": 2},
    "seed":          {"key": "seed",           "default": "-1"},
    "top-k":         {"key": "top_k",          "default": "40",
                      "widget": "slider", "min": 0, "max": 200, "step": 1},
    "top-p":         {"key": "top_p",          "default": "0.95",
                      "widget": "slider", "min": 0, "max": 1, "step": 0.01, "decimals": 2},
    "min-p":         {"key": "min_p",          "default": "0.05",
                      "widget": "slider", "min": 0, "max": 1, "step": 0.001, "decimals": 3},
    "host":          {"key": "host",           "default": "127.0.0.1"},
    "port":          {"key": "port",           "default": "8080"},
    "parallel":      {"key": "parallel",       "default": "-1"},
    "numa":          {"key": "numa",           "default": ""},
    "mmproj":        {"key": "mmproj_path",    "default": ""},
    # spec-type: needs enum_values override (can't be extracted from source)
    # but must be typed:false (no ServerConfig field — flows through extra_params)
    "spec-type":     {"type": "enum", "typed": False,
                      "enum_values": ["draft-simple", "draft-eagle3", "draft-mtp",
                                      "draft-dflash", "draft-dspark",
                                      "ngram-cache", "ngram-simple",
                                      "ngram-map-k", "ngram-map-k4v", "ngram-mod"]},
}

# BUILD PARAMS FROM UPSTREAM
params = []
seen = set()
for flag, meta in sorted(upstream.items()):
    if flag in SKIP or flag in seen:
        continue
    entry = {
        "key": flag, "label": flag,
        "description": meta["desc"][:200],
        "type": meta["type"],
        "default": meta["default"],
        "category": meta["category"],
        "typed": False,
        "cli_flag": flag,
    }
    if meta.get("enum_values"):
        entry["enum_values"] = meta["enum_values"]
    # Add widget hints for file-path params (FNAME in arg.cpp)
    vh = meta.get("value_hint")
    if vh == "FNAME":
        if flag in MODEL_WIDGET_PARAMS:
            entry["widget"] = "model"
        elif flag not in FNAME_SKIP_WIDGET:
            entry["widget"] = "file"
    params.append(entry)
    seen.add(flag)

# APPLY TYPED OVERRIDES (struct field mapping, widget settings, default overrides)
typed_clis = set(TYPED.keys())
params = [p for p in params if p["cli_flag"] not in typed_clis]
for cli_flag, overrides in TYPED.items():
    up = upstream.get(cli_flag, {})
    entry = {
        "key": overrides.get("key", cli_flag),
        "label": cli_flag,
        "description": up.get("desc", "")[:200],
        "type": overrides.get("type", up.get("type", "string")),
        "default": overrides.get("default", up.get("default", "")),
        "category": overrides.get("category", up.get("category", "Server")),
        "typed": overrides.get("typed", True),
        "cli_flag": cli_flag,
    }
    if overrides.get("enum_values"):
        entry["enum_values"] = overrides["enum_values"]
    elif up.get("enum_values"):
        entry["enum_values"] = up["enum_values"]
    for k in ("widget", "min", "max", "step", "decimals"):
        if k in overrides:
            entry[k] = overrides[k]
    params.append(entry)

# SORT by category then key
cat_order = ["Context", "Hardware", "Sampling", "Server", "Chat", "Advanced"]
params.sort(key=lambda p: (cat_order.index(p["category"]) if p["category"] in cat_order else 99, p["key"]))

# MIGRATIONS for old config keys
spec = {
    "version": 2,
    "source": "https://github.com/ggml-org/llama.cpp/blob/master/common/arg.cpp",
    "migrations": {
        "drop": ["spec-ngram-size-n", "spec-ngram-size-m", "spec-ngram-min-hits"],
        "rename": {
            "draft": "spec-draft-n-max", "draft-max": "spec-draft-n-max",
            "draft-n-max": "spec-draft-n-max", "draft-min": "spec-draft-n-min",
            "draft-n-min": "spec-draft-n-min", "draft-n": "spec-draft-n-max",
            "draft-p-min": "spec-draft-p-min", "draft-p-split": "spec-draft-p-split",
            "model-draft": "spec-draft-model", "ctx-size-draft": "spec-draft-ctx-size",
            "n-gpu-layers-draft": "spec-draft-ngl", "gpu-layers-draft": "spec-draft-ngl",
            "device-draft": "spec-draft-device", "threads-draft": "spec-draft-threads",
            "threads-batch-draft": "spec-draft-threads-batch",
            "cpu-moe-draft": "spec-draft-cpu-moe", "n-cpu-moe-draft": "spec-draft-n-cpu-moe",
            "override-tensor-draft": "spec-draft-override-tensor",
            "hf-repo-draft": "spec-draft-hf", "cache-type-k-draft": "spec-draft-type-k",
            "cache-type-v-draft": "spec-draft-type-v",
            "webui-config": "ui-config", "webui-config-file": "ui-config-file",
            "webui-mcp-proxy": "ui-mcp-proxy",
            "cpu-mask-draft": "spec-draft-cpu-mask", "cpu-range-draft": "spec-draft-cpu-range",
            "cpu-strict-draft": "spec-draft-cpu-strict",
            "cpu-mask-batch-draft": "spec-draft-cpu-mask-batch",
            "cpu-strict-batch-draft": "spec-draft-cpu-strict-batch",
            "poll-draft": "spec-draft-poll", "poll-batch-draft": "spec-draft-poll-batch",
            "prio-draft": "spec-draft-prio", "prio-batch-draft": "spec-draft-prio-batch",
        }
    },
    "defaults": {"n_batch": 2048, "parallel": -1},
    "params": params,
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src-tauri", "llama-spec.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(spec, f, indent=2, ensure_ascii=False)
print(f"Wrote {len(params)} params ({sum(1 for p in params if p['typed'])} typed, {sum(1 for p in params if not p['typed'])} extra)")

by_cat = {}
for p in params:
    by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
for cat in cat_order:
    if cat in by_cat:
        print(f"  {cat}: {by_cat[cat]}")
