# pi extensions

Small, sharp extensions for [pi](https://github.com/mariozechner/pi-coding-agent) that make the terminal UI more informative without making it busier.

If you live in long-running agent sessions, these extensions help you see what matters at the right moment: context pressure, current model, working directory, and session metadata — all with minimal visual noise.

## What’s included

### `input-box-context-color`

A context-aware editor border for pi.

As your conversation approaches the model’s context limit, the input box border changes color:

- normal border when there is plenty of room
- amber around 50% context usage
- error color around 80% context usage

Why it’s useful: you get an ambient warning before a session becomes too large, without adding another status line or widget.

### `optional-footer`

A hidden-on-demand footer for pi.

Hold Option/Alt to reveal session details:

- current working directory
- current context usage
- active provider/model
- model context window, when available

Why it’s useful: the interface stays clean while important metadata remains one keypress away.

On macOS, the extension can run a tiny Swift-based Option-key poller so bare modifier presses work even in terminals that do not report them reliably.

## Install

pi auto-discovers extensions from `~/.pi/agent/extensions/*.ts`.

Clone this repo as your pi config:

```bash
git clone git@github.com:divanc/pi-extensions.git ~/.pi
```

Or copy only the extensions:

```bash
mkdir -p ~/.pi/agent/extensions
cp agent/extensions/*.ts ~/.pi/agent/extensions/
```

Then start pi, or reload an existing session:

```text
/reload
```

## Configuration

`optional-footer` supports a few environment variables for terminal compatibility:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PI_OPTIONAL_FOOTER_ENABLE_KITTY_15=0` | enabled | Do not push Kitty keyboard protocol flag `15` |
| `PI_OPTIONAL_FOOTER_MACOS_POLLER=0` | enabled on macOS | Disable the Swift Option-key poller |
| `PI_OPTIONAL_FOOTER_ALT_CODEPOINTS=57430,57434` | built-in set | Override recognized Alt/Option modifier codepoints |

Most users should not need these.

## Safety

pi extensions run as local TypeScript with your user permissions. Read the source before installing any extension from the internet.
