import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown, visibleWidth } from "@earendil-works/pi-tui";

const ORIGINALS_KEY = Symbol.for("pi.brutalist-markdown.originals");
const RESET = "\x1b[0m";
const WHITE = "\x1b[38;2;255;255;255m";
const BLACK = "\x1b[38;2;0;0;0m";
const BLACK_BG = "\x1b[48;2;0;0;0m";
const CODE_FG = "\x1b[38;2;0;95;110m";
const INLINE_CODE_BG = "\x1b[48;2;232;238;240m";
const MUTED = "\x1b[38;2;120;130;145m";

type MarkdownToken = { type: string; [key: string]: unknown };
type InlineStyleContext = { applyText: (text: string) => string; stylePrefix: string };
type MarkdownInternals = {
	theme: {
		bold(text: string): string;
		italic(text: string): string;
		strikethrough(text: string): string;
		underline(text: string): string;
		link(text: string): string;
		codeBlock(text: string): string;
		highlightCode?(code: string, lang?: string): string[];
	};
	getDefaultInlineStyleContext(): InlineStyleContext;
	renderInlineTokens(tokens: MarkdownToken[], styleContext?: InlineStyleContext): string;
	renderToken(token: MarkdownToken, width: number, nextTokenType?: string, styleContext?: unknown): string[];
	renderList(token: MarkdownToken, depth: number, styleContext?: InlineStyleContext): string[];
	renderListItem(tokens: MarkdownToken[], parentDepth: number, styleContext?: InlineStyleContext): string[];
};

type Originals = Pick<MarkdownInternals, "renderInlineTokens" | "renderToken" | "renderListItem">;
type PatchableMarkdownPrototype = MarkdownInternals & { [ORIGINALS_KEY]?: Originals };

function headingBar(text: string, width: number): string {
	const content = ` ${text.trim()} `;
	const pad = Math.max(0, width - visibleWidth(content));
	return `${BLACK_BG}${WHITE}${content}${" ".repeat(pad)}${RESET}`;
}

function borderLine(left: string, right: string, width: number): string {
	const middleWidth = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
	return `${BLACK}${left}${"─".repeat(middleWidth)}${right}${RESET}`;
}

function boxedCodeLine(text: string, width: number): string {
	const left = `${BLACK}│${RESET} `;
	const right = ` ${BLACK}│${RESET}`;
	const pad = Math.max(0, width - visibleWidth(left) - visibleWidth(text) - visibleWidth(right));
	return `${left}${text}${" ".repeat(pad)}${right}`;
}

function inlineCode(text: string): string {
	return `${INLINE_CODE_BG}${CODE_FG} ${text} ${RESET}`;
}

function tokenText(token: MarkdownToken, key: "raw" | "text" = "text"): string {
	const value = token[key];
	return typeof value === "string" ? value : "";
}

function tokenArray(token: MarkdownToken, key = "tokens"): MarkdownToken[] {
	const value = token[key];
	return Array.isArray(value) ? (value as MarkdownToken[]) : [];
}

function isTaskItem(item: MarkdownToken): boolean {
	if (item.task === true) return true;
	const raw = String(item.raw ?? item.text ?? "").replace(/^\s*[-*+]\s+/, "");
	return /^\s*\[[ xX]\]\s+/.test(raw);
}

function taskDone(item: MarkdownToken): boolean {
	if (item.checked === true) return true;
	const raw = String(item.raw ?? item.text ?? "").replace(/^\s*[-*+]\s+/, "");
	return /^\s*\[[xX]\]\s+/.test(raw);
}

function stripTaskMarker(line: string): string {
	return line.replace(/^\s*\[[ xX]\]\s+/, "");
}

function renderInline(self: MarkdownInternals, tokens: MarkdownToken[], styleContext?: InlineStyleContext): string {
	let result = "";
	const resolvedStyleContext = styleContext ?? self.getDefaultInlineStyleContext();
	const { applyText, stylePrefix } = resolvedStyleContext;
	const applyTextWithNewlines = (text: string) => text.split("\n").map((segment) => applyText(segment)).join("\n");

	for (const token of tokens) {
		switch (token.type) {
			case "text":
				result += tokenArray(token).length > 0 ? renderInline(self, tokenArray(token), resolvedStyleContext) : applyTextWithNewlines(tokenText(token));
				break;
			case "paragraph":
				result += renderInline(self, tokenArray(token), resolvedStyleContext);
				break;
			case "strong":
				result += self.theme.bold(renderInline(self, tokenArray(token), resolvedStyleContext)) + stylePrefix;
				break;
			case "em":
				result += self.theme.italic(renderInline(self, tokenArray(token), resolvedStyleContext)) + stylePrefix;
				break;
			case "codespan":
				result += inlineCode(tokenText(token)) + stylePrefix;
				break;
			case "link": {
				const linkText = renderInline(self, tokenArray(token), resolvedStyleContext);
				result += self.theme.link(self.theme.underline(linkText)) + stylePrefix;
				break;
			}
			case "br":
				result += "\n";
				break;
			case "del":
				result += self.theme.strikethrough(renderInline(self, tokenArray(token), resolvedStyleContext)) + stylePrefix;
				break;
			case "html":
				result += applyTextWithNewlines(tokenText(token, "raw"));
				break;
			default:
				if (token.text) result += applyTextWithNewlines(tokenText(token));
		}
	}

	return result;
}

export default function brutalistMarkdown(_pi: ExtensionAPI) {
	const proto = Markdown.prototype as unknown as PatchableMarkdownPrototype;

	// Keep reloads idempotent: restore methods from the first clean patch point before re-patching.
	if (proto[ORIGINALS_KEY]) {
		proto.renderInlineTokens = proto[ORIGINALS_KEY].renderInlineTokens;
		proto.renderToken = proto[ORIGINALS_KEY].renderToken;
		proto.renderListItem = proto[ORIGINALS_KEY].renderListItem;
	} else {
		proto[ORIGINALS_KEY] = {
			renderInlineTokens: proto.renderInlineTokens,
			renderToken: proto.renderToken,
			renderListItem: proto.renderListItem,
		};
	}

	const originals = proto[ORIGINALS_KEY];

	proto.renderListItem = function patchedRenderListItem(tokens: MarkdownToken[], parentDepth: number, styleContext?: InlineStyleContext) {
		return originals.renderListItem.call(this, tokens, parentDepth, styleContext).map(stripTaskMarker);
	};

	proto.renderInlineTokens = function patchedRenderInlineTokens(tokens: MarkdownToken[], styleContext?: InlineStyleContext) {
		return renderInline(this as MarkdownInternals, tokens, styleContext);
	};

	proto.renderToken = function patchedRenderToken(token: MarkdownToken, width: number, nextTokenType?: string, styleContext?: unknown) {
		if (token.type === "list" && Array.isArray(token.items) && token.items.some(isTaskItem)) {
			const lines: string[] = [];

			for (const item of token.items as MarkdownToken[]) {
				const done = taskDone(item);
				const box = done ? `${BLACK}■${RESET}` : `${BLACK}□${RESET}`;
				const itemLines = this.renderListItem(tokenArray(item), 0, styleContext as InlineStyleContext | undefined);
				const first = stripTaskMarker(itemLines[0] ?? "");
				lines.push(`${box} ${done ? MUTED : ""}${first}${done ? RESET : ""}`);

				for (let i = 1; i < itemLines.length; i++) {
					lines.push(`  ${done ? MUTED : ""}${itemLines[i]}${done ? RESET : ""}`);
				}
			}

			return lines;
		}

		if (token.type === "heading") {
			const level = typeof token.depth === "number" ? token.depth : 1;
			const prefix = level <= 2 ? "" : `${"#".repeat(level)} `;
			const text = `${prefix}${tokenText(token)}`.trim();
			const lines = [headingBar(text, width)];
			if (nextTokenType && nextTokenType !== "space") lines.push(RESET);
			return lines;
		}

		if (token.type === "code") {
			const lang = token.lang ? ` ${String(token.lang)} ` : " code ";
			const title = `${BLACK}┌─${RESET}${MUTED}${lang}${RESET}`;
			const lines = [borderLine(title, "┐", width)];
			const code = tokenText(token);
			const highlighted = this.theme.highlightCode
				? this.theme.highlightCode(code, typeof token.lang === "string" ? token.lang : undefined)
				: code.split("\n").map((line) => this.theme.codeBlock(line));

			for (const line of highlighted) lines.push(boxedCodeLine(line, width));

			lines.push(borderLine("└", "┘", width));
			if (nextTokenType && nextTokenType !== "space") lines.push(RESET);
			return lines;
		}

		return originals.renderToken.call(this, token, width, nextTokenType, styleContext);
	};
}
