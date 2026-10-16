> **Sprache:** Deutsch · [English](../en/WORKSTATION.md)

# Arbeitsplatz-Setup für KI-Assistenten

Diese Anleitung erklärt Schritt für Schritt, was der Ordner `workstation/` macht und wie du ihn einrichtest. Vorwissen brauchst du kaum: Du solltest ein Terminal öffnen und einen Befehl hineinkopieren können.

## Worum geht es?

KI-Assistenten wie Claude Code, Codex, GitHub Copilot oder Google Antigravity arbeiten auf deinem Rechner mit deinen Dateien. Das Setup gibt ihnen auf jedem Rechner dieselben zwei Helfer mit:

1. **Datenschutzschild:** Er passt auf, dass Passwörter, Zugangsschlüssel und Bankdaten nicht bei der KI landen.
2. **MCP-Erkennung:** Sie merkt an deiner Frage, welches Zusatzwerkzeug passen würde, und schlägt es vor.

Alles läuft auf deinem Rechner. Du brauchst keine API-Keys, und deine Abo-Zugänge werden nicht über fremde Dienste geleitet.

## Begriffe kurz erklärt

| Begriff | Bedeutung |
| --- | --- |
| Terminal | Das Fenster, in das du Befehle tippst (Linux: „Terminal“, Mac: „Terminal“ unter Programme › Dienstprogramme). |
| Hook | Ein kleines Programm, das der KI-Assistent automatisch startet, zum Beispiel bevor er eine Datei liest. Der Hook darf dann „ja“, „nein“ oder „erst fragen“ sagen. |
| MCP-Server | Ein Zusatzwerkzeug für die KI, etwa ein ferngesteuerter Browser oder eine Doku-Suche. MCP steht für „Model Context Protocol“. |
| Prompt | Deine Nachricht an die KI. |
| `.env`-Datei | Eine Datei, in der Programme oft Passwörter und Schlüssel speichern. |

## Einrichten

### Voraussetzungen

Du brauchst `git`, `node` (Node.js) und mindestens einen der KI-Assistenten. Prüfen kannst du das im Terminal:

```bash
git --version
node --version
```

Fehlt etwas, installierst du es so:

- **Linux (Debian/Ubuntu):** `sudo apt install git nodejs`
- **Mac:** zuerst [Homebrew](https://brew.sh) einrichten, dann `brew install git node`

### Installation

Kopiere diese Befehle nacheinander ins Terminal:

```bash
git clone git@github.com:gb-web-de/ai_tools.git ~/Projekte/ai_tools
~/Projekte/ai_tools/workstation/install.sh
```

Hast du den Ordner schon, holst du mit `git pull` im Ordner `~/Projekte/ai_tools` den neuesten Stand und startest danach `install.sh` noch einmal. Das ist gefahrlos: Das Skript ändert nur seine eigenen Einträge, und von jeder Einstellungsdatei bleibt eine Sicherung mit der Endung `.bak-ai_tools` liegen.

Zum Schluss startest du deinen KI-Assistenten neu. Erst dann lädt er die Hooks.

### Prüfen, ob es läuft

Schreib in Claude Code oder Codex einen Prompt wie `mein passwort: test123456`. Der Schild hält ihn an und erklärt, warum. Er wurde dann nicht an die KI geschickt.

## Was passiert im Hintergrund?

### Der Datenschutzschild

- **Bei deinem Prompt:** Enthält er ein Passwort, einen Zugangsschlüssel (API-Key, Token), einen privaten Schlüssel, eine IBAN oder eine Kreditkartennummer, wird er nicht gesendet. IBAN und Kartennummer werden über ihre Prüfziffer erkannt, damit normale Zahlen nicht stören.
- **Bei Dateien:** Die KI darf `.env`-Dateien, SSH-Schlüssel (`~/.ssh`) und die Login-Dateien der KI-Programme nicht lesen.
- **Bei Befehlen:** Will die KI einen Befehl ausführen oder eine Datei ändern, die solche Daten berührt, fragt sie dich vorher.

Weißt du, dass ein Prompt harmlos ist, hängst du `#shield-ok` an. Dann geht er durch.

### Die MCP-Erkennung

Fragst du zum Beispiel „Prüf die Barrierefreiheit der Seite“, erkennt der Hook passende Werkzeuge. Ist eins schon eingerichtet, sagt er der KI, dass sie es nutzen soll. Fehlt eins, schlägt die KI es dir mit dem fertigen Befehl vor. Eingerichtet wird es erst, wenn du zustimmst.

Welche Werkzeuge es gibt und bei welchen Wörtern sie passen, steht in `workstation/mcp-catalog.json`.

## Welcher Assistent kann was?

| Assistent | Prompt-Schild und MCP-Tipps | Datei- und Befehls-Schild | Regeln |
| --- | --- | --- | --- |
| Claude Code (Terminal, PhpStorm) | ja | ja | – |
| Codex (Terminal, PhpStorm, ChatGPT-App) | ja | ja | `~/.codex/AGENTS.md` |
| GitHub Copilot CLI | nein, Copilot ignoriert Prompt-Hooks | ja | `~/.copilot/copilot-instructions.md` |
| Google Antigravity (`agy`, App, IDE) | nein, Antigravity hat keinen Prompt-Hook | nein, siehe unten | als Plugin |

„Regeln“ ist eine kurze Textdatei (`workstation/AGENTS.md`), die der Assistent bei jedem Start liest. Sie wiederholt die Datenschutz-Regeln in Worten, damit sie auch dort gelten, wo ein Hook fehlt.

Antigravity bekommt bewusst keinen Datei-Hook. Ein Antigravity-Hook muss zu jedem Befehl „erlauben“, „sperren“ oder „fragen“ sagen, ein „mir egal“ gibt es nicht. Sonst sperrt Antigravity alles, auch normale Dateien und Skripte. Dort gelten deshalb nur die Regeln.

ChatGPT im Browser oder in der Handy-App kommt an deinen Rechner nicht heran. Willst du ChatGPT mit diesen Regeln nutzen, nimm Codex mit demselben Konto.

## Häufige Aufgaben

| Du möchtest … | Befehl |
| --- | --- |
| ein MCP-Werkzeug bei allen Assistenten einrichten | `~/.claude/ai_tools/install.sh --mcp playwright` |
| es nur bei einem einrichten | `~/.claude/ai_tools/install.sh --mcp playwright --agent codex` |
| alle Zusatz-Skills installieren | `~/.claude/ai_tools/install.sh --extras` |
| einen einzelnen Skill installieren | `~/.claude/ai_tools/install.sh --extra ponytail` |
| alles wieder entfernen | `~/.claude/ai_tools/install.sh --uninstall` |

Zusatz-Skills sind `context-mode` (hält große Ausgaben aus dem Gespräch heraus), `ponytail` (möglichst wenig Code), `agent-skills` (Arbeitsschritte von der Planung bis zur Auslieferung) und `unlazy` (Ergebnisse mit Nachweis abschließen).

## Einstellungen

Deine persönlichen Einstellungen liegen in `~/.config/ai-tools/workstation.json`, nicht im Repository:

| Einstellung | Werte | Wirkung |
| --- | --- | --- |
| `mcp.mode` | `suggest` (Standard), `auto`, `off` | `auto` richtet lokale Werkzeuge ohne Zugangsdaten selbst ein; sie gelten ab der nächsten Sitzung. |
| `shield.mode` | `block` (Standard), `warn`, `off` | `warn` lässt durch, warnt aber und fragt bei Dateien nach. |
| `shield.allowPaths` | Liste von Pfaden | Diese Pfade lässt der Schild immer zu. |

## Geräte

### PhpStorm

Die KI-Plugins in PhpStorm starten dieselben Programme wie das Terminal. Hooks und Werkzeuge gelten dort also automatisch. PhpStorm kann außerdem selbst ein MCP-Werkzeug sein: Einstellungen › Tools › MCP Server › Enable, danach beim gewünschten Assistenten auf „Auto-Configure“ klicken.

### Mac

Auf dem Mac führst du dieselben zwei Installationsbefehle aus wie oben. Danach verhält er sich wie der Linux-Rechner.

### Android-Handy

Auf dem Handy laufen keine Hooks. Dort gilt, was an deinem claude.ai-Konto hängt: hochgeladene Skills, Connectors und Projekte. Steuerst du vom Handy aus per Remote Control eine Sitzung auf deinem Rechner, gilt der Schild des Rechners auch für das, was du am Handy tippst.

## Wenn etwas nicht klappt

- **Nichts passiert:** Den Assistenten ganz schließen und neu starten. Hooks werden nur beim Start geladen.
- **Codex fragt, ob er den Hooks vertrauen soll:** Das ist normal und passiert einmal. Mit Ja bestätigen.
- **„node fehlt“:** Node.js installieren (siehe Voraussetzungen).
- **Ein harmloser Prompt wird blockiert:** `#shield-ok` anhängen. Passiert das oft, kannst du `shield.mode` auf `warn` stellen.
- **Die Hooks brechen nach einem Branch-Wechsel:** Die Hooks laufen direkt aus dem Ordner `ai_tools`. Wechsle dort zurück auf einen Branch, der `workstation/` vollständig enthält.

## Bewusst nicht dabei

OmniRoute ist nicht enthalten. Es leitet die Logins deiner Abos über einen eigenen Zwischendienst und gibt sich gegenüber den Anbietern als Claude Code aus. Das widerspricht der Regel, Abos nur über die offiziellen Programme zu nutzen.
