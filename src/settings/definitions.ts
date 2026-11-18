import {
	COMPACT_AFTER_TOKENS_MODE_VALUES,
	type Config,
	type ConfiguredModel,
	normalizeSettingsConfig,
	THINKING_LEVEL_VALUES,
} from "../config.js";

/**
 * One row of the `/om:settings` menu.
 *
 * `key` is the field under `observational-memory` in settings.json that the row
 * writes. The two thinking rows write the `thinking` field inside `model` or
 * `fallbackModel`, so their `key` is that model field.
 */
export type SettingDefinition =
	| { id: BooleanKey; key: BooleanKey; kind: "boolean"; label: string; description: string }
	| { id: "compactAfterTokensMode"; key: "compactAfterTokensMode"; kind: "enum"; values: readonly string[]; label: string; description: string }
	| { id: IntegerKey; key: IntegerKey; kind: "integer"; min: 0 | 1; derived: boolean; label: string; description: string }
	| { id: "compactAfterTokensRatio"; key: "compactAfterTokensRatio"; kind: "ratio"; label: string; description: string }
	| { id: ModelKey; key: ModelKey; kind: "model"; unsetLabel: string; label: string; description: string }
	| { id: "modelThinking" | "fallbackModelThinking"; key: ModelKey; kind: "thinking"; label: string; description: string };

type BooleanKey = "passive" | "consolidateWhenIdle" | "showWorkerNotifications" | "debugLog";
type ModelKey = "model" | "fallbackModel";
type IntegerKey =
	| "observeAfterTokens"
	| "reflectAfterTokens"
	| "compactAfterTokens"
	| "observationsPoolMaxTokens"
	| "observationsPoolTargetTokens"
	| "observerChunkMaxTokens"
	| "workerMemoryMaxTokens"
	| "compactionMaxRetainedTokens"
	| "compactionSummaryMaxTokens"
	| "compactionCatchUpMaxChunks"
	| "agentMaxTurns"
	| "agentMaxTokens";

export const DEFAULT_THINKING_LABEL = "default";
export const AUTO_LABEL = "auto";
export const THINKING_CHOICES: readonly string[] = [DEFAULT_THINKING_LABEL, ...THINKING_LEVEL_VALUES];

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
	{
		id: "model",
		key: "model",
		kind: "model",
		unsetLabel: "session model",
		label: "Memory model",
		description: "Model for the observer, reflector and dropper. Unset uses the session model.",
	},
	{
		id: "modelThinking",
		key: "model",
		kind: "thinking",
		label: "Memory model thinking",
		description: "Thinking level for the memory model. \"default\" uses the model's own default. Needs a memory model.",
	},
	{
		id: "fallbackModel",
		key: "fallbackModel",
		kind: "model",
		unsetLabel: "none",
		label: "Fallback model",
		description: "Used when the memory model cannot be resolved, and to retry one worker stage after its model call fails.",
	},
	{
		id: "fallbackModelThinking",
		key: "fallbackModel",
		kind: "thinking",
		label: "Fallback model thinking",
		description: "Thinking level for the fallback model. \"default\" uses the model's own default. Needs a fallback model.",
	},
	{
		id: "passive",
		key: "passive",
		kind: "boolean",
		label: "Passive",
		description: "Stop the automatic memory workers and auto-compaction. Manual and Pi compaction, commands and recall stay active.",
	},
	{
		id: "consolidateWhenIdle",
		key: "consolidateWhenIdle",
		kind: "boolean",
		label: "Consolidate when idle",
		description: "Run memory workers only while the agent is idle, and abort a run when a new agent run starts.",
	},
	{
		id: "showWorkerNotifications",
		key: "showWorkerNotifications",
		kind: "boolean",
		label: "Worker notifications",
		description: "Show a notification when the observer, reflector or dropper records memory.",
	},
	{
		id: "debugLog",
		key: "debugLog",
		kind: "boolean",
		label: "Debug log",
		description: "Write a debug log of memory worker activity.",
	},
	{
		id: "observeAfterTokens",
		key: "observeAfterTokens",
		kind: "integer",
		min: 1,
		derived: false,
		label: "Observe after tokens",
		description: "Run the observer after this many new source tokens.",
	},
	{
		id: "reflectAfterTokens",
		key: "reflectAfterTokens",
		kind: "integer",
		min: 1,
		derived: false,
		label: "Reflect after tokens",
		description: "Run the reflector after this many new observed tokens.",
	},
	{
		id: "compactAfterTokensMode",
		key: "compactAfterTokensMode",
		kind: "enum",
		values: COMPACT_AFTER_TOKENS_MODE_VALUES,
		label: "Compaction trigger mode",
		description: "calibrated: compact after the fixed token count. ratio: compact after a fraction of the model's context window.",
	},
	{
		id: "compactAfterTokensRatio",
		key: "compactAfterTokensRatio",
		kind: "ratio",
		label: "Compaction ratio",
		description: "In ratio mode, compact after this fraction of the context window. A number between 0 and 1.",
	},
	{
		id: "compactAfterTokens",
		key: "compactAfterTokens",
		kind: "integer",
		min: 1,
		derived: false,
		label: "Compact after tokens",
		description: "In calibrated mode, compact after this many source tokens. Ratio mode also uses it when the context window is unknown.",
	},
	{
		id: "observationsPoolMaxTokens",
		key: "observationsPoolMaxTokens",
		kind: "integer",
		min: 1,
		derived: false,
		label: "Observation pool max",
		description: "Run the dropper when the visible observation pool grows past this many tokens.",
	},
	{
		id: "observationsPoolTargetTokens",
		key: "observationsPoolTargetTokens",
		kind: "integer",
		min: 1,
		derived: true,
		label: "Observation pool target",
		description: "The dropper trims the pool to this many tokens. Must be less than the pool max. Auto is half the pool max.",
	},
	{
		id: "observerChunkMaxTokens",
		key: "observerChunkMaxTokens",
		kind: "integer",
		min: 1,
		derived: true,
		label: "Observer chunk max",
		description: "Most source tokens in one observer request. Auto is a fifth of the memory model's context window.",
	},
	{
		id: "workerMemoryMaxTokens",
		key: "workerMemoryMaxTokens",
		kind: "integer",
		min: 1,
		derived: true,
		label: "Worker memory max",
		description: "Most prior-memory tokens in one worker request. Auto is a quarter of the memory model's context window.",
	},
	{
		id: "compactionMaxRetainedTokens",
		key: "compactionMaxRetainedTokens",
		kind: "integer",
		min: 1,
		derived: true,
		label: "Compaction max retained",
		description: "Most unobserved source tokens kept in context at compaction. Auto is half the session model's context window.",
	},
	{
		id: "compactionSummaryMaxTokens",
		key: "compactionSummaryMaxTokens",
		kind: "integer",
		min: 1,
		derived: true,
		label: "Compaction summary max",
		description: "Token budget of the memory summary at compaction. Auto is an eighth of the session model's context window.",
	},
	{
		id: "compactionCatchUpMaxChunks",
		key: "compactionCatchUpMaxChunks",
		kind: "integer",
		min: 0,
		derived: false,
		label: "Compaction catch-up chunks",
		description: "Most observer chunks run during compaction to catch up. 0 disables catch-up.",
	},
	{
		id: "agentMaxTurns",
		key: "agentMaxTurns",
		kind: "integer",
		min: 1,
		derived: false,
		label: "Worker max turns",
		description: "Most turns in one memory worker run.",
	},
	{
		id: "agentMaxTokens",
		key: "agentMaxTokens",
		kind: "integer",
		min: 1,
		derived: false,
		label: "Worker max output tokens",
		description: "Most output tokens per memory worker request. Clamped to the model's own limit.",
	},
];

export function findDefinition(id: string): SettingDefinition | undefined {
	return SETTING_DEFINITIONS.find((definition) => definition.id === id);
}

export function formatModel(model: ConfiguredModel): string {
	return `${model.provider}/${model.id}`;
}

/** The value shown on the right of the menu row for the effective config. */
export function displayValue(definition: SettingDefinition, config: Config): string {
	switch (definition.kind) {
		case "boolean":
			return String(config[definition.key]);
		case "enum":
			return config[definition.key];
		case "ratio":
			return String(config[definition.key]);
		case "integer": {
			const value = config[definition.key];
			return value === undefined ? AUTO_LABEL : value.toLocaleString("en-US");
		}
		case "model": {
			const model = config[definition.key];
			return model ? formatModel(model) : definition.unsetLabel;
		}
		case "thinking":
			return config[definition.key]?.thinking ?? DEFAULT_THINKING_LABEL;
	}
}

/** The text an input box starts with: the plain number, or empty when the value is derived. */
export function editableValue(definition: SettingDefinition, config: Config): string {
	if (definition.kind === "integer") {
		const value = config[definition.key];
		return value === undefined ? "" : String(value);
	}
	if (definition.kind === "ratio") return String(config[definition.key]);
	return displayValue(definition, config);
}

export type ParseResult =
	/** `value` undefined removes the key, so the setting falls back to its default. */
	| { ok: true; value: unknown }
	| { ok: false; error: string };

const RESET_WORDS = new Set(["", "auto", "default", "unset"]);

function parseInteger(input: string): number | undefined {
	const compact = input.trim().toLowerCase().replace(/[,_\s]/g, "");
	const match = /^(\d+(?:\.\d+)?)(k)?$/.exec(compact);
	if (!match) return undefined;
	const value = Number(match[1]) * (match[2] ? 1000 : 1);
	return Number.isSafeInteger(value) ? value : undefined;
}

/** True when the loader accepts `value` for `key`, so a saved value can never be silently ignored. */
function loaderAccepts(key: string, value: unknown): boolean {
	return Object.hasOwn(normalizeSettingsConfig({ [key]: value }), key);
}

/**
 * Turn menu input into the value to save for `definition.key`.
 *
 * Model rows take `provider/id`, or the row's unset label to remove the model.
 * Thinking rows keep the effective model and change only its `thinking`.
 * Empty input, "auto" or "default" removes a number setting, so it falls back to its default.
 */
export function parseSettingInput(definition: SettingDefinition, input: string, config: Config): ParseResult {
	const text = input.trim();
	switch (definition.kind) {
		case "boolean":
			if (text === "true") return { ok: true, value: true };
			if (text === "false") return { ok: true, value: false };
			return { ok: false, error: "Use true or false." };
		case "enum":
			return definition.values.includes(text)
				? { ok: true, value: text }
				: { ok: false, error: `Use one of: ${definition.values.join(", ")}.` };
		case "ratio": {
			if (RESET_WORDS.has(text.toLowerCase())) return { ok: true, value: undefined };
			const value = Number(text);
			return text !== "" && loaderAccepts(definition.key, value)
				? { ok: true, value }
				: { ok: false, error: "Enter a number greater than 0 and less than 1, for example 0.5." };
		}
		case "integer": {
			if (RESET_WORDS.has(text.toLowerCase())) return { ok: true, value: undefined };
			const value = parseInteger(text);
			const minText = definition.min === 0 ? "0 or more" : "1 or more";
			if (value === undefined || !loaderAccepts(definition.key, value)) {
				return { ok: false, error: `Enter a whole number, ${minText}. Examples: 12000, 12,000, 12k. Leave empty for the default.` };
			}
			if (definition.key === "observationsPoolTargetTokens" && value >= config.observationsPoolMaxTokens) {
				return {
					ok: false,
					error: `Must be less than the observation pool max (${config.observationsPoolMaxTokens.toLocaleString("en-US")}).`,
				};
			}
			return { ok: true, value };
		}
		case "model": {
			if (text === definition.unsetLabel || text === "") return { ok: true, value: undefined };
			const slash = text.indexOf("/");
			if (slash <= 0 || slash === text.length - 1) return { ok: false, error: "Use provider/model-id." };
			const model: ConfiguredModel = { provider: text.slice(0, slash), id: text.slice(slash + 1) };
			// Keep the thinking level when the model changes; it is a separate row.
			const thinking = config[definition.key]?.thinking;
			if (thinking) model.thinking = thinking;
			return { ok: true, value: model };
		}
		case "thinking": {
			const model = config[definition.key];
			if (!model) {
				const row = definition.key === "model" ? "Memory model" : "Fallback model";
				return { ok: false, error: `Choose a ${row} first.` };
			}
			if (text === DEFAULT_THINKING_LABEL) {
				const { thinking: _removed, ...rest } = model;
				return { ok: true, value: rest };
			}
			const next = { ...model, thinking: text };
			return loaderAccepts(definition.key, next) && normalizeSettingsConfig({ [definition.key]: next })[definition.key]?.thinking === text
				? { ok: true, value: next }
				: { ok: false, error: `Use one of: ${THINKING_CHOICES.join(", ")}.` };
		}
	}
}
