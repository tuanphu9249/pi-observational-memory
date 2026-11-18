import { chmodSync, existsSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { globalSettingsPath, SETTINGS_KEY } from "../config.js";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Set or remove one key under `observational-memory` in Pi's global settings file.
 *
 * Only that namespace changes; every other key keeps its value and order. The
 * file is replaced atomically (temp file and rename in the same directory) and
 * keeps its permission bits, so a 0600 file stays 0600. A symlinked settings
 * file is written through to its target. `value` undefined removes the key.
 *
 * Pi has no settings-write API for extensions. Pi re-reads this file and merges
 * only its own modified fields when it saves, so Pi does not overwrite the key
 * written here.
 *
 * Throws, and leaves the file unchanged, when the file is not a JSON object.
 */
export function writeGlobalSetting(key: string, value: unknown, path: string = globalSettingsPath()): string {
	const target = existsSync(path) ? realpathSync(path) : path;
	let mode = 0o600;
	let root: Record<string, unknown> = {};
	let trailingNewline = true;

	if (existsSync(target)) {
		mode = statSync(target).mode & 0o777;
		const text = readFileSync(target, "utf-8").replace(/^\uFEFF/, "");
		trailingNewline = text.endsWith("\n");
		if (text.trim() !== "") {
			let parsed: unknown;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new Error(`${path} is not valid JSON. Fix the file, then change the setting again.`);
			}
			if (!isRecord(parsed)) throw new Error(`${path} does not contain a JSON object. Fix the file, then change the setting again.`);
			root = parsed;
		}
	}

	const namespace = isRecord(root[SETTINGS_KEY]) ? { ...root[SETTINGS_KEY] } : {};
	if (value === undefined) delete namespace[key];
	else namespace[key] = value;
	if (Object.keys(namespace).length > 0) root[SETTINGS_KEY] = namespace;
	else delete root[SETTINGS_KEY];

	const text = `${JSON.stringify(root, null, 2)}${trailingNewline ? "\n" : ""}`;
	const temp = join(dirname(target), `.${SETTINGS_KEY}-${process.pid}-${Date.now()}.tmp`);
	try {
		writeFileSync(temp, text, { encoding: "utf-8", mode });
		chmodSync(temp, mode);
		renameSync(temp, target);
	} catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
	return target;
}
