import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { closeSync, existsSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ImageMimeType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

type ImageAttachment = {
	token: string;
	path: string;
	mimeType: ImageMimeType;
	displayName: string;
};

type Registry = {
	attachments: Map<string, ImageAttachment>;
	nameCounts: Map<string, number>;
};

type KeybindingsLike = {
	matches(data: string, action: string): boolean;
};

const TOKEN_PREFIX = "📎 ";
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export default function imageAttachments(pi: ExtensionAPI) {
	const registry: Registry = {
		attachments: new Map(),
		nameCounts: new Map(),
	};

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
			new AttachmentEditor(tui, theme, keybindings as unknown as KeybindingsLike, ctx.cwd, registry, ctx.ui.theme),
		);
	});

	pi.on("input", async (event, ctx) => {
		let text = event.text;
		const images: Array<{ type: "image"; mimeType: string; data: string }> = [...(event.images ?? [])];
		const usedTokens = [...registry.attachments.values()].filter((attachment) => text.includes(attachment.token));

		if (usedTokens.length > 0) {
			for (const attachment of usedTokens) {
				try {
					const image = await readAttachmentImage(attachment);
					images.push(image);
					text = replaceAll(
						text,
						attachment.token,
						`<file name="${escapeXmlAttr(attachment.path)}">[Attached image]</file>`,
					);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					text = replaceAll(
						text,
						attachment.token,
						`[Attachment missing: ${attachment.path} (${message})]`,
					);
					ctx.ui.notify(`Image attachment failed: ${attachment.displayName}`, "warning");
				}
				registry.attachments.delete(attachment.token);
			}

			return { action: "transform" as const, text, images };
		}

		// Fallback: if another extension replaced our editor component, pasted/dropped
		// paths will reach the input event as raw text rather than 📎 tokens.
		const pathReplacements = findImagePathReplacements(text, ctx.cwd, registry);
		if (pathReplacements.length === 0) return { action: "continue" as const };

		let output = "";
		let cursor = 0;
		for (const replacement of pathReplacements) {
			const attachment = registry.attachments.get(replacement.token);
			if (!attachment) continue;

			output += text.slice(cursor, replacement.start);
			try {
				const image = await readAttachmentImage(attachment);
				images.push(image);
				output += `<file name="${escapeXmlAttr(attachment.path)}">[Attached image]</file>`;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				output += `[Attachment missing: ${attachment.path} (${message})]`;
				ctx.ui.notify(`Image attachment failed: ${attachment.displayName}`, "warning");
			}
			registry.attachments.delete(attachment.token);
			cursor = replacement.end;
		}
		output += text.slice(cursor);

		return { action: "transform" as const, text: output, images };
	});
}

class AttachmentEditor extends CustomEditor {
	constructor(
		tui: TUI,
		theme: EditorTheme,
		private readonly kb: KeybindingsLike,
		private readonly cwd: string,
		private readonly registry: Registry,
		private readonly appTheme: Theme,
	) {
		super(tui, theme, kb as never);
	}

	override render(width: number): string[] {
		return super.render(width).map((line) => styleAttachmentTokens(line, this.registry, (token) => this.styleToken(token)));
	}

	override insertTextAtCursor(text: string): void {
		const replacement = this.attachmentReplacementForText(text);
		if (replacement.changed) {
			super.insertTextAtCursor(replacement.text);
			return;
		}
		super.insertTextAtCursor(text);
	}

	override handleInput(data: string): void {
		if (this.isBackspace(data) && this.deleteTokenAtCursor("backspace")) return;
		if (this.isForwardDelete(data) && this.deleteTokenAtCursor("delete")) return;

		const paste = extractCompleteBracketedPaste(data);
		if (paste) {
			const replacement = this.attachmentReplacementForText(paste.content);
			if (replacement.changed) {
				super.handleInput(`\x1b[200~${replacement.text}\x1b[201~${paste.remaining}`);
				return;
			}
		}

		super.handleInput(data);
		this.maybeTokenizeEscapedBuffer();
	}

	private maybeTokenizeEscapedBuffer(): void {
		const text = this.getText();
		// Some terminals send drag/drop as plain keystrokes, not bracketed paste.
		// To avoid surprising manual plain paths, only auto-tokenize shell-ish path forms.
		if (!text.includes("\\") && !text.includes("file://") && !text.includes("'") && !text.includes('"')) return;

		const replacements = findImagePathReplacements(text, this.cwd, this.registry);
		if (replacements.length === 0) return;

		let next = "";
		let cursor = 0;
		for (const replacement of replacements) {
			next += text.slice(cursor, replacement.start);
			next += replacement.token;
			cursor = replacement.end;
		}
		next += text.slice(cursor);

		const pos = absoluteCursorOffset(this.getLines(), this.getCursor());
		let nextPos = pos;
		for (const replacement of replacements) {
			const oldLength = replacement.end - replacement.start;
			const delta = replacement.token.length - oldLength;
			if (pos > replacement.end) {
				nextPos += delta;
			} else if (pos >= replacement.start) {
				nextPos = replacement.start + replacement.token.length;
				break;
			}
		}

		const nextLines = next.split("\n");
		const nextCursor = cursorFromAbsoluteOffset(nextLines, nextPos);
		this.setEditorState(nextLines, nextCursor.line, nextCursor.col);
	}

	private styleToken(token: string): string {
		return this.appTheme.bg("selectedBg", this.appTheme.fg("accent", this.appTheme.bold(token)));
	}

	private isBackspace(data: string): boolean {
		return this.kb.matches(data, "tui.editor.deleteCharBackward") || data === "\x7f" || data === "\b";
	}

	private isForwardDelete(data: string): boolean {
		return this.kb.matches(data, "tui.editor.deleteCharForward") || data === "\x1b[3~";
	}

	private attachmentReplacementForText(text: string): { changed: boolean; text: string } {
		const replacements = findImagePathReplacements(text, this.cwd, this.registry);
		if (replacements.length === 0) return { changed: false, text };

		let output = "";
		let cursor = 0;
		for (const replacement of replacements) {
			output += text.slice(cursor, replacement.start);
			output += replacement.token;
			cursor = replacement.end;
		}
		output += text.slice(cursor);

		return { changed: true, text: output };
	}

	private deleteTokenAtCursor(mode: "backspace" | "delete"): boolean {
		const lines = this.getLines();
		const cursor = this.getCursor();
		const line = lines[cursor.line] ?? "";

		for (const attachment of this.registry.attachments.values()) {
			let from = 0;
			while (true) {
				const start = line.indexOf(attachment.token, from);
				if (start === -1) break;
				const end = start + attachment.token.length;
				const hit =
					mode === "backspace"
						? cursor.col > start && cursor.col <= end
						: cursor.col >= start && cursor.col < end;
				if (hit) {
					lines[cursor.line] = line.slice(0, start) + line.slice(end);
					this.setEditorState(lines, cursor.line, start);
					this.registry.attachments.delete(attachment.token);
					return true;
				}
				from = end;
			}
		}

		return false;
	}

	private setEditorState(lines: string[], cursorLine: number, cursorCol: number): void {
		const self = this as unknown as {
			state: { lines: string[]; cursorLine: number; cursorCol: number };
			onChange?: (text: string) => void;
			tui?: { requestRender(): void };
		};
		self.state.lines = lines.length === 0 ? [""] : lines;
		self.state.cursorLine = Math.max(0, Math.min(cursorLine, self.state.lines.length - 1));
		self.state.cursorCol = Math.max(0, Math.min(cursorCol, self.state.lines[self.state.cursorLine]?.length ?? 0));
		self.onChange?.(self.state.lines.join("\n"));
		self.tui?.requestRender();
	}
}

function absoluteCursorOffset(lines: string[], cursor: { line: number; col: number }): number {
	let offset = 0;
	for (let i = 0; i < cursor.line; i++) {
		offset += (lines[i]?.length ?? 0) + 1;
	}
	return offset + cursor.col;
}

function cursorFromAbsoluteOffset(lines: string[], offset: number): { line: number; col: number } {
	let remaining = Math.max(0, offset);
	for (let line = 0; line < lines.length; line++) {
		const length = lines[line]?.length ?? 0;
		if (remaining <= length) return { line, col: remaining };
		remaining -= length + 1;
	}
	const lastLine = Math.max(0, lines.length - 1);
	return { line: lastLine, col: lines[lastLine]?.length ?? 0 };
}

function extractCompleteBracketedPaste(data: string): { content: string; remaining: string } | undefined {
	const startMarker = "\x1b[200~";
	const endMarker = "\x1b[201~";
	const start = data.indexOf(startMarker);
	if (start === -1) return undefined;
	const contentStart = start + startMarker.length;
	const end = data.indexOf(endMarker, contentStart);
	if (end === -1) return undefined;
	return {
		content: data.slice(contentStart, end),
		remaining: data.slice(end + endMarker.length),
	};
}

function findImagePathReplacements(text: string, cwd: string, registry: Registry): Array<{ start: number; end: number; token: string }> {
	const whole = normalizeCandidatePath(text.trim(), cwd);
	const wholeImage = whole ? detectImagePath(whole) : undefined;
	if (wholeImage) {
		const token = registerAttachment(wholeImage.path, wholeImage.mimeType, registry);
		return [{ start: text.indexOf(text.trim()), end: text.indexOf(text.trim()) + text.trim().length, token }];
	}

	const parsed = parseShellLikeWords(text);
	const replacements: Array<{ start: number; end: number; token: string }> = [];

	for (const word of parsed) {
		const normalized = normalizeCandidatePath(word.value, cwd);
		if (!normalized) continue;
		const image = detectImagePath(normalized);
		if (!image) continue;
		const token = registerAttachment(image.path, image.mimeType, registry);
		replacements.push({ start: word.start, end: word.end, token });
	}

	return replacements;
}

function registerAttachment(filePath: string, mimeType: ImageMimeType, registry: Registry): string {
	// Previous label included the source filename:
	// const baseName = path.basename(filePath);
	// const displayName = next === 1 ? baseName : `${baseName} (${next})`;
	// Previous short label included a human suffix: `${mimeType} - Image`.
	const baseLabel = mimeType;
	const next = (registry.nameCounts.get(baseLabel) ?? 0) + 1;
	registry.nameCounts.set(baseLabel, next);
	const displayName = next === 1 ? baseLabel : `${baseLabel} (${next})`;
	const token = `${TOKEN_PREFIX}${displayName}`;
	registry.attachments.set(token, { token, path: filePath, mimeType, displayName });
	return token;
}

function parseShellLikeWords(input: string): Array<{ value: string; start: number; end: number }> {
	const words: Array<{ value: string; start: number; end: number }> = [];
	let value = "";
	let start = -1;
	let quote: "'" | '"' | undefined;
	let escaping = false;

	const finish = (end: number) => {
		if (start === -1) return;
		words.push({ value, start, end });
		value = "";
		start = -1;
	};

	for (let i = 0; i < input.length; i++) {
		const char = input[i]!;
		if (start === -1 && !/\s/.test(char)) start = i;

		if (escaping) {
			value += char;
			escaping = false;
			continue;
		}

		if (char === "\\") {
			escaping = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = undefined;
			} else {
				value += char;
			}
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			finish(i);
			continue;
		}

		value += char;
	}

	if (escaping) value += "\\";
	finish(input.length);
	return words.filter((word) => word.value.length > 0);
}

function normalizeCandidatePath(candidate: string, cwd: string): string | undefined {
	let value = candidate.trim();
	if (!value) return undefined;

	if (value.startsWith("file://")) {
		try {
			value = decodeURIComponent(new URL(value).pathname);
		} catch {
			value = value.replace(/^file:\/\//, "");
		}
	}

	if (value.startsWith("~")) {
		value = path.join(homedir(), value.slice(1));
	}

	const resolved = path.isAbsolute(value) ? value : path.resolve(cwd, value);
	return existingPathVariant(resolved);
}

function existingPathVariant(filePath: string): string | undefined {
	const variants = new Set<string>([
		filePath,
		filePath.normalize("NFC"),
		filePath.normalize("NFD"),
		filePath.replace(/ (AM|PM)\./gi, " $1."),
		filePath.replace(/ (AM|PM)\./gi, " $1."),
	]);
	for (const variant of variants) {
		if (existsSync(variant)) return variant;
	}
	return filePath;
}

function detectImagePath(filePath: string): { path: string; mimeType: ImageMimeType } | undefined {
	try {
		const stats = statSync(filePath);
		if (!stats.isFile() || stats.size === 0) return undefined;
		const header = readFileHeader(filePath, 16);
		const mimeType = detectImageMimeType(header) ?? mimeTypeFromExtension(filePath);
		if (!mimeType) return undefined;
		return { path: filePath, mimeType };
	} catch {
		return undefined;
	}
}

function readFileHeader(filePath: string, bytes: number): Buffer {
	const fd = openSync(filePath, "r");
	try {
		const buffer = Buffer.alloc(bytes);
		const count = readSync(fd, buffer, 0, bytes, 0);
		return buffer.subarray(0, count);
	} finally {
		closeSync(fd);
	}
}

function detectImageMimeType(header: Buffer): ImageMimeType | undefined {
	if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return "image/png";
	}
	if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
		return "image/jpeg";
	}
	const ascii = header.toString("ascii");
	if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
	if (header.length >= 12 && ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
	return undefined;
}

function mimeTypeFromExtension(filePath: string): ImageMimeType | undefined {
	const ext = path.extname(filePath).toLowerCase();
	if (!SUPPORTED_EXTENSIONS.has(ext)) return undefined;
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".png") return "image/png";
	if (ext === ".gif") return "image/gif";
	if (ext === ".webp") return "image/webp";
	return undefined;
}

async function readAttachmentImage(attachment: ImageAttachment): Promise<{ type: "image"; mimeType: string; data: string }> {
	const bytes = await readFile(attachment.path);
	let image: { type: "image"; mimeType: string; data: string } = {
		type: "image",
		mimeType: attachment.mimeType,
		data: bytes.toString("base64"),
	};
	const resize = await loadPiResizeImage();
	if (resize) {
		const resized = await resize(image);
		if (resized) {
			image = { type: "image", mimeType: resized.mimeType, data: resized.data };
		}
	}
	return image;
}

async function loadPiResizeImage(): Promise<
	| ((image: { type: "image"; mimeType: string; data: string }) => Promise<{ mimeType: string; data: string } | null>)
	| undefined
> {
	const candidates: string[] = [];

	try {
		const cliPath = realpathSync(process.argv[1] ?? "");
		if (path.basename(cliPath) === "cli.js") {
			candidates.push(path.join(path.dirname(cliPath), "utils", "image-resize.js"));
		}
	} catch {
		// Ignore.
	}

	for (const resizePath of candidates) {
		try {
			if (!existsSync(resizePath)) continue;
			const mod = (await import(pathToFileURL(resizePath).href)) as {
				resizeImage?: (image: { type: "image"; mimeType: string; data: string }) => Promise<{ mimeType: string; data: string } | null>;
			};
			return mod.resizeImage;
		} catch {
			// Try next candidate.
		}
	}

	return undefined;
}

function styleAttachmentTokens(line: string, registry: Registry, styleToken: (token: string) => string): string {
	const tokens = [...registry.attachments.keys()].sort((a, b) => b.length - a.length);
	if (tokens.length === 0) return line;

	let output = "";
	let cursor = 0;
	while (cursor < line.length) {
		const token = tokens.find((candidate) => line.startsWith(candidate, cursor));
		if (token) {
			output += styleToken(token);
			cursor += token.length;
		} else {
			output += line[cursor];
			cursor += 1;
		}
	}
	return output;
}

function replaceAll(text: string, needle: string, replacement: string): string {
	return text.split(needle).join(replacement);
}

function escapeXmlAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
