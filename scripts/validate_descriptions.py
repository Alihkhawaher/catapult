#!/usr/bin/env python3
"""Validate that descriptions in upstream_flags.json have no raw %s format strings."""
import json, os, re

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "upstream_flags.json")
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total params: {len(data)}")
print()

# Check for remaining %s/%d format specifiers
bad = []
for key, meta in data.items():
    desc = meta.get("desc", "")
    if re.search(r'%[sdfoxXeEgGu]', desc):
        bad.append((key, desc))

if bad:
    print(f"FAIL: {len(bad)} descriptions still contain format specifiers:")
    for key, desc in bad:
        print(f"  {key}: {desc[:150]}")
else:
    print("PASS: No raw format specifiers found in descriptions.")

print()

# Show a few examples of cleaned descriptions
examples = ["cache-type-k", "cache-type-v", "cont-batching", "flash-attn",
            "host", "cors-origins", "spec-draft-type-k", "embedding"]
for key in examples:
    if key in data:
        print(f"  {key}: {data[key]['desc'][:150]}")

print()

# Check for remaining \n in descriptions
newline_bad = []
for key, meta in data.items():
    desc = meta.get("desc", "")
    if "\\n" in desc:
        newline_bad.append((key, desc))

if newline_bad:
    print(f"WARN: {len(newline_bad)} descriptions still contain \\n:")
    for key, desc in newline_bad[:5]:
        print(f"  {key}: {desc[:150]}")
else:
    print("PASS: No raw \\n found in descriptions.")