import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ agentDir: "" }));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => mock.agentDir,
}));

import { DEFAULTS, loadConfig } from "../src/config.js";
import { Runtime } from "../src/runtime.js";
import { applySetting } from "../src/settings/apply.js";
import { displayValue, findDefinition, parseSettingInput, SETTING_DEFINITIONS, type SettingDefinition } from "../src/settings/definitions.js";
import { writeGlobalSetting } from "../src/settings/store.js";

function definition(id: string): SettingDefinition {
	const found = findDefinition(id);
	if (!found) throw new Error(`no definition ${id}`);
	return found;
}

function readJson(path: string): any {
	return JSON.parse(readFileSync(path, "utf-8"));
}

describe("/om:settings", () => {
	let root: string;
	let cwd: string;
	let settingsPath: string;

	beforeEach(() => {
		root = `${tmpdir()}/om-settings-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		cwd = join(root, "project");
		mock.agentDir = join(root, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(mock.agentDir, { recursive: true });
		settingsPath = join(mock.agentDir, "settings.json");
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	describe("definitions", () => {
		it("cover every user setting in Config exactly once", () => {
			const keys = new Set(SETTING_DEFINITIONS.map((d) => d.key));
			const configKeys = [...Object.keys(DEFAULTS), "model", "fallbackModel", "observerChunkMaxTokens", "compactionMaxRetainedTokens", "compactionSummaryMaxTokens", "workerMemoryMaxTokens"]
				.filter((key) => key !== "piAutoCompactionEnabled");
			expect([...keys].sort()).toEqual([...new Set(configKeys)].sort());
			expect(new Set(SETTING_DEFINITIONS.map((d) => d.id)).size).toBe(SETTING_DEFINITIONS.length);
		});

		it("parse numbers with separators and a k suffix, and reject what the loader would ignore", () => {
			const observe = definition("observeAfterTokens");
			expect(parseSettingInput(observe, "12,000", DEFAULTS)).toEqual({ ok: true, value: 12000 });
			expect(parseSettingInput(observe, "12_000", DEFAULTS)).toEqual({ ok: true, value: 12000 });
			expect(parseSettingInput(observe, "12k", DEFAULTS)).toEqual({ ok: true, value: 12000 });
			expect(parseSettingInput(observe, "", DEFAULTS)).toEqual({ ok: true, value: undefined });
			expect(parseSettingInput(observe, "0", DEFAULTS).ok).toBe(false);
			expect(parseSettingInput(observe, "1.5", DEFAULTS).ok).toBe(false);
			expect(parseSettingInput(observe, "abc", DEFAULTS).ok).toBe(false);
			expect(parseSettingInput(definition("compactionCatchUpMaxChunks"), "0", DEFAULTS)).toEqual({ ok: true, value: 0 });
		});

		it("reject a pool target that is not below the pool max", () => {
			const target = definition("observationsPoolTargetTokens");
			expect(parseSettingInput(target, "20000", DEFAULTS).ok).toBe(false);
			expect(parseSettingInput(target, "19999", DEFAULTS)).toEqual({ ok: true, value: 19999 });
		});

		it("accept a ratio only strictly between 0 and 1", () => {
			const ratio = definition("compactAfterTokensRatio");
			expect(parseSettingInput(ratio, "0.4", DEFAULTS)).toEqual({ ok: true, value: 0.4 });
			expect(parseSettingInput(ratio, "1", DEFAULTS).ok).toBe(false);
			expect(parseSettingInput(ratio, "0", DEFAULTS).ok).toBe(false);
		});

		it("keep the thinking level when the model changes, and need a model before thinking", () => {
			const config = { ...DEFAULTS, model: { provider: "anthropic", id: "claude-sonnet-5-5", thinking: "low" as const } };
			expect(parseSettingInput(definition("model"), "openrouter/google/gemma-4-31b-it", config)).toEqual({
				ok: true,
				value: { provider: "openrouter", id: "google/gemma-4-31b-it", thinking: "low" },
			});
			expect(parseSettingInput(definition("model"), "session model", config)).toEqual({ ok: true, value: undefined });
			expect(parseSettingInput(definition("modelThinking"), "high", config)).toEqual({
				ok: true,
				value: { provider: "anthropic", id: "claude-sonnet-5-5", thinking: "high" },
			});
			expect(parseSettingInput(definition("modelThinking"), "default", config)).toEqual({
				ok: true,
				value: { provider: "anthropic", id: "claude-sonnet-5-5" },
			});
			expect(parseSettingInput(definition("fallbackModelThinking"), "high", config).ok).toBe(false);
		});

		it("show auto for derived budgets and the unset label for models", () => {
			expect(displayValue(definition("observerChunkMaxTokens"), DEFAULTS)).toBe("auto");
			expect(displayValue(definition("observeAfterTokens"), DEFAULTS)).toBe("10,000");
			expect(displayValue(definition("model"), DEFAULTS)).toBe("session model");
			expect(displayValue(definition("fallbackModel"), DEFAULTS)).toBe("none");
		});
	});

	describe("store", () => {
		it("changes only the observational-memory key and keeps other keys, order and the trailing newline", () => {
			writeFileSync(settingsPath, `${JSON.stringify({ theme: "gruvbox-dark", "observational-memory": { passive: false, debugLog: true }, packages: ["a"] }, null, 2)}\n`);
			writeGlobalSetting("passive", true, settingsPath);
			const text = readFileSync(settingsPath, "utf-8");
			expect(text.endsWith("}\n")).toBe(true);
			expect(Object.keys(JSON.parse(text))).toEqual(["theme", "observational-memory", "packages"]);
			expect(readJson(settingsPath)).toEqual({ theme: "gruvbox-dark", "observational-memory": { passive: true, debugLog: true }, packages: ["a"] });
		});

		it("removes the key for undefined and drops an empty namespace", () => {
			writeFileSync(settingsPath, JSON.stringify({ theme: "x", "observational-memory": { passive: true } }));
			writeGlobalSetting("passive", undefined, settingsPath);
			expect(readJson(settingsPath)).toEqual({ theme: "x" });
		});

		it("keeps the file mode and writes through a symlink", () => {
			const real = join(root, "real-settings.json");
			writeFileSync(real, "{}");
			chmodSync(real, 0o600);
			rmSync(settingsPath, { force: true });
			symlinkSync(real, settingsPath);
			writeGlobalSetting("debugLog", true, settingsPath);
			expect(lstatSync(settingsPath).isSymbolicLink()).toBe(true);
			expect(readJson(real)).toEqual({ "observational-memory": { debugLog: true } });
			expect(statSync(real).mode & 0o777).toBe(0o600);
		});

		it("creates a missing file with mode 0600", () => {
			writeGlobalSetting("debugLog", true, settingsPath);
			expect(readJson(settingsPath)).toEqual({ "observational-memory": { debugLog: true } });
			expect(statSync(settingsPath).mode & 0o777).toBe(0o600);
		});

		it("refuses to touch a file that is not a JSON object", () => {
			writeFileSync(settingsPath, "{ broken");
			expect(() => writeGlobalSetting("debugLog", true, settingsPath)).toThrow(/not valid JSON/);
			expect(readFileSync(settingsPath, "utf-8")).toBe("{ broken");
		});
	});

	describe("apply", () => {
		function runtimeFor(): Runtime {
			const runtime = new Runtime();
			runtime.ensureConfig(cwd);
			return runtime;
		}

		it("saves to the global file and applies to the running session at once", () => {
			writeFileSync(settingsPath, JSON.stringify({ theme: "x" }));
			const runtime = runtimeFor();
			const result = applySetting(definition("observeAfterTokens"), "12k", runtime, cwd, { env: {} });
			expect(result).toMatchObject({ ok: true, message: expect.stringContaining("Observe after tokens = 12,000") });
			expect(runtime.config.observeAfterTokens).toBe(12000);
			expect(loadConfig(cwd, {}).observeAfterTokens).toBe(12000);
			expect(readJson(settingsPath).theme).toBe("x");
		});

		it("resets a setting to its default when the input is empty", () => {
			writeFileSync(settingsPath, JSON.stringify({ "observational-memory": { observeAfterTokens: 5000 } }));
			const runtime = runtimeFor();
			expect(applySetting(definition("observeAfterTokens"), "", runtime, cwd, { env: {} }).ok).toBe(true);
			expect(runtime.config.observeAfterTokens).toBe(DEFAULTS.observeAfterTokens);
			expect(readJson(settingsPath)).toEqual({});
		});

		it("does not write an invalid value", () => {
			writeFileSync(settingsPath, JSON.stringify({ "observational-memory": { observeAfterTokens: 5000 } }));
			const runtime = runtimeFor();
			const result = applySetting(definition("observeAfterTokens"), "-3", runtime, cwd, { env: {} });
			expect(result.ok).toBe(false);
			expect(readJson(settingsPath)).toEqual({ "observational-memory": { observeAfterTokens: 5000 } });
			expect(runtime.config.observeAfterTokens).toBe(5000);
		});

		it("warns when project settings override the saved value", () => {
			mkdirSync(join(cwd, ".pi"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ "observational-memory": { debugLog: false } }));
			const runtime = runtimeFor();
			const result = applySetting(definition("debugLog"), "true", runtime, cwd, { env: {} });
			expect(result).toMatchObject({ ok: true, message: expect.stringContaining("Debug log = true"), warning: expect.stringContaining("project .pi/settings.json") });
			expect(runtime.config.debugLog).toBe(false);
			expect(readJson(settingsPath)["observational-memory"].debugLog).toBe(true);
		});

		it("warns when the passive env var overrides the saved value", () => {
			const runtime = runtimeFor();
			const result = applySetting(definition("passive"), "true", runtime, cwd, { env: { PI_OBSERVATIONAL_MEMORY_PASSIVE: "0" } });
			expect(result).toMatchObject({ ok: true, warning: expect.stringContaining("PI_OBSERVATIONAL_MEMORY_PASSIVE") });
		});
	});
});
