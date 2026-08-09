import { describe, test, expect } from "vitest";
import { migrateExtraParams } from "./Server";
import type { LlamaSpec } from "../types";

const mockSpec: LlamaSpec = {
  version: 1,
  source: "",
  migrations: {
    drop: ["spec-ngram-size-n", "spec-ngram-size-m", "spec-ngram-min-hits"],
    rename: {
      "draft": "spec-draft-n-max",
      "draft-max": "spec-draft-n-max",
      "draft-n-max": "spec-draft-n-max",
      "draft-min": "spec-draft-n-min",
      "draft-n-min": "spec-draft-n-min",
      "model-draft": "spec-draft-model",
      "ctx-size-draft": "spec-draft-ctx-size",
      "n-gpu-layers-draft": "spec-draft-ngl",
      "gpu-layers-draft": "spec-draft-ngl",
      "device-draft": "spec-draft-device",
      "threads-draft": "spec-draft-threads",
      "threads-batch-draft": "spec-draft-threads-batch",
      "cpu-moe-draft": "spec-draft-cpu-moe",
      "draft-cpu-moe": "spec-draft-cpu-moe",
      "n-cpu-moe-draft": "spec-draft-n-cpu-moe",
      "override-tensor-draft": "spec-draft-override-tensor",
      "draft-p-min": "spec-draft-p-min",
      "draft-p-split": "spec-draft-p-split",
      "hf-repo-draft": "spec-draft-hf",
      "cache-type-k-draft": "spec-draft-type-k",
      "cache-type-v-draft": "spec-draft-type-v",
      "webui-config": "ui-config",
      "webui-config-file": "ui-config-file",
      "webui-mcp-proxy": "ui-mcp-proxy",
    },
  },
  defaults: { n_batch: 2048, parallel: -1 },
  params: [],
};

describe("migrateExtraParams", () => {
  test("drops removed ngram-size flags", () => {
    const out = migrateExtraParams({
      "spec-ngram-size-n": "3",
      "spec-ngram-size-m": "5",
      "spec-ngram-min-hits": "1",
      "kept": "1",
    }, mockSpec);
    expect(out).toEqual({ kept: "1" });
  });

  test("renames removed --draft / --draft-min flags to spec-draft-*", () => {
    const out = migrateExtraParams({
      "draft": "16",
      "draft-min": "0",
    }, mockSpec);
    expect(out).toEqual({ "spec-draft-n-max": "16", "spec-draft-n-min": "0" });
  });

  test("canonicalises draft aliases", () => {
    const out = migrateExtraParams({
      "model-draft": "/p/d.gguf",
      "ctx-size-draft": "4096",
      "n-gpu-layers-draft": "99",
      "threads-draft": "4",
      "device-draft": "cuda0",
      "cpu-moe-draft": "",
    }, mockSpec);
    expect(out["spec-draft-model"]).toBe("/p/d.gguf");
    expect(out["spec-draft-ctx-size"]).toBe("4096");
    expect(out["spec-draft-ngl"]).toBe("99");
    expect(out["spec-draft-threads"]).toBe("4");
    expect(out["spec-draft-device"]).toBe("cuda0");
    expect(out["spec-draft-cpu-moe"]).toBe("");
    expect("model-draft" in out).toBe(false);
  });

  test("does not clobber existing canonical value", () => {
    const out = migrateExtraParams({
      "spec-draft-n-max": "32",
      "draft": "16",
    }, mockSpec);
    expect(out["spec-draft-n-max"]).toBe("32");
    expect("draft" in out).toBe(false);
  });

  test("idempotent on a clean map", () => {
    const input = { "spec-default": "", "temp": "0.7" };
    const out = migrateExtraParams(input, mockSpec);
    expect(out).toEqual(input);
  });

  test("no-op without spec", () => {
    const input = { "draft": "16", "kept": "1" };
    const out = migrateExtraParams(input);
    expect(out).toEqual(input);
  });
});
