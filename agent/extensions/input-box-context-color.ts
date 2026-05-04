import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";

type ExtensionContext = Parameters<Parameters<ExtensionAPI["on"]>[1]>[1];

function colorBorder(ctx: ExtensionContext, fallback: (s: string) => string, s: string): string {
	const usage = ctx.getContextUsage();
	const percent = usage?.percent;
	if (percent == null) return fallback(s);
	if (percent >= 80) return ctx.ui.theme.fg("error", s);
	if (percent >= 50) return `\x1b[38;5;220m${s}\x1b[39m`; // vivid amber
	return fallback(s);
}

class ContextColorEditor extends CustomEditor {
	private readonly ctx: ExtensionContext;
	private readonly fallbackBorderColor: (s: string) => string;

	constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, ctx: ExtensionContext) {
		super(tui, theme, keybindings);
		this.ctx = ctx;
		this.fallbackBorderColor = theme.borderColor;
	}

	override render(width: number): string[] {
		// InteractiveMode copies the default editor's borderColor after construction,
		// so set the dynamic border immediately before render.
		this.borderColor = (s: string) => colorBorder(this.ctx, this.fallbackBorderColor, s);
		return super.render(width);
	}
}

export default function inputBoxContextColor(pi: ExtensionAPI) {
	let requestRender: (() => void) | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;

		ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
			requestRender = () => tui.requestRender();
			return new ContextColorEditor(tui, theme, keybindings, ctx);
		});
	});

	pi.on("message_end", () => requestRender?.());
	pi.on("turn_end", () => requestRender?.());
	pi.on("model_select", () => requestRender?.());

	pi.on("session_shutdown", () => {
		requestRender = undefined;
	});
}
