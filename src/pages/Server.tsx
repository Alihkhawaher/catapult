import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Terminal,
  ExternalLink,
  Save,
  FolderOpen,
  Trash2,
  Eye,
  FolderSearch,
  RefreshCw,
} from "lucide-react";
import type { ModelInfo, ServerConfig, ServerStatus, LlamaSpec } from "../types";

// ── Utility components ──────────────────────────────────────────────────────

function Slider({ label, hint, value, min, max, step, onChange, format }: {
  label: string; hint?: string; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="label mb-0">{label}</label>
        <span className="text-xs font-mono text-gray-300">{format ? format(value) : value}</span>
      </div>
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-primary" />
    </div>
  );
}

function NumberInput({ label, hint, value, min, max, step = 1, onChange }: {
  label: string; hint?: string; value: number | null;
  min?: number; max?: number; step?: number;
  onChange: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) {
      setDraft(value != null ? String(value) : "");
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);
    if (raw === "") {
      onChange(null);
    } else {
      const n = parseFloat(raw);
      if (!isNaN(n)) onChange(n);
    }
  }, [onChange]);

  const handleBlur = useCallback(() => {
    editing.current = false;
    if (draft === "" || isNaN(parseFloat(draft))) {
      // Restore previous value on blur if empty
      setDraft(value != null ? String(value) : "");
    }
  }, [draft, value]);

  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
      <input type="number" className="input" value={draft} min={min} max={max} step={step}
        onFocus={() => { editing.current = true; }}
        onChange={handleChange}
        onBlur={handleBlur} />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-8 h-4 rounded-full transition-colors mt-0.5 ${checked ? "bg-primary" : "bg-surface-4"}`}>
        <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </button>
      <div>
        <p className="text-xs font-medium text-gray-300">{label}</p>
        {hint && <p className="text-xs text-gray-600">{hint}</p>}
      </div>
    </div>
  );
}

function TextInput({ label, hint, value, placeholder, onChange }: {
  label: string; hint?: string; value: string; placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
      <input type="text" className="input" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FileInput({ label, hint, value, onChange, filters }: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void;
  filters?: { name: string; extensions: string[] }[];
}) {
  const browse = async () => {
    const selected = await open({
      multiple: false,
      title: `Select ${label}`,
      ...(filters ? { filters } : {}),
    });
    if (selected) onChange(selected);
  };
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
      <div className="flex gap-1.5">
        <input type="text" className="input flex-1" value={value}
          placeholder="Enter path or browse..."
          onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-ghost px-2 shrink-0" onClick={browse}
          title="Browse for file">
          <FolderSearch size={14} />
        </button>
      </div>
    </div>
  );
}

function ModelFileInput({ label, hint, value, onChange, models, excludePath }: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void;
  models: ModelInfo[];
  excludePath?: string;
}) {
  const [showList, setShowList] = useState(false);
  const filteredModels = models.filter((m) => m.path !== excludePath);

  const browse = async () => {
    const selected = await open({
      multiple: false,
      title: `Select ${label}`,
      filters: [{ name: "GGUF Models", extensions: ["gguf"] }],
    });
    if (selected) onChange(selected);
  };

  const selectedModel = models.find((m) => m.path === value);

  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
      {/* Current value display / manual input */}
      <div className="flex gap-1.5">
        <input type="text" className="input flex-1" value={value}
          placeholder="Select model or enter path..."
          onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-ghost px-2 shrink-0" onClick={browse}
          title="Browse for GGUF file">
          <FolderSearch size={14} />
        </button>
      </div>
      {/* Installed models dropdown */}
      {filteredModels.length > 0 && (
        <div className="mt-1.5">
          <button type="button"
            className="text-xs text-primary-light hover:underline flex items-center gap-1"
            onClick={() => setShowList(!showList)}>
            {showList ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {showList ? "Hide" : "Select from"} installed models ({filteredModels.length})
          </button>
          {showList && (
            <div className="mt-1.5 max-h-40 overflow-y-auto border border-border rounded">
              {filteredModels.map((m) => {
                const isSelected = value === m.path;
                return (
                  <button key={m.id} type="button"
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                      isSelected ? "bg-primary/10 text-primary-light" : "hover:bg-surface-3 text-gray-300"
                    }`}
                    onClick={() => { onChange(m.path); setShowList(false); }}>
                    <HardDrive size={11} className="text-gray-500 shrink-0" />
                    <span className="flex-1 truncate">{m.name}</span>
                    {m.quant && <span className="badge-purple text-[10px]">{m.quant}</span>}
                    <span className="text-gray-500">{(m.size_bytes / 1024 ** 3).toFixed(1)} GB</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {selectedModel && (
        <p className="text-[10px] text-gray-500 mt-1 truncate">
          {selectedModel.name}{selectedModel.quant ? ` (${selectedModel.quant})` : ""}
          {" — "}{(selectedModel.size_bytes / 1024 ** 3).toFixed(1)} GB
        </p>
      )}
    </div>
  );
}

function SelectInput({ label, hint, value, options, onChange }: {
  label: string; hint?: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-600 mb-1">{hint}</p>}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 mt-5 first:mt-0">{title}</p>;
}

// ── Dynamic param renderer ─────────────────────────────────────────────────

function DynamicParam({ param, config, setConfig, models, excludeModelPath }: {
  param: import("../types").LlamaParamDef;
  config: ServerConfig;
  setConfig: React.Dispatch<React.SetStateAction<ServerConfig>>;
  models?: ModelInfo[];
  excludeModelPath?: string;
}) {
  const key = param.cli_flag;

  // Read value: typed params from config fields, non-typed from extra_params
  const getValue = (): string => {
    if (param.typed) {
      const v = (config as unknown as Record<string, unknown>)[param.key];
      if (v === null || v === undefined) return "";
      return String(v);
    }
    return config.extra_params?.[key] ?? "";
  };

  const getNumValue = (): number | null => {
    const v = getValue();
    if (v === "") return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  const getBoolValue = (): boolean => {
    if (param.typed) {
      return Boolean((config as unknown as Record<string, unknown>)[param.key]);
    }
    return key in (config.extra_params ?? {});
  };

  const setStringValue = (v: string) => {
    if (param.typed) {
      setConfig((c) => ({ ...c, [param.key]: v }));
    } else {
      setConfig((c) => {
        const ep = { ...c.extra_params };
        if (v === "") delete ep[key]; else ep[key] = v;
        return { ...c, extra_params: ep };
      });
    }
  };

  const setNumValue = (v: number | null) => {
    if (param.typed) {
      setConfig((c) => ({ ...c, [param.key]: v }));
    } else {
      setStringValue(v !== null ? String(v) : "");
    }
  };

  const setBoolValue = (on: boolean) => {
    if (param.typed) {
      setConfig((c) => ({ ...c, [param.key]: on }));
    } else {
      setConfig((c) => {
        const ep = { ...c.extra_params };
        if (on) ep[key] = ""; else delete ep[key];
        return { ...c, extra_params: ep };
      });
    }
  };

  // Render widget based on type
  if (param.type === "bool") {
    return <Toggle label={param.label} hint={param.description} checked={getBoolValue()} onChange={setBoolValue} />;
  }

  if (param.type === "enum" && param.enum_values) {
    const options = param.enum_values.map((v) => ({ value: v, label: v || "None" }));
    return <SelectInput label={param.label} hint={param.description} value={getValue()} options={options} onChange={setStringValue} />;
  }

  if (param.widget === "slider" && param.min !== undefined && param.max !== undefined) {
    const val = getNumValue() ?? parseFloat(param.default) ?? 0;
    const decimals = param.decimals ?? (param.type === "float" ? 2 : 0);
    return <Slider label={param.label} hint={param.description} value={val}
      min={param.min} max={param.max} step={param.step ?? 1}
      onChange={setNumValue} format={(v) => decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))} />;
  }

  if (param.type === "integer" || param.type === "float") {
    return <NumberInput label={param.label} hint={param.description} value={getNumValue()}
      step={param.step ?? (param.type === "float" ? 0.01 : 1)}
      onChange={setNumValue} />;
  }

  // File browser widgets
  if (param.widget === "model" && models) {
    return <ModelFileInput label={param.label} hint={param.description} value={getValue()}
      onChange={setStringValue} models={models} excludePath={excludeModelPath} />;
  }

  if (param.widget === "file") {
    return <FileInput label={param.label} hint={param.description} value={getValue()}
      onChange={setStringValue} />;
  }

  // Default: string
  return <TextInput label={param.label} hint={param.description} value={getValue()} onChange={setStringValue} />;
}

function DynamicCategory({ category, spec, config, setConfig, models, excludeModelPath }: {
  category: string;
  spec: import("../types").LlamaSpec;
  config: ServerConfig;
  setConfig: React.Dispatch<React.SetStateAction<ServerConfig>>;
  models?: ModelInfo[];
  excludeModelPath?: string;
}) {
  const params = spec.params.filter((p) => p.category === category);
  if (params.length === 0) return null;

  // Group typed and non-typed params separately for layout
  const typedParams = params.filter((p) => p.typed);
  const extraParams = params.filter((p) => !p.typed);

  return (
    <>
      {typedParams.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {typedParams.map((p) => <DynamicParam key={p.key} param={p} config={config} setConfig={setConfig} models={models} excludeModelPath={excludeModelPath} />)}
        </div>
      )}
      {extraParams.length > 0 && (
        <>
          {typedParams.length > 0 && <Section title="Additional Parameters" />}
          <div className="grid grid-cols-2 gap-3">
            {extraParams.map((p) => <DynamicParam key={p.key} param={p} config={config} setConfig={setConfig} models={models} excludeModelPath={excludeModelPath} />)}
          </div>
        </>
      )}
    </>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = ["Context", "Hardware", "Sampling", "Server", "Chat", "Advanced"] as const;
type Tab = (typeof TABS)[number];

// ── Default config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ServerConfig = {
  model_path: "",
  mmproj_path: null,
  host: "127.0.0.1",
  port: 8080,
  n_ctx: 0,
  n_gpu_layers: -1,
  n_threads: null,
  flash_attn: "auto",
  cache_type_k: "f16",
  cache_type_v: "f16",
  temperature: 0.8,
  top_k: 40,
  min_p: 0.05,
  top_p: 0.95,
  n_predict: -1,
  n_batch: 2048,
  n_ubatch: 512,
  cont_batching: true,
  mlock: false,
  no_mmap: false,
  seed: null,
  rope_freq_scale: null,
  rope_freq_base: null,
  grp_attn_n: null,
  grp_attn_w: null,
  parallel: -1,
  extra_params: {},
};

// ── Main component ───────────────────────────────────────────────────────────

// Session-storage helpers to retain config across page navigation
const SESSION_CONFIG_KEY = "catapult_server_config";
const SESSION_PRESET_KEY = "catapult_server_preset";
const SESSION_TAB_KEY = "catapult_server_tab";
const SESSION_STATUS_KEY = "catapult_server_status";

// Spec-driven migration: reads drop/rename lists from the loaded LlamaSpec
export function migrateExtraParams(extra: Record<string, string>, spec?: LlamaSpec): Record<string, string> {
  const out = { ...extra };
  if (spec) {
    for (const k of spec.migrations.drop) delete out[k];
    for (const [oldKey, newKey] of Object.entries(spec.migrations.rename)) {
      if (oldKey in out && !(newKey in out)) {
        out[newKey] = out[oldKey];
      }
      delete out[oldKey];
    }
  }
  return out;
}

function loadSessionConfig(spec?: LlamaSpec): ServerConfig | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as ServerConfig;
    if (cfg.extra_params) cfg.extra_params = migrateExtraParams(cfg.extra_params, spec);
    return cfg;
  } catch { return null; }
}

function loadSessionStatus(): ServerStatus {
  try {
    const raw = sessionStorage.getItem(SESSION_STATUS_KEY);
    return raw ? JSON.parse(raw) : { type: "stopped" };
  } catch { return { type: "stopped" }; }
}

export default function Server() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [spec, setLlamaSpec] = useState<LlamaSpec | null>(null);
  const [config, setConfigRaw] = useState<ServerConfig>(() => loadSessionConfig() ?? DEFAULT_CONFIG);
  const [status, setStatusRaw] = useState<ServerStatus>(loadSessionStatus);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTabRaw] = useState<Tab>(() => {
    const saved = sessionStorage.getItem(SESSION_TAB_KEY);
    return saved && TABS.includes(saved as Tab) ? (saved as Tab) : "Context";
  });
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [showModelList, setShowModelList] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const pendingLogs = useRef<string[]>([]);
  const logRaf = useRef<number | null>(null);
  const [presets, setPresets] = useState<string[]>([]);
  const [activePreset, setActivePresetRaw] = useState<string | null>(() => {
    return sessionStorage.getItem(SESSION_PRESET_KEY) || null;
  });
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  // Wrappers that persist to sessionStorage
  const setConfig: typeof setConfigRaw = useCallback((v) => {
    setConfigRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      sessionStorage.setItem(SESSION_CONFIG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setActivePreset = useCallback((v: string | null) => {
    setActivePresetRaw(v);
    if (v) sessionStorage.setItem(SESSION_PRESET_KEY, v);
    else sessionStorage.removeItem(SESSION_PRESET_KEY);
  }, []);

  const setActiveTab = useCallback((v: Tab) => {
    setActiveTabRaw(v);
    sessionStorage.setItem(SESSION_TAB_KEY, v);
  }, []);

  const setStatus = useCallback((v: ServerStatus | ((prev: ServerStatus) => ServerStatus)) => {
    setStatusRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      sessionStorage.setItem(SESSION_STATUS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const flushLogs = useCallback(() => {
    logRaf.current = null;
    const batch = pendingLogs.current;
    if (batch.length === 0) return;
    pendingLogs.current = [];
    setLogs((prev) => [...prev, ...batch].slice(-500));
  }, []);

  const addLog = useCallback((line: string) => {
    pendingLogs.current.push(line);
    if (logRaf.current === null) {
      logRaf.current = requestAnimationFrame(flushLogs);
    }
  }, [flushLogs]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Presets ────────────────────────────────────────────────────────────────

  const refreshPresets = async () => {
    try { setPresets(await invoke<string[]>("list_server_presets")); } catch {}
  };

  const savePreset = async (name: string) => {
    if (!name.trim()) return;
    try {
      // Exclude model_path and mmproj_path from presets — these are per-session
      const presetConfig = { ...config, model_path: "", mmproj_path: null };
      await invoke("save_server_preset", { name: name.trim(), config: presetConfig });
      setActivePreset(name.trim());
      setSaveName("");
      await refreshPresets();
    } catch (e) { setError(String(e)); }
  };

  const loadPreset = async (name: string, modelPath?: string) => {
    try {
      const loaded = await invoke<ServerConfig>("load_server_preset", { name });
      if (loaded.extra_params) loaded.extra_params = migrateExtraParams(loaded.extra_params);
      // Preserve current model_path and mmproj_path
      setConfig((prev) => ({
        ...loaded,
        model_path: prev.model_path,
        mmproj_path: prev.mmproj_path,
      }));
      setActivePreset(name);
      setShowPresetMenu(false);
      // Save model→preset association (use provided path or fall back to current config)
      const pathToSave = modelPath ?? config.model_path;
      if (pathToSave) {
        await invoke("set_model_preset", { modelPath: pathToSave, presetName: name }).catch(() => {});
      }
    } catch (e) { setError(String(e)); }
  };

  const deletePreset = async (name: string) => {
    try {
      await invoke("delete_server_preset", { name });
      if (activePreset === name) setActivePreset(null);
      await refreshPresets();
    } catch (e) { setError(String(e)); }
  };

  const saveAsDefaults = async () => {
    try {
      const presetConfig = { ...config, model_path: "", mmproj_path: null };
      await invoke("save_server_preset", { name: "__default__", config: presetConfig });
      setActivePreset(null);
      setShowPresetMenu(false);
    } catch (e) { setError(String(e)); }
  };

  const resetDefaults = async () => {
    try {
      await invoke("delete_server_preset", { name: "__default__" });
    } catch {}
    const modelPath = config.model_path;
    const mmproj = config.mmproj_path;
    setConfig({ ...DEFAULT_CONFIG, model_path: modelPath, mmproj_path: mmproj });
    setActivePreset(null);
    setShowPresetMenu(false);
  };

  const loadDefaults = async () => {
    try {
      const loaded = await invoke<ServerConfig>("load_server_preset", { name: "__default__" });
      if (loaded.extra_params) loaded.extra_params = migrateExtraParams(loaded.extra_params);
      setConfig((prev) => ({
        ...loaded,
        model_path: prev.model_path,
        mmproj_path: prev.mmproj_path,
      }));
    } catch {
      // No saved defaults — use built-in defaults
    }
  };

  const resetToDefault = () => {
    loadDefaults().then(() => {
      setActivePreset(null);
      setShowPresetMenu(false);
    });
  };

  const resetSpec = async () => {
    if (!confirm("Reset parameter spec to built-in defaults? This will overwrite any custom edits to the spec file.")) return;
    try {
      const json = await invoke<string>("reset_llama_spec");
      const newSpec = JSON.parse(json) as LlamaSpec;
      setLlamaSpec(newSpec);
      setShowPresetMenu(false);
    } catch (e) { setError(String(e)); }
  };

  // ── Data loading ──────────────────────────────────────────────────────────

  const openChat = async () => {
    if (status.type !== "running") return;
    setOpeningChat(true);
    try { await invoke("open_chat_window", { port: status.port }); }
    catch (e) { setError(String(e)); }
    finally { setOpeningChat(false); }
  };

  const loadData = async () => {
    const [mdls, srv, cfg] = await Promise.all([
      invoke<ModelInfo[]>("list_installed_models").catch(() => []),
      invoke<ServerStatus>("get_server_status").catch(() => ({ type: "stopped" as const })),
      invoke<{ favorite_models: string[]; selected_model: string | null; model_presets: Record<string, string> }>(
        "get_config"
      ).catch(() => ({ favorite_models: [] as string[], selected_model: null, model_presets: {} as Record<string, string> })),
    ]);
    setFavorites(cfg.favorite_models);
    setModels(mdls);
    setStatus(srv);
    if (mdls.length > 0 && !config.model_path) {
      // Use the dashboard-selected model if set, otherwise first model
      const selected = cfg.selected_model
        ? mdls.find((m) => m.path === cfg.selected_model)
        : null;
      const pick = selected ?? mdls[0];
      setConfig((c) => ({
        ...c,
        model_path: pick.path,
        mmproj_path: pick.is_vision && pick.mmproj_path ? pick.mmproj_path : null,
      }));
      // Auto-load the last-used preset for this model (on first visit only)
      if (!loadSessionConfig()) {
        const savedPreset = cfg.model_presets[pick.path];
        if (savedPreset) {
          await loadPreset(savedPreset, pick.path);
        }
      }
    }
  };

  useEffect(() => {
    // Load the llama spec first, then use it for migrations
    invoke<string>("get_llama_spec").then((json) => {
      const spec = JSON.parse(json) as LlamaSpec;
      setLlamaSpec(spec);
      // Re-apply migrations to session config now that we have the spec
      const sessionCfg = loadSessionConfig(spec);
      if (sessionCfg) setConfigRaw(sessionCfg);
    }).catch((e) => {
      console.warn("Failed to load llama spec:", e);
    });

    loadData();
    refreshPresets();
    // Only load defaults if no session-restored config
    if (!loadSessionConfig()) loadDefaults();
    // Load any existing logs (e.g. server started from Dashboard)
    invoke<string[]>("get_server_logs").then((existing) => {
      if (existing.length > 0) {
        setLogs(existing);
        setShowLogs(true);
      }
    }).catch(() => {});
    const unlistenLog = listen<string>("server_log", (e) => {
      addLog(e.payload);
    });
    const interval = setInterval(async () => {
      try { setStatus(await invoke<ServerStatus>("get_server_status")); } catch {}
    }, 2000);
    return () => {
      unlistenLog.then((f) => f());
      clearInterval(interval);
      if (logRaf.current !== null) cancelAnimationFrame(logRaf.current);
    };
  }, []);

  const applyModelConfig = async (modelPath: string) => {
    const model = models.find((m) => m.path === modelPath);
    if (!model) return;
    try {
      const suggested = await invoke<ServerConfig>("suggest_server_config", {
        modelPath, modelSizeMb: Math.round(model.size_bytes / (1024 * 1024)),
      });
      // Only apply hardware-dependent suggestions; preserve all user settings
      setConfig((prev) => ({
        ...prev,
        n_ctx: suggested.n_ctx,
        n_gpu_layers: suggested.n_gpu_layers,
      }));
    } catch {}
  };

  const handleModelChange = async (m: ModelInfo) => {
    setConfig((c) => ({
      ...c,
      model_path: m.path,
      mmproj_path: m.is_vision && m.mmproj_path ? m.mmproj_path : null,
    }));
    // Check if there's a saved preset for this model; if so, use it
    try {
      const savedPreset = await invoke<string | null>("get_model_preset", { modelPath: m.path });
      if (savedPreset) {
        await loadPreset(savedPreset, m.path);
        return;
      }
    } catch {}
    // No model-specific preset — apply hardware suggestions
    await applyModelConfig(m.path);
  };

  const startServer = async () => {
    if (!config.model_path) { setError("Please select a model."); return; }
    setError(null); setLogs([]); setShowLogs(true);
    try {
      await invoke("start_server", { config });
      // Persist the model→preset association so next visit auto-loads it
      if (activePreset && config.model_path) {
        await invoke("set_model_preset", { modelPath: config.model_path, presetName: activePreset }).catch(() => {});
      }
    }
    catch (e) { setError(String(e)); }
  };

  const stopServer = async () => {
    try { await invoke("stop_server"); }
    catch (e) { setError(String(e)); }
  };

  const isRunning = status.type === "running" || status.type === "starting";

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Run Server</h1>
          <div className="flex items-center gap-2 mt-1">
            {/* Preset controls */}
            <div className="relative">
              <button className="btn-ghost text-xs py-1 px-2" onClick={() => setShowPresetMenu(!showPresetMenu)}>
                <FolderOpen size={12} />
                {activePreset ?? "Default"}
                <ChevronDown size={11} />
              </button>
              {showPresetMenu && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-surface-2 border border-border shadow-lg min-w-[250px]">
                  <button className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-surface-3 flex items-center gap-2"
                    onClick={resetToDefault}>
                    Default
                    {!activePreset && <span className="text-primary-light ml-auto text-[10px]">active</span>}
                  </button>
                  {presets.filter((n) => n !== "__default__").map((name) => (
                    <div key={name} className="flex items-center hover:bg-surface-3 group">
                      <button className="flex-1 text-left px-3 py-2 text-xs text-gray-300 flex items-center gap-2"
                        onClick={() => loadPreset(name)}>
                        {name}
                        {activePreset === name && <span className="text-primary-light ml-auto text-[10px]">active</span>}
                      </button>
                      <button className="px-2 py-2 text-gray-600 hover:text-accent-red opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deletePreset(name); }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  <div className="border-t border-border">
                    <button className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-surface-3 hover:text-gray-200"
                      onClick={saveAsDefaults}>
                      Save current settings as defaults
                    </button>
                    <button className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-surface-3 hover:text-gray-200"
                      onClick={resetDefaults}>
                      Reset defaults to built-in
                    </button>
                    <button className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-surface-3 hover:text-gray-200 flex items-center gap-1.5"
                      onClick={resetSpec}>
                      <RefreshCw size={10} />
                      Regenerate parameter spec
                    </button>
                  </div>
                  <div className="border-t border-border px-2 py-2 flex gap-1">
                    <input className="input text-xs py-1 flex-1" placeholder="Preset name…"
                      value={saveName} onChange={(e) => setSaveName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") savePreset(saveName); }} />
                    <button className="btn-primary text-xs py-1 px-2" onClick={() => savePreset(saveName)}
                      disabled={!saveName.trim()}>
                      <Save size={11} /> Save
                    </button>
                  </div>
                </div>
              )}
            </div>
            {activePreset && (
              <button className="btn-ghost text-xs py-1 px-2" onClick={() => savePreset(activePreset)}
                title="Overwrite current preset">
                <Save size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status.type === "running" && (
            <>
              <span className="flex items-center gap-1.5 text-xs text-accent-green">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                Running on port {status.port}
              </span>
              <button className="btn-secondary text-xs" onClick={openChat} disabled={openingChat}>
                <ExternalLink size={13} /> Open Chat
              </button>
            </>
          )}
          {status.type === "starting" && (
            <span className="text-xs text-accent-yellow flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
              Starting…
            </span>
          )}
          {status.type === "error" && <span className="text-xs text-accent-red">Error</span>}
          {isRunning ? (
            <button className="btn-danger" onClick={stopServer}><Square size={14} /> Stop</button>
          ) : (
            <button className="btn-primary" onClick={startServer} disabled={!config.model_path}>
              <Play size={14} /> Launch
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {error && (
          <div className="card border-accent-red/30 bg-accent-red/5">
            <p className="text-sm text-accent-red">{error}</p>
          </div>
        )}

        {/* Model selection */}
        <div className="card">
          {models.length === 0 ? (
            <>
              <h2 className="section-title">Model</h2>
              <p className="text-sm text-gray-500">
                No models installed.{" "}
                <button className="text-primary-light hover:underline" onClick={() => navigate("/models")}>
                  Download one first.
                </button>
              </p>
            </>
          ) : (() => {
            const selected = models.find((m) => m.path === config.model_path);
            return (
              <>
                <button className="w-full flex items-center justify-between"
                  onClick={() => setShowModelList(!showModelList)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="section-title mb-0 shrink-0">Model</h2>
                    {selected && !showModelList && (
                      <span className="text-sm text-gray-300 truncate">
                        {selected.name}
                        {selected.quant && <span className="text-gray-500 ml-1">{selected.quant}</span>}
                        {selected.is_vision && selected.mmproj_path && (
                          <Eye size={11} className="inline ml-1.5 text-accent-blue" />
                        )}
                      </span>
                    )}
                  </div>
                  {showModelList
                    ? <ChevronUp size={14} className="text-gray-500 shrink-0" />
                    : <ChevronDown size={14} className="text-gray-500 shrink-0" />}
                </button>
                {showModelList && (
                  <div className="space-y-2 mt-3">
                    {[...models].sort((a, b) => {
                      const aFav = favorites.includes(a.id) ? 0 : 1;
                      const bFav = favorites.includes(b.id) ? 0 : 1;
                      if (aFav !== bFav) return aFav - bFav;
                      return a.name.localeCompare(b.name);
                    }).map((m) => {
                      const isSelected = config.model_path === m.path;
                      const hasVision = m.is_vision && !!m.mmproj_path;
                      return (
                        <button key={m.id}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 border text-left transition-colors ${
                            isSelected ? "border-primary/60 bg-primary/10" : "border-border hover:border-border-strong hover:bg-surface-3"
                          }`}
                          onClick={() => { handleModelChange(m); setShowModelList(false); }}>
                          <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${isSelected ? "border-primary bg-primary" : "border-gray-600"}`} />
                          <HardDrive size={13} className="text-gray-500 shrink-0" />
                          <span className="flex-1 text-sm text-gray-200 truncate">{m.name}</span>
                          {hasVision && (
                            <span className="badge-blue text-[10px]" title={`Vision: ${m.mmproj_path}`}>
                              <Eye size={9} className="mr-0.5" /> Vision
                            </span>
                          )}
                          {m.is_vision && !m.mmproj_path && (
                            <span className="badge-gray text-[10px]" title="Vision model but no mmproj file found">
                              <Eye size={9} className="mr-0.5 opacity-50" /> No mmproj
                            </span>
                          )}
                          {m.quant && <span className="badge-purple text-[10px]">{m.quant}</span>}
                          <span className="text-xs text-gray-500">{(m.size_bytes / 1024 ** 3).toFixed(1)} GB</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border -mb-3">
          {TABS.map((tab) => (
            <button key={tab}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === tab ? "text-primary-light border-b-2 border-primary" : "text-gray-500 hover:text-gray-300"
              }`}
              onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="card space-y-4">

          {/* Dynamic tab content — all params rendered from spec */}
          {spec && TABS.map((tab) => (
            activeTab === tab && (
              <DynamicCategory key={tab} category={tab} spec={spec} config={config} setConfig={setConfig}
                models={models} excludeModelPath={config.model_path} />
            )
          ))}
          {!spec && <p className="text-xs text-gray-500">Loading parameters...</p>}
        </div>

        {/* Server logs */}
        <div className="card">
          <button className="w-full flex items-center justify-between" onClick={() => setShowLogs(!showLogs)}>
            <div className="flex items-center gap-2">
              <Terminal size={15} className="text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Server Logs</span>
              {logs.length > 0 && <span className="badge-gray text-[10px]">{logs.length}</span>}
            </div>
            {showLogs ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
          </button>
          {showLogs && (
            <div ref={logsRef} className="mt-3 bg-surface-0 p-3 h-48 overflow-y-auto font-mono text-xs text-gray-400 space-y-0.5">
              {logs.length === 0 ? (
                <span className="text-gray-600">No logs yet…</span>
              ) : logs.map((line, i) => (
                <div key={i} className={
                  line.toLowerCase().includes("error") ? "text-accent-red" :
                  line.toLowerCase().includes("warn") ? "text-accent-yellow" :
                  line.includes("[stderr]") ? "text-gray-600" : "text-gray-400"
                }>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
