#!/usr/bin/env python3
"""Extract upstream llama-server flags from README."""
import urllib.request, re, json, os

url = "https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md"
data = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")
upstream = {}
for line in data.split("\n"):
    if not line.strip().startswith("|"): continue
    # Split by | but ignore | inside backticks
    cols = []
    current = ""
    in_backtick = False
    for ch in line:
        if ch == "`":
            in_backtick = not in_backtick
            current += ch
        elif ch == "|" and not in_backtick:
            cols.append(current.strip())
            current = ""
        else:
            current += ch
    cols.append(current.strip())
    if len(cols) < 4: continue
    flag_col = desc_col = None
    for i, col in enumerate(cols):
        if "--" in col and re.search(r"--[a-zA-Z]", col):
            flag_col = col
            for j in range(i + 1, len(cols)):
                if cols[j] and cols[j] != "---": desc_col = cols[j]; break
            break
    if not flag_col: continue
    flags = re.findall(r"--([a-zA-Z][a-zA-Z0-9_-]*)", flag_col)
    if not flags: continue
    canonical = flags[-1]
    if canonical in ("help","usage","version","cache-list","completion-bash"): continue
    desc = desc_col or ""
    desc = re.sub(r"\[.*?\]\(.*?\)", "", desc)
    desc = re.sub(r"<br\s*/?>", " ", desc)
    desc = re.sub(r"\*\*|`", "", desc)
    desc = re.sub(r"\(env:.*?\)", "", desc)
    desc = re.sub(r"\s+", " ", desc).strip()
    dm = re.search(r"default:\s*([^)]+?)(?:\)|$)", desc)
    default = dm.group(1).strip().rstrip(")") if dm else ""
    if canonical not in upstream:
        upstream[canonical] = {"default": default, "desc": desc, "raw_flag": flag_col}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "upstream_flags.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(upstream, f, indent=2, ensure_ascii=False)
print(f"Extracted {len(upstream)} flags to {out}")
