import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, parseKey, truncateToWidth } from "@earendil-works/pi-tui";

type DetectedChoice = {
	index: number;
	label: string;
	manual?: boolean;
};

const ACCENT_RED = (s: string) => `\x1b[31m${s}\x1b[39m`;
const NUMBERED_CHOICE_RE = /^\s*(?:[-*]\s*)?([1-9])\s*[.)\]:-]\s+(.+?)\s*$/;
const ANY_NUMBERED_LINE_RE = /^\s*(?:[-*]\s*)?(\d+)\s*[.)\]:-]\s+/;

function assistantText(message: unknown): string | null {
	const msg = message as { role?: string; content?: Array<{ type: string; text?: string }>; stopReason?: string };
	if (msg.role !== "assistant") return null;
	if (msg.stopReason && msg.stopReason !== "stop") return null;

	const parts = msg.content?.filter((c) => c.type === "text" && typeof c.text === "string").map((c) => c.text!) ?? [];
	return parts.length ? parts.join("\n") : null;
}

function detectNumberedChoices(text: string): DetectedChoice[] | null {
	const choices: DetectedChoice[] = [];

	for (const line of text.split("\n")) {
		const numberedLine = line.match(ANY_NUMBERED_LINE_RE);
		if (!numberedLine) continue;

		const lineIndex = Number(numberedLine[1]);
		if (lineIndex === 0) continue; // Assistant may already include "0. Other"; the overlay adds its own manual option.
		if (lineIndex > 9) return null; // Avoid partially handling lists with 10+ items.

		const match = line.match(NUMBERED_CHOICE_RE);
		if (!match) return null;

		const index = Number(match[1]);
		const label = match[2].trim();
		if (!label) return null;
		choices.push({ index, label });
	}

	if (choices.length < 2) return null;
	if (choices[0].index !== 1) return null;

	for (let i = 0; i < choices.length; i++) {
		if (choices[i].index !== i + 1) return null;
	}

	return choices;
}

function digitFromInput(data: string): number | null {
	const key = parseKey(data);
	if (key?.match(/^[0-9]$/)) return Number(key);

	// Fallback for plain terminals where printable digits arrive as raw characters.
	if (data.length === 1 && data >= "0" && data <= "9") return Number(data);

	return null;
}

export default function qnaNumber(pi: ExtensionAPI) {
	pi.registerCommand("qna-number", {
		description: "Show current status for numbered-answer helper",
		handler: async (_args, ctx) => {
			ctx.ui.notify("qna-number is active: press 1-9 to answer, 0 to type manually, or Esc to dismiss.", "info");
		},
	});

	pi.on("message_end", async (event, ctx) => {
		if (!ctx.hasUI) return;

		const text = assistantText(event.message);
		if (!text) return;

		const choices = detectNumberedChoices(text);
		if (!choices) return;

		const selected = await ctx.ui.custom<DetectedChoice | null>((tui, theme, _kb, done) => {
			let cachedLines: string[] | undefined;

			function finishByDigit(raw: string) {
				const digit = digitFromInput(raw);
				if (digit === null) return;

				if (digit === 0) {
					done({ index: 0, label: "Other / manual answer", manual: true });
					return;
				}

				const choice = choices.find((c) => c.index === digit);
				if (choice) done(choice);
			}

			return {
				render(width: number) {
					if (cachedLines) return cachedLines;

					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					add(`${ACCENT_RED("╭─")} ${theme.fg("text", "Choose a reply")}`);
					add(ACCENT_RED("│"));
					for (const choice of choices) {
						add(`${ACCENT_RED("│")}  ${ACCENT_RED(String(choice.index))}  ${theme.fg("text", choice.label)}`);
					}
					add(`${ACCENT_RED("│")}  ${ACCENT_RED("0")}  ${theme.fg("muted", "Write my own…")}`);
					add(ACCENT_RED("│"));
					add(`${ACCENT_RED("╰─")} ${theme.fg("dim", `Press 1–${choices.length} to send • 0 to type • Esc to dismiss`)}`);

					cachedLines = lines;
					return lines;
				},
				invalidate() {
					cachedLines = undefined;
				},
				handleInput(data: string) {
					if (matchesKey(data, Key.escape)) {
						done(null);
						return;
					}
					finishByDigit(data);
				},
			};
		});

		if (!selected) return;

		if (selected.manual) {
			ctx.ui.setEditorText("");
			ctx.ui.notify("Manual answer selected. Type your response and submit.", "info");
			return;
		}

		pi.sendUserMessage(String(selected.index), { deliverAs: "followUp" });
	});
}
