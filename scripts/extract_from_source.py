#!/usr/bin/env python3
"""Extract llama-server CLI arg definitions directly from arg.cpp.

Reads C++ parameter registrations from common_params_parser_init() to get
exact types, flags, value hints, and category tags -- no guessing from prose.
Source: https://github.com/ggml-org/llama.cpp/blob/master/common/arg.cpp
"""
import re, json, os

SKIP = {"help", "usage", "version", "cache-list", "completion-bash"}


def fetch_arg_cpp():
    local = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tmp", "arg.cpp")
    if os.path.exists(local):
        with open(local, "r", encoding="utf-8") as f:
            return f.read()
    import urllib.request
    url = "https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/arg.cpp"
    data = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")
    os.makedirs(os.path.dirname(local), exist_ok=True)
    with open(local, "w", encoding="utf-8") as f:
        f.write(data)
    return data


def extract_kv_cache_types(source):
    """Extract KV cache type enum values from the kv_cache_types vector in arg.cpp."""
    match = re.search(r'kv_cache_types\s*=\s*\{([^}]+)\}', source)
    if not match:
        return None
    types = re.findall(r'GGML_TYPE_(\w+)', match.group(1))
    # Convert to lowercase strings (matching ggml_type_name() behavior)
    return [t.lower() for t in types] if types else None


def extract_blocks(source):
    start = source.find("common_params_parser_init")
    if start == -1:
        raise ValueError("common_params_parser_init not found")
    blocks, pos = [], start
    while True:
        idx = source.find("add_opt(common_arg(", pos)
        if idx == -1:
            break
        depth, i = 1, idx + len("add_opt(")
        while i < len(source):
            c = source[i]
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    break
            elif c == '"':
                i += 1
                while i < len(source) and source[i] != '"':
                    if source[i] == '\\':
                        i += 1
                    i += 1
            i += 1
        blocks.append(source[idx + len("add_opt("):i + 1])
        pos = i + 1
    return blocks


def parse_block(block):
    r = {"flags": [], "flags_neg": [], "value_hint": None, "help": "",
         "handler": None, "is_sampling": False, "is_spec": False,
         "examples": [], "env": None, "is_preset_only": False}
    inner = block.strip()

    # Extract chained methods BEFORE stripping common_arg wrapper
    if ".set_sampling()" in inner:
        r["is_sampling"] = True
    if ".set_spec()" in inner:
        r["is_spec"] = True
    if ".set_preset_only()" in inner:
        r["is_preset_only"] = True
    for m in re.finditer(r'\.set_env\("([^"]+)"\)', inner):
        r["env"] = m.group(1)
    for m in re.finditer(r'\.set_examples\(\{([^}]+)\}\)', inner):
        r["examples"] = [e.strip() for e in m.group(1).split(",")]

    # Extract just the common_arg(...) content by finding matching paren
    ca_start = inner.find("common_arg(")
    if ca_start == -1:
        return None
    ca_start += len("common_arg(")
    depth, i = 1, ca_start
    while i < len(inner) and depth > 0:
        c = inner[i]
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        elif c == '"':
            i += 1
            while i < len(inner) and inner[i] != '"':
                if inner[i] == '\\':
                    i += 1
                i += 1
        i += 1
    # inner[ca_start:i-1] is the content inside common_arg(...)
    content = inner[ca_start:i - 2].strip()

    # first arg: flag list {"--long", "-s"}
    args_match = re.match(r'\s*\{([^}]+)\}\s*,', content)
    if not args_match:
        return None
    r["flags"] = [a.strip().strip('"') for a in args_match.group(1).split(",")]
    rest = content[args_match.end():].strip()

    # optional: negated-flag list { "--no-foo" } (means bool handler)
    if rest.startswith("{"):
        neg_match = re.match(r'\{([^}]+)\}\s*,', rest)
        if neg_match:
            r["flags_neg"] = [a.strip().strip('"') for a in neg_match.group(1).split(",")]
            rest = rest[neg_match.end():].strip()
            r["handler"] = "bool"

    # value_hint: short quoted string like "N", "FNAME", "[on|off]", "<0|1>"
    vh_match = re.match(r'"((?:[^"\\]|\\.)*)"\s*,', rest)
    if vh_match:
        vh = vh_match.group(1)
        if len(vh) < 40 and (' ' not in vh or vh.startswith("[") or vh.startswith("<") or vh.startswith("{")):
            r["value_hint"] = vh
            rest = rest[vh_match.end():].strip()

    # handler type from lambda signature
    # Pattern: [](common_params & params, TYPE value) or [](common_params &, TYPE)
    if "common_params & params, const std::string &, const std::string &" in rest:
        r["handler"] = "str_str"
    elif "common_params & params, const std::string &" in rest:
        r["handler"] = "string"
    elif "common_params & params, int " in rest:
        r["handler"] = "int"
    elif "common_params & params, bool " in rest:
        r["handler"] = "bool"
    elif "common_params &" in rest and not r["handler"]:
        r["handler"] = "void"

    # help text: collect quoted strings before the lambda
    lambda_pos = rest.find("[](common_params")
    help_region = rest[:lambda_pos] if lambda_pos != -1 else rest
    help_parts = re.findall(r'"((?:[^"\\]|\\.)*)"', help_region)
    if help_parts:
        r["help"] = " ".join(help_parts)

    # store lambda body for type detection (std::stof, enum values, etc.)
    r["lambda_body"] = rest[lambda_pos:] if lambda_pos != -1 else ""

    return r


def pick_canonical(flags):
    for f in flags:
        if f.startswith("--"):
            return f[2:]
    return flags[0].lstrip("-")


def determine_type(parsed):
    ht, vh = parsed["handler"], parsed["value_hint"] or ""
    lb = parsed.get("lambda_body", "")
    help_text = parsed.get("help", "").lower()

    if ht in ("void", "bool"):
        return "bool"
    if ht == "int":
        if vh.startswith("<") and "|" in vh:
            return "enum"
        return "integer"
    if ht == "string":
        # Comma-separated list → string (even if lambda uses std::stof on parts)
        if "comma-separated" in help_text or "..." in vh:
            return "string"
        # Float: lambda uses std::stof or std::stod
        if "std::stof(" in lb or "std::stod(" in lb or "std::stold(" in lb:
            return "float"
        # Enum: value_hint has options
        if (vh.startswith("[") or vh.startswith("{")) and "|" in vh:
            return "enum"
        # Enum: help text mentions "allowed values" or "available values"
        if "allowed values" in help_text or "available values" in help_text:
            return "enum"
        return "string"
    return "string"


def extract_enum_values(parsed):
    vh = parsed["value_hint"] or ""
    for pat in [r'<([^>]+)>', r'\[([^\]]+)\]', r'\{([^}]+)\}']:
        m = re.search(pat, vh)
        if m:
            vals = [v.strip() for v in re.split(r'[|,]', m.group(1))]
            # Reject if values are format strings
            if all(re.match(r'^%[sdfoxXeEgG]$', v) for v in vals):
                return None
            return vals
    # Try help text: "allowed values: val1, val2, val3" or "available values: ..."
    help_text = parsed.get("help", "")
    m = re.search(r'(?:allowed|available|valid)\s+values?:\s*[^.()\n]+', help_text, re.IGNORECASE)
    if m:
        # Extract the actual values list — skip the format specifier part
        # Pattern: "allowed values: %s\n (default: %s)" — skip, values come from runtime
        # Pattern: "allowed values: f32, f16, bf16, ..." — extract
        vals_text = m.group(0)
        # Find the actual comma-separated list after "values:"
        list_match = re.search(r'values?:\s*([A-Za-z_][A-Za-z0-9_, ]+)', vals_text)
        if list_match:
            vals = [v.strip().strip("'\"") for v in list_match.group(1).split(",") if v.strip()]
            # Reject if values look like format strings
            if vals and not all(re.match(r'^%[sdfoxXeEgG]', v) for v in vals):
                return vals
    return None


def extract_default(help_text):
    if not help_text:
        return ""
    m = re.search(r'default:\s*([^)]+?)(?:\)|$)', help_text)
    if m:
        val = m.group(1).strip().rstrip(")")
        val = val.split(",")[0].strip().strip("'\"")
        # Reject C++ format specifiers: %d, %s, %.2f, %u, %zu, %02d, etc.
        if re.search(r'%[\d.*]*(?:z[ud]|l[du]|[sdfoxXeEgGu])', val):
            return ""
        # Normalize bool defaults
        if val in ("enabled", "true"):
            return "on"
        if val in ("disabled", "false"):
            return "off"
        return val
    return ""


def clean_description(help_text, default_val, enum_vals):
    """Centralized cleanup of C++ help text for display in the UI.

    Resolves printf-style %s/%d format specifiers using extracted default
    and enum values, strips C++ newlines, and removes noise.
    """
    if not help_text:
        return ""

    text = help_text

    # Resolve "allowed values: %s" or "available values: %s" with actual enum values
    if enum_vals and re.search(r'(?:allowed|available|valid)\s+values?:\s*%s', text, re.IGNORECASE):
        vals_str = ", ".join(enum_vals)
        text = re.sub(
            r'((?:allowed|available|valid)\s+values?:\s*)%s',
            r'\g<1>' + vals_str,
            text,
            flags=re.IGNORECASE
        )

    # Resolve "(default: %s)" or "(default: '%s')" with actual default value
    if default_val:
        text = re.sub(r"\(default:\s*'%s'\)", f"(default: '{default_val}')", text)
        text = re.sub(r"\(default:\s*%s\)", f"(default: {default_val})", text)

    # Strip remaining unresolved %s/%d/%zu format specifiers and their surrounding context
    # Handle: (default: %s), (default: '%s'), default: '%s'), default: %s), default: %zu
    # The opening paren may belong to a larger group, so don't require it
    text = re.sub(r",?\s*default:\s*'%[\d.*]*(?:z[ud]|[sdfoxXeEgGu])'", '', text)
    text = re.sub(r",?\s*default:\s*%[\d.*]*(?:z[ud]|[sdfoxXeEgGu])", '', text)

    # Strip orphaned %s/%d/%zu that weren't resolved
    text = re.sub(r'%[\d.*]*(?:z[ud]|[sdfoxXeEgGu])', '', text)

    # Strip empty parentheses left after removing default clauses
    text = re.sub(r'\(\s*\)', '', text)

    # Strip trailing bool/enum value noise from help text
    # C++ help sometimes ends with " enabled disabled" or " true false" etc.
    text = re.sub(r'\s+(?:enabled|disabled)(\s+(?:enabled|disabled))?$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+(?:true|false)(\s+(?:true|false))?$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+(?:on|off)(\s+(?:on|off))?$', '', text, flags=re.IGNORECASE)

    # Strip trailing "allowed values:" or "available values:" with nothing after
    text = re.sub(r'\s*(?:allowed|available|valid)\s+values?:\s*$', '', text, flags=re.IGNORECASE)

    # Normalize C++ escaped newlines to spaces
    text = text.replace('\\n', ' ').replace('\\r', ' ')

    # Collapse multiple spaces
    text = re.sub(r'  +', ' ', text)

    # Strip leading/trailing whitespace
    text = text.strip()

    # Truncate to 200 chars (matching previous behavior)
    return text[:200]


def determine_category(parsed, flag):
    if parsed["is_spec"] or flag.startswith("spec-"):
        return "Advanced"
    if parsed["is_sampling"]:
        return "Sampling"
    fl = flag.lower()
    # Keyword checks (before examples, since examples can be misleading)
    if any(x in fl for x in ["ctx-size", "n-predict", "batch-size", "ubatch-size",
            "keep", "flash-attn", "cache-type", "swa-", "kv-unified", "context-shift",
            "cache-prompt", "cache-idle", "cache-reuse", "cache-ram", "ctx-checkpoint",
            "checkpoint-", "defrag", "yarn-", "rope-"]):
        return "Context"
    if any(x in fl for x in ["gpu-layer", "n-gpu", "split-mode", "tensor-split",
            "main-gpu", "device", "cont-batch", "mlock", "mmap", "repack", "no-host",
            "op-offload", "numa", "check-tensor", "lora", "control-vector", "fit",
            "cpu-moe", "cpu-mask", "cpu-range", "cpu-strict", "prio", "poll",
            "direct-io", "escape", "load-mode", "threads-batch"]):
        return "Hardware"
    if fl in ("threads", "n-threads"):
        return "Hardware"
    if any(x in fl for x in ["temperature", "seed", "top-k", "top-p", "min-p",
            "samplers", "top-n-sigma", "typical", "repeat", "presence-penalty",
            "frequency-penalty", "xtc-", "dry-", "mirostat", "dynatemp", "ignore-eos",
            "backend-sampling", "adaptive", "logit-bias", "grammar", "json-schema",
            "sampler-seq", "reverse-prompt"]):
        return "Sampling"
    if any(x in fl for x in ["mmproj", "jinja", "chat-template", "reasoning",
            "prefill-assistant", "skip-chat", "pooling", "embd-separator",
            "cls-separator", "special", "no-mmproj", "tools", "ui-config",
            "mcp-server", "agent"]):
        return "Chat"
    if any(x in fl for x in ["log-", "verbose", "perf", "offline", "profile", "list-device"]):
        return "Advanced"
    # Fallback: use examples tag
    if parsed["examples"] == ["LLAMA_EXAMPLE_SERVER"]:
        return "Server"
    return "Server"


def make_label(flag):
    return flag


def main():
    source = fetch_arg_cpp()
    blocks = extract_blocks(source)
    # Extract KV cache types from the global vector definition
    kv_cache_types = extract_kv_cache_types(source)
    if kv_cache_types:
        print(f"Extracted KV cache types: {kv_cache_types}")
    print(f"Found {len(blocks)} add_opt() blocks")
    params, seen = [], set()
    for block in blocks:
        parsed = parse_block(block)
        if not parsed or not parsed["flags"]:
            continue
        canonical = pick_canonical(parsed["flags"])
        if canonical in SKIP or canonical in seen or parsed["is_preset_only"]:
            continue
        # Extract default and enum values first, so clean_description can use them
        default_val = extract_default(parsed["help"])
        ev = extract_enum_values(parsed)
        # Auto-attach KV cache type enum values for cache-type params
        if not ev and kv_cache_types:
            # Match: --cache-type-k, --cache-type-v, --spec-draft-type-k, --spec-draft-type-v
            if "cache-type" in canonical or re.search(r'-type-[kv]$', canonical):
                ev = kv_cache_types
        entry = {
            "key": canonical, "label": make_label(canonical),
            "description": clean_description(parsed["help"], default_val, ev),
            "type": determine_type(parsed), "default": default_val,
            "category": determine_category(parsed, canonical),
            "typed": False, "cli_flag": canonical,
        }
        if ev:
            entry["enum_values"] = ev
        if parsed.get("value_hint"):
            entry["value_hint"] = parsed["value_hint"]
        params.append(entry)
        seen.add(canonical)
    cat_order = ["Context", "Hardware", "Sampling", "Server", "Chat", "Advanced"]
    params.sort(key=lambda p: (cat_order.index(p["category"]) if p["category"] in cat_order else 99, p["key"]))
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "upstream_flags.json")
    upstream = {p["key"]: {"default": p["default"], "desc": p["description"],
        "type": p["type"], "category": p["category"], "enum_values": p.get("enum_values"),
        "value_hint": p.get("value_hint")}
        for p in params}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(upstream, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(params)} params to {out}")
    by_type, by_cat = {}, {}
    for p in params:
        by_type[p["type"]] = by_type.get(p["type"], 0) + 1
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    print(f"  Types: {by_type}")
    print(f"  Categories: {by_cat}")


if __name__ == "__main__":
    main()

