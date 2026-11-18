import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { getSelectListTheme, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Container,
	type Focusable,
	Input,
	matchesKey,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Text,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import type { Config } from "../config.js";
import type { Runtime } from "../runtime.js";
import { applySetting, overrideSource } from "../settings/apply.js";
import {
	displayValue,
	editableValue,
	findDefinition,
	formatModel,
	parseSettingInput,
	SETTING_DEFINITIONS,
	type SettingDefinition,
	THINKING_CHOICES,
} from "../settings/definitions.js";

const BOOLEAN_CHOICES = ["true", "false"];
const MAX_VISIBLE_ROWS = 14;
/** Ctrl+E, the default "cursor to line end" binding of pi-tui's Input. */
const CURSOR_LINE_END = "\x05";

interface AvailableModel {
	provider: string;
	id: string;
	name?: string;
}

/** One row of the menu for the current config. */
export function settingItem(
	definition: SettingDefinition,
	config: Config,
	cwd: string,
	submenuFor: (definition: SettingDefinition) => SettingItem["submenu"],
): SettingItem {
	const source = overrideSource(definition, cwd);
	const description = source ? `${definition.description} Overridden by ${source}.` : definition.description;
	const item: SettingItem = { id: definition.id, label: definition.label, description, currentValue: displayValue(definition, config) };
	switch (definition.kind) {
		case "boolean":
			return { ...item, values: BOOLEAN_CHOICES };
		case "enum":
			return { ...item, values: [...definition.values] };
		case "thinking":
			return { ...item, values: [...THINKING_CHOICES] };
		case "model":
		case "integer":
		case "ratio":
			return { ...item, submenu: submenuFor(definition) };
	}
}

/** Text box for a number. Enter validates and saves; an invalid value stays open with the reason. Escape cancels. */
class TextInputSubmenu implements Component, Focusable {
	private readonly input = new Input();
	private error: string | undefined;
	private _focused = false;

	constructor(
		private readonly title: string,
		private readonly hint: string,
		initial: string,
		private readonly theme: Theme,
		private readonly validate: (value: string) => string | undefined,
		private readonly done: (value?: string) => void,
	) {
		this.input.setValue(initial);
		// setValue keeps the cursor at 0; move it to the end so typing edits the current value.
		this.input.handleInput(CURSOR_LINE_END);
		this.input.focused = true;
		this.input.onSubmit = (value) => {
			this.error = this.validate(value);
			if (!this.error) this.done(value);
		};
		this.input.onEscape = () => this.done();
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = true;
	}

	handleInput(data: string): void {
		this.input.handleInput(data);
	}

	invalidate(): void {
		this.input.invalidate();
	}

	render(width: number): string[] {
		const lines = [
			truncateToWidth(this.theme.fg("accent", this.theme.bold(this.title)), width),
			truncateToWidth(this.theme.fg("dim", this.hint), width),
			...this.input.render(width),
		];
		if (this.error) lines.push(truncateToWidth(this.theme.fg("error", this.error), width));
		lines.push(truncateToWidth(this.theme.fg("dim", "enter save · esc back"), width));
		return lines;
	}
}

/** Model list with a filter box: type to filter, up/down to move, enter to choose, esc to go back. */
class ModelPickerSubmenu implements Component, Focusable {
	private readonly filter = new Input();
	private list: SelectList;
	private _focused = false;

	constructor(
		private readonly title: string,
		private readonly items: SelectItem[],
		currentValue: string,
		private readonly theme: Theme,
		private readonly done: (value?: string) => void,
	) {
		this.list = this.buildList(items);
		const current = items.findIndex((item) => item.value === currentValue);
		if (current >= 0) this.list.setSelectedIndex(current);
		this.filter.focused = true;
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.filter.focused = true;
	}

	/** SelectList filters by prefix only; match every word anywhere in `provider/id` and the name instead. */
	private buildList(items: SelectItem[]): SelectList {
		const list = new SelectList(items, 10, getSelectListTheme());
		list.onSelect = (item) => this.done(item.value);
		list.onCancel = () => this.done();
		return list;
	}

	handleInput(data: string): void {
		if (["up", "down", "pageUp", "pageDown", "enter", "escape"].some((key) => matchesKey(data, key as never))) {
			this.list.handleInput(data);
			return;
		}
		const before = this.filter.getValue();
		this.filter.handleInput(data);
		const query = this.filter.getValue();
		if (query === before) return;
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		this.list = this.buildList(
			this.items.filter((item) => {
				const text = `${item.value} ${item.description ?? ""}`.toLowerCase();
				return words.every((word) => text.includes(word));
			}),
		);
	}

	invalidate(): void {
		this.filter.invalidate();
		this.list.invalidate();
	}

	render(width: number): string[] {
		return [
			truncateToWidth(this.theme.fg("accent", this.theme.bold(this.title)), width),
			...this.filter.render(width),
			...this.list.render(width),
			truncateToWidth(this.theme.fg("dim", "type to filter · enter choose · esc back"), width),
		];
	}
}

function modelItems(definition: Extract<SettingDefinition, { kind: "model" }>, ctx: ExtensionCommandContext): SelectItem[] {
	let available: AvailableModel[] = [];
	try {
		available = (ctx.modelRegistry.getAvailable() as AvailableModel[]).slice();
	} catch {
		available = [];
	}
	available.sort((a, b) => formatModel(a).localeCompare(formatModel(b)));
	return [
		{ value: definition.unsetLabel, label: definition.unsetLabel, description: definition.description },
		...available.map((model) => ({ value: formatModel(model), label: formatModel(model), description: model.name })),
	];
}

function renderPlainSettings(runtime: Runtime, cwd: string): string {
	return [
		"/om:settings needs the interactive TUI. Current settings:",
		...SETTING_DEFINITIONS.map((definition) => {
			const source = overrideSource(definition, cwd);
			return `${definition.label}: ${displayValue(definition, runtime.config)}${source ? ` (from ${source})` : ""}`;
		}),
	].join("\n");
}

export function registerSettingsCommand(pi: ExtensionAPI, runtime: Runtime): void {
	pi.registerCommand("om:settings", {
		description: "Change observational memory settings (saved to the global settings.json, applied now)",
		handler: async (_args, ctx) => {
			runtime.ensureConfig(ctx.cwd);
			if (ctx.mode !== "tui") {
				ctx.ui.notify(renderPlainSettings(runtime, ctx.cwd), "info");
				return;
			}

			await ctx.ui.custom<void>((tui, theme, _keybindings, close) => {
				const status = new Text("", 0, 0);
				const setStatus = (text: string, color: "success" | "warning" | "error") => {
					status.setText(theme.fg(color, text));
				};

				const submenuFor = (definition: SettingDefinition): SettingItem["submenu"] => {
					if (definition.kind === "model") {
						return (currentValue, done) =>
							new ModelPickerSubmenu(definition.label, modelItems(definition, ctx), currentValue, theme, done);
					}
					const hint = definition.kind === "integer" && definition.derived ? "Leave empty for auto." : "Leave empty for the default.";
					return (_currentValue, done) =>
						new TextInputSubmenu(
							definition.label,
							`${definition.description} ${hint}`,
							editableValue(definition, runtime.config),
							theme,
							(value) => {
								const parsed = parseSettingInput(definition, value, runtime.config);
								return parsed.ok ? undefined : parsed.error;
							},
							done,
						);
				};

				const items = SETTING_DEFINITIONS.map((definition) => settingItem(definition, runtime.config, ctx.cwd, submenuFor));

				const refreshValues = () => {
					for (const definition of SETTING_DEFINITIONS) list.updateValue(definition.id, displayValue(definition, runtime.config));
				};

				const list = new SettingsList(
					items,
					MAX_VISIBLE_ROWS,
					getSettingsListTheme(),
					(id, value) => {
						const definition = findDefinition(id);
						if (!definition) return;
						const result = applySetting(definition, value, runtime, ctx.cwd);
						if (!result.ok) setStatus(result.error, "error");
						else if (result.warning) setStatus(`${result.message} ${result.warning}`, "warning");
						else setStatus(result.message, "success");
						// Show the value in effect; on an error this puts the old value back.
						refreshValues();
						tui.requestRender();
					},
					() => close(),
					{ enableSearch: true },
				);

				const container = new Container();
				container.addChild(new Text(theme.fg("accent", theme.bold("Observational memory settings")), 0, 0));
				container.addChild(new Text(theme.fg("dim", "Saved to the global settings.json and applied now. Other open sessions pick them up on restart."), 0, 0));
				container.addChild(new Text("", 0, 0));
				container.addChild(list);
				container.addChild(new Text("", 0, 0));
				container.addChild(status);

				return {
					// Newer Pi lets PageUp/PageDown page the list instead of the transcript; older Pi has no such field.
					capturesViewportInput: (list as { capturesViewportInput?: boolean }).capturesViewportInput ?? false,
					render: (width: number) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput: (data: string) => {
						list.handleInput(data);
						tui.requestRender();
					},
				};
			});
		},
	});
}
