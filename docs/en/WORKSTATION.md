> **Language:** English · [Deutsch](../de/WORKSTATION.md)

# Workstation Setup for AI Assistants

This guide explains step by step what the `workstation/` folder does and how to set it up. You need very little background: you should be able to open a terminal and paste a command into it.

## What is this about?

AI assistants such as Claude Code, Codex, GitHub Copilot or Google Antigravity work on your computer with your files. This setup gives them the same two helpers on every computer:

1. **Privacy shield:** It makes sure passwords, access keys and bank details don't end up with the AI.
2. **MCP detection:** It notices from your question which add-on tool would fit, and suggests it.

Everything runs on your computer. You need no API keys, and your subscription logins are never routed through third-party services.

## Terms in a nutshell

| Term | Meaning |
| --- | --- |
| Terminal | The window where you type commands (Linux: "Terminal", Mac: "Terminal" under Applications › Utilities). |
| Hook | A small program the AI assistant starts automatically, for example before it reads a file. The hook can then say "yes", "no" or "ask first". |
| MCP server | An add-on tool for the AI, such as a remote-controlled browser or a documentation search. MCP stands for "Model Context Protocol". |
| Prompt | Your message to the AI. |
| `.env` file | A file where programs often store passwords and keys. |

## Setting it up

### Requirements

You need `git`, `node` (Node.js) and at least one of the AI assistants. You can check this in the terminal:

```bash
git --version
node --version
```

If something is missing, install it like this:

- **Linux (Debian/Ubuntu):** `sudo apt install git nodejs`
- **Mac:** first set up [Homebrew](https://brew.sh), then `brew install git node`

### Installation

Paste these commands into the terminal, one after the other:

```bash
git clone git@github.com:gb-web-de/ai_tools.git ~/Projekte/ai_tools
~/Projekte/ai_tools/workstation/install.sh
```

If you already have the folder, run `git pull` inside `~/Projekte/ai_tools` to get the latest version, then run `install.sh` again. This is safe: the script only changes its own entries, and every settings file keeps a backup ending in `.bak-ai_tools`.

Finally, restart your AI assistant. Only then does it load the hooks.

### Checking that it works

In Claude Code or Codex, write a prompt such as `my password: test123456`. The shield stops it and explains why. The prompt was not sent to the AI.

## What happens in the background?

### The privacy shield

- **On your prompt:** If it contains a password, an access key (API key, token), a private key, an IBAN or a credit card number, it is not sent. IBANs and card numbers are recognised by their check digit, so ordinary numbers don't get in the way.
- **On files:** The AI may not read `.env` files, SSH keys (`~/.ssh`) or the login files of the AI programs.
- **On commands:** If the AI wants to run a command or change a file that touches such data, it asks you first.

If you know a prompt is harmless, add `#shield-ok` to it. Then it goes through.

### The MCP detection

If you ask, for example, "Check the accessibility of the page", the hook recognises fitting tools. If one is already set up, it tells the AI to use it. If one is missing, the AI suggests it to you with the ready-made command. It is only set up once you agree.

Which tools exist and which words they match is listed in `workstation/mcp-catalog.json`.

## Which assistant can do what?

| Assistant | Prompt shield and MCP tips | File and command shield | Rules |
| --- | --- | --- | --- |
| Claude Code (terminal, PhpStorm) | yes | yes | – |
| Codex (terminal, PhpStorm, ChatGPT app) | yes | yes | `~/.codex/AGENTS.md` |
| GitHub Copilot CLI | no, Copilot ignores prompt hooks | yes | `~/.copilot/copilot-instructions.md` |
| Google Antigravity (`agy`, app, IDE) | no, Antigravity has no prompt hook | no, see below | as a plugin |

"Rules" is a short text file (`workstation/AGENTS.md`) that the assistant reads at every start. It repeats the privacy rules in words, so they also apply where a hook is missing.

Antigravity deliberately gets no file hook. An Antigravity hook has to answer "allow", "block" or "ask" for every command; there is no "no opinion". Otherwise Antigravity blocks everything, including ordinary files and scripts. Only the rules apply there.

ChatGPT in the browser or the phone app cannot reach your computer. If you want to use ChatGPT with these rules, use Codex with the same account.

## Common tasks

| You want to … | Command |
| --- | --- |
| set up an MCP tool for all assistants | `~/.claude/ai_tools/install.sh --mcp playwright` |
| set it up for just one | `~/.claude/ai_tools/install.sh --mcp playwright --agent codex` |
| install all extra skills | `~/.claude/ai_tools/install.sh --extras` |
| install a single skill | `~/.claude/ai_tools/install.sh --extra ponytail` |
| remove everything again | `~/.claude/ai_tools/install.sh --uninstall` |

The extra skills are `context-mode` (keeps large outputs out of the conversation), `ponytail` (as little code as possible), `agent-skills` (work steps from planning to shipping) and `unlazy` (finish results with proof).

## Settings

Your personal settings live in `~/.config/ai-tools/workstation.json`, not in the repository:

| Setting | Values | Effect |
| --- | --- | --- |
| `mcp.mode` | `suggest` (default), `auto`, `off` | `auto` sets up local tools that need no login by itself; they apply from the next session. |
| `shield.mode` | `block` (default), `warn`, `off` | `warn` lets things through but warns, and asks before file access. |
| `shield.allowPaths` | list of paths | The shield always allows these paths. |

## Devices

### PhpStorm

The AI plugins in PhpStorm start the same programs as the terminal, so hooks and tools apply there automatically. PhpStorm can also be an MCP tool itself: Settings › Tools › MCP Server › Enable, then click "Auto-Configure" for the assistant you want.

### Mac

On the Mac, run the same two installation commands as above. After that it behaves like the Linux computer.

### Android phone

No hooks run on the phone. What counts there is what belongs to your claude.ai account: uploaded skills, connectors and projects. If you use Remote Control from the phone to drive a session on your computer, the computer's shield also covers what you type on the phone.

## When something doesn't work

- **Nothing happens:** Close the assistant completely and start it again. Hooks are only loaded at startup.
- **Codex asks whether to trust the hooks:** That is normal and happens once. Confirm with yes.
- **"node is missing":** Install Node.js (see Requirements).
- **A harmless prompt is blocked:** Add `#shield-ok`. If that happens often, set `shield.mode` to `warn`.
- **The hooks break after switching branches:** The hooks run straight from the `ai_tools` folder. Switch back to a branch there that contains the full `workstation/` folder.

## Deliberately left out

OmniRoute is not included. It routes your subscription logins through its own intermediary service and presents itself to the providers as Claude Code. That breaks the rule of using subscriptions only through the official programs.
