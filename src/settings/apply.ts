import { homedir } from "node:os";
import { type Config, DEFAULTS, projectSettingsPath, readEnvConfig, readNamespacedConfig } from "../config.js";
import type { Runtime } from "../runtime.js";
import { AUTO_LABEL, displayValue, parseSettingInput, type SettingDefinition } from "./definitions.js";
import { writeGlobalSetting } from "./store.js";

export type ApplyResult =
	| { ok: true; message: string; warning?: string }
	| { ok: false; error: string };

export interface ApplyOptions {
	/** Global settings file. Defaults to Pi's `settings.json` in the agent directory. */
	settingsPath?: string;
	env?: NodeJS.ProcessEnv;
}

function tildePath(path: string): string {
	const home = homedir();
	return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * Name the source that overrides the global value of `definition`, if any.
 * Project settings override global settings, and the passive env var overrides both.
 */
export function overrideSource(definition: SettingDefinition, cwd: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
	if (definition.key === "passive" && readEnvConfig(env).passive !== undefined) return "PI_OBSERVATIONAL_MEMORY_PASSIVE";
	if (Object.hasOwn(readNamespacedConfig(projectSettingsPath(cwd)), definition.key)) return "project .pi/settings.json";
	return undefined;
}

/**
 * Validate `input` for one menu row, save it to the global settings file, and
 * reload the runtime config so the change applies to this session at once.
 */
export function applySetting(
	definition: SettingDefinition,
	input: string,
	runtime: Runtime,
	cwd: string,
	options: ApplyOptions = {},
): ApplyResult {
	const parsed = parseSettingInput(definition, input, runtime.config);
	if (!parsed.ok) return { ok: false, error: `${definition.label}: ${parsed.error}` };

	const savedConfig = {
		...runtime.config,
		[definition.key]: parsed.value === undefined ? DEFAULTS[definition.key as keyof Config] : parsed.value,
	} as Config;
	const derivedDefault = parsed.value === undefined && definition.kind === "integer" && definition.derived;
	const saved = derivedDefault ? AUTO_LABEL : displayValue(definition, savedConfig);

	let written: string;
	try {
		written = writeGlobalSetting(definition.key, parsed.value, options.settingsPath);
	} catch (error) {
		return { ok: false, error: `${definition.label}: not saved. ${error instanceof Error ? error.message : String(error)}` };
	}
	runtime.reloadConfig(cwd);

	const message = `${definition.label} = ${saved}. Saved to ${tildePath(written)}.`;
	const source = overrideSource(definition, cwd, options.env);
	return source
		? { ok: true, message, warning: `${source} overrides this setting, so this session still uses ${displayValue(definition, runtime.config)}.` }
		: { ok: true, message };
}
