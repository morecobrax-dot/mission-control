# Mission Control

A personal command center for software projects. It answers one question
before any other:

> **What needs my attention?**

Then it shows every project at a glance — what it is, where it stands, what
is being worked on, what comes next — and opens the right tool in one tap:
the ChatGPT conversation, the Claude Code session, the GitHub repository or
the live app.

It is built for one person, installed on an iPhone and an iPad as a web app,
and works offline.

---

## What it does

- **Hub.** Quiet counts across the top (projects, active, needs QA, needs a
  decision, blocked), then a *Needs attention* list — blocked first, then
  decisions, then QA — then the project field.
- **Project field.** Every project in the registry — six to start, and a new
  record needs no other change — as isometric platforms, drawn from data.
  Each shows its name, a landmark, its lifecycle status, a beacon lit in its
  signal colour, a floating marker when it needs you, and a small crew whose
  pose follows its state. Tap once to focus a project; tap again (or press
  Enter) for its brief.
- **Quick brief.** Purpose, version, phase, status, current work, next action,
  the blocker if there is one, and when it was last updated — plus the tools
  that are actually set up. On a phone it is a page; on an iPad in landscape
  or a desktop it docks beside the field.
- **Update state.** Record a project's real state on this device. Until you
  do, it has no state: it says **Needs update**, counts as a project, and is
  left out of the active and attention counts. Nothing is ever filled in for
  you.
- **Private tool links.** A ChatGPT conversation link and a Claude Code
  session link per project, kept only on this device.
- The project you focused on is still focused when you come back.

## What is public and what is not

This repository and its GitHub Pages site are **public**.

| Kind | Where it lives | Public? |
|---|---|---|
| Project identity: name, purpose, repository, live URL, look | `PROJECT_REGISTRY` in `index.html` | Yes |
| Project state: status, attention, version, phase, work, next step | `data.projectStates` on your device | No |
| ChatGPT and Claude links | `data.privateLinks` on your device | No |
| The project in focus | `ui.selectedProject` on your device | No |

Private links are never written into source, a test, a log, the offline cache
or a backup file, and the screens show only a link's host, never its path.
`npm run verify` includes a secret scan that fails on anything that looks like
a real conversation or session link, an API key or token, or a local machine
path.

**Backups** carry recorded project states and nothing else. The file is built
from an allowlist of fields, so private links, unsaved edits, device
preferences and recovery snapshots cannot end up in it. Importing a backup
never touches the links on this device; a backup made by 0.1.0 may contain
links, and those are ignored — the import says so.

**The shared origin.** Every app served from `morecobrax-dot.github.io` runs
on the same browser origin, and browser storage belongs to the origin, not to
the app. Mission Control's `mission-control.` prefix keeps its names apart from
the other apps' — it does not keep them out. Any script running on that
origin can read what Mission Control stores, private links included. Prefer
ChatGPT conversation links, which need your sign-in to open, over public share
links. A separate origin (a custom domain) is the only real isolation; this
release does not change hosting.

## What has not been verified

- **Opening the ChatGPT or Claude app.** Tools are ordinary links. Whether
  iOS hands one to the ChatGPT or Claude app, or opens it in Safari, is
  decided by iOS and has not been tested on a device; browser tests only show
  that the link opens in a new context.
- **Storage on iPhone and iPad.** Whether a Safari tab and the Home Screen
  app see the same storage, and how long iOS keeps it, has not been checked
  on this app. Treat each as possibly separate, and export a backup of your
  states if they matter.

## The status model

A project has a **lifecycle status** — planning, building, release ready,
stable or paused — and, separately, **what it needs from you**: QA, a decision,
or nothing. It is **blocked** exactly when a blocker is written down, so the
flag and its reason can never disagree. The headline signal is the most
severe thing it needs, otherwise its lifecycle. Every signal has a word and a
shape as well as a colour.

## Run it

```bash
npx --yes http-server -a 127.0.0.1 -p 8398 -c-1 .
```

Then open `http://127.0.0.1:8398`. A service worker needs `http(s)`, so
opening the file directly works but will not exercise offline behaviour.

## Verify it

```bash
npm run verify
```

That is the one command to remember: the contract suite, the check that the
static PWA files still match `APP_CONFIG`, the domain-residue scan and the
secret scan. Run it before every commit and every deploy.

```bash
npm test              # contracts only
npm run config:verify # identity drift only
npm run contamination # residue scan only
npm run secrets       # private links, keys, tokens, local paths
npm run config:sync   # write derived values into the static files
```

## Where things are

```
index.html              the whole app: tokens, shell, engine, Mission Control
sw.js                   offline shell; cache name derived from APP_CONFIG
manifest.webmanifest    install metadata, derived from APP_CONFIG
icon-192/512.png        app icons
scripts/config.js       sync / verify static files against APP_CONFIG
scripts/contamination.js domain-residue guard
scripts/secrets.js      private-link and credential guard
test/harness.js         loads the app into a Node vm with a DOM stub
test/contracts.js       the contract suite
test/run.js             the runner
```

## The rest of the documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit, the product model,
  and the seam a 3D field will plug into.
- [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the UX and visual rules, including
  Mission Control's own.
- [CLAUDE.md](CLAUDE.md) — development method for AI coding sessions.

Mission Control was built from the author's `app-starter` template. It owns
its code: there is no dependency on the template and nothing is shared back.
