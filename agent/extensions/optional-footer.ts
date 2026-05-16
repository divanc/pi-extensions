import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";

type KittyEvent = {
	codepoint: number;
	eventType: "press" | "repeat" | "release";
};

// Kitty keyboard protocol private-use codepoints for modifier keys vary a bit by
// terminal/version. Include the known left/right Alt/Option values plus nearby
// modifier-key values so debug/reload can be used to tune if needed.
const DEFAULT_ALT_CODEPOINTS = new Set([57430, 57434, 57443, 57447]);

function isKittyModifierCodepoint(codepoint: number): boolean {
	// Kitty keyboard protocol reports bare modifier keys in the private-use range
	// just after keypad keys. Consume them so Shift/Ctrl/Option presses don't get
	// inserted into the editor as odd glyphs when flag 8 is enabled.
	return codepoint >= 57428 && codepoint <= 57453;
}

function parseAltCodepoints(): Set<number> {
	const raw = process.env.PI_OPTIONAL_FOOTER_ALT_CODEPOINTS;
	if (!raw) return DEFAULT_ALT_CODEPOINTS;
	const values = raw
		.split(",")
		.map((s) => Number.parseInt(s.trim(), 10))
		.filter((n) => Number.isFinite(n));
	return values.length ? new Set(values) : DEFAULT_ALT_CODEPOINTS;
}

function parseKittyCsiU(data: string): KittyEvent | undefined {
	// Kitty CSI-u: ESC [ <codepoint> ... ; <modifier> : <event> u
	// event: 1=press, 2=repeat, 3=release. Modifier-only keys only arrive in
	// terminals that report modifier key events.
	const m = data.match(/^\x1b\[(\d+)(?::\d*)?(?::\d+)?(?:;(\d+))?(?::(\d+))?u$/);
	if (!m) return undefined;
	const codepoint = Number.parseInt(m[1], 10);
	const rawEvent = m[3] ? Number.parseInt(m[3], 10) : 1;
	return {
		codepoint,
		eventType: rawEvent === 3 ? "release" : rawEvent === 2 ? "repeat" : "press",
	};
}

function fmt(n: number): string {
	if (!Number.isFinite(n)) return "0";
	if (Math.abs(n) < 1000) return `${Math.round(n)}`;
	return `${Math.round(n / 1000)}k`;
}

function startMacOSOptionPoller(onChange: (down: boolean) => void): ChildProcessWithoutNullStreams | undefined {
	if (process.platform !== "darwin" || process.env.PI_OPTIONAL_FOOTER_MACOS_POLLER === "0") return undefined;

	const code = `
import CoreGraphics
import Foundation
var last = CGEventSource.flagsState(.combinedSessionState).contains(.maskAlternate)
print(last ? "1" : "0")
fflush(stdout)
while true {
  let flags = CGEventSource.flagsState(.combinedSessionState)
  let down = flags.contains(.maskAlternate)
  if down != last {
    print(down ? "1" : "0")
    fflush(stdout)
    last = down
  }
  usleep(300000)
}
`;

	try {
		const child = spawn("/usr/bin/swift", ["-e", code], { stdio: ["ignore", "pipe", "ignore"] });
		let buffer = "";
		child.stdout.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			let idx: number;
			while ((idx = buffer.indexOf("\n")) !== -1) {
				const line = buffer.slice(0, idx).trim();
				buffer = buffer.slice(idx + 1);
				if (line === "1") onChange(true);
				else if (line === "0") onChange(false);
			}
		});
		return child;
	} catch {
		return undefined;
	}
}

function formatCwd(cwd: string): string {
	const home = homedir();
	if (cwd === home) return "~";
	if (cwd.startsWith(`${home}/`)) return `~/${cwd.slice(home.length + 1)}`;
	return cwd;
}

export default function optionalFooter(pi: ExtensionAPI) {
	const altCodepoints = parseAltCodepoints();
	let optionDown = false;
	let requestRender: (() => void) | undefined;
	let cleanupInput: (() => void) | undefined;
	let pushedKeyboardProtocol = false;
	let macOSPoller: ChildProcessWithoutNullStreams | undefined;

	const setOptionDown = (next: boolean) => {
		if (optionDown === next) return;
		optionDown = next;
		requestRender?.();
	};

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		// Pi enables Kitty keyboard protocol flags 1+2+4. Some terminals only
		// report bare modifier keys when flag 8 is also enabled, so push 1+2+4+8.
		// Pop it on shutdown/reload so terminal state is restored.
		if (!pushedKeyboardProtocol && process.env.PI_OPTIONAL_FOOTER_ENABLE_KITTY_15 !== "0") {
			process.stdout.write("\x1b[>15u");
			pushedKeyboardProtocol = true;
		}

		macOSPoller?.kill();
		macOSPoller = startMacOSOptionPoller(setOptionDown);

		cleanupInput?.();
		cleanupInput = ctx.ui.onTerminalInput((data) => {
			const event = parseKittyCsiU(data);
			if (event && altCodepoints.has(event.codepoint)) {
				setOptionDown(event.eventType !== "release");
			}
			if (event && isKittyModifierCodepoint(event.codepoint)) {
				return { consume: true };
			}
			return undefined;
		});

		ctx.ui.setFooter((tui, theme, _footerData) => {
			requestRender = () => tui.requestRender();

			return {
				dispose: () => {},
				invalidate() {},
				render(width: number): string[] {
					if (!optionDown) return [];

					const context = ctx.getContextUsage();
					const model = ctx.model
						? `${ctx.model.provider}/${ctx.model.id}${context ? ` (${fmt(context.contextWindow)})` : ""}`
						: "no model";
					const contextText = context
						? context.percent == null
							? `${fmt(context.tokens ?? 0)}/${fmt(context.contextWindow)}`
							: `${Math.round(context.percent)}%`
						: "?";

					const left = theme.fg("dim", formatCwd(ctx.cwd));
					const right = theme.fg("dim", `${contextText} · ${model}`);
					const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});

	pi.on("session_shutdown", () => {
		cleanupInput?.();
		cleanupInput = undefined;
		requestRender = undefined;
		macOSPoller?.kill();
		macOSPoller = undefined;
		if (pushedKeyboardProtocol) {
			process.stdout.write("\x1b[<u");
			pushedKeyboardProtocol = false;
		}
	});
}
