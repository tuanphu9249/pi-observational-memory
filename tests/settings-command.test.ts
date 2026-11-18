import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ agentDir: "" }));

vi.mock("@earendil-works/pi-coding-agent", () => {
	const plain = (text: string) => text;
	return {
		getAgentDir: () => mock.agentDir,
		getSettingsListTheme: () => ({ label: plain, value: plain, description: plain, cursor: "> ", hint: plain }),
		getSelectListTheme: () => ({ selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain }),
	};
});

import { registerSettingsCommand } from "../src/commands/settings.js";
import { Runtime } from "../src/runtime.js";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
const DOWN = "\x1b[B";
const ENTER = "\r";
const ESCAPE = "\x1b";

function setup(mode: "tui" | "rpc", cwd: string) {
	let handler: ((args: unknown, ctx: any) => Promise<void>) | undefined;
	const pi = {
		registerCommand: vi.fn((name: string, command: { handler: typeof handler }) => {
			expect(name).toBe("om:settings");
			handler = command.handler;
		}),
	};
	const runtime = new Runtime();
	registerSettingsCommand(pi as any, runtime);
	let component: any;
	let closed = false;
	const notify = vi.fn();
	const ctx = {
		cwd,
		mode,
		ui: {
			notify,
			custom: vi.fn(async (factory: any) => {
				component = factory({ requestRender: () => {} }, theme, {}, () => {
					closed = true;
				});
			}),
		},
		modelRegistry: {
			getAvailable: () => [
				{ provider: "anthropic", id: "claude-haiku-5-5", name: "Haiku" },
				{ provider: "anthropic", id: "claude-sonnet-5-5", name: "Sonnet" },
			],
		},
	};
	return {
		runtime,
		notify,
		open: () => handler!(undefined, ctx),
		press: (...keys: string[]) => keys.forEach((key) => component.handleInput(key)),
		screen: () => (component.render(100) as string[]).join("\n"),
		closed: () => closed,
	};
}

describe("/om:settings command", () => {
	let root: string;
	let cwd: string;
	let settingsPath: string;

	beforeEach(() => {
		root = `${tmpdir()}/om-settings-cmd-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		cwd = join(root, "project");
		mock.agentDir = join(root, "agent");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(mock.agentDir, { recursive: true });
		settingsPath = join(mock.agentDir, "settings.json");
		writeFileSync(settingsPath, `${JSON.stringify({ theme: "gruvbox-dark" }, null, 2)}\n`);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("prints the current settings outside the TUI", async () => {
		const { open, notify } = setup("rpc", cwd);
		await open();
		const output = notify.mock.calls.at(-1)?.[0] as string;
		expect(output).toContain("needs the interactive TUI");
		expect(output).toContain("Observe after tokens: 10,000");
	});

	it("toggles a setting, saves it and applies it to the session", async () => {
		const { open, press, screen, runtime } = setup("tui", cwd);
		await open();
		expect(screen()).toContain("Observational memory settings");
		// Rows: Memory model, Memory model thinking, Fallback model, Fallback model thinking, Passive.
		press(DOWN, DOWN, DOWN, DOWN, ENTER);
		expect(runtime.config.passive).toBe(true);
		expect(JSON.parse(readFileSync(settingsPath, "utf-8"))).toEqual({ theme: "gruvbox-dark", "observational-memory": { passive: true } });
		expect(screen()).toContain("Passive = true. Saved to");
	});

	it("picks a memory model from the filtered model list", async () => {
		const { open, press, runtime } = setup("tui", cwd);
		await open();
		press(ENTER, "h", "a", "i", ENTER);
		expect(runtime.config.model).toEqual({ provider: "anthropic", id: "claude-haiku-5-5" });
	});

	it("keeps a number box open with the reason when the value is invalid", async () => {
		const { open, press, screen, runtime } = setup("tui", cwd);
		await open();
		// Row 9 is "Observe after tokens".
		press(...Array(8).fill(DOWN), ENTER);
		expect(screen()).toContain("Observe after tokens");
		press(..."\x7f\x7f\x7f\x7f\x7f".split(""), "0", ENTER);
		expect(screen()).toContain("Enter a whole number");
		press(..."\x7f".split(""), "1", "5", "k", ENTER);
		expect(runtime.config.observeAfterTokens).toBe(15000);
	});

	it("shows an error and keeps the old value when the thinking row has no model", async () => {
		const { open, press, screen, runtime } = setup("tui", cwd);
		await open();
		press(DOWN, ENTER);
		expect(screen()).toContain("Choose a Memory model first");
		expect(screen()).toMatch(/Memory model thinking\s+default/);
		expect(runtime.config.model).toBeUndefined();
	});

	it("closes on escape", async () => {
		const { open, press, closed } = setup("tui", cwd);
		await open();
		press(ESCAPE);
		expect(closed()).toBe(true);
	});
});
