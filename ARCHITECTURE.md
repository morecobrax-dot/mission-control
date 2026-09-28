# Architecture

How Mission Control fits together: the foundation it was built on, and the
product that sits on the foundation's four seams.

---

## The shape of `index.html`

The whole application is one file with four blocks, in this order:

| Block | Contains |
|---|---|
| `<head>` | Meta, viewport, manifest link. The block between `APP-META-BEGIN/END` is **derived** — written by `config:sync`. |
| One `<style>` | Design tokens, then base, shell, controls, surfaces, overlay presentation, toast, the Mission Control section, responsive. |
| `<body>` markup | The shell (Hub and Settings), and every overlay declared statically. All other DOM is generated. |
| One `<script>` | Config, release notes, storage, migration, overlay engine, toast, confirmation, icons, navigation, the Mission Control domain, settings, boot. |

**Keep it to one substantial `<script>` block.** The test harness evaluates
only the largest one. Code in a second block, or in a linked `.js` file, is
invisible to every contract and the suite will still pass. A contract asserts
this, so you will be told if it slips.

This is what makes a zero-build application fully testable in Node without a
browser, a bundler or a dependency.

## Application identity

`APP_CONFIG` near the top of the script is the single source. Everything else
derives from it:

```
APP_CONFIG.id ──┬── STORAGE_NAMESPACE   `mission-control.`
                ├── CACHE_NAMESPACE     `mission-control-v<version>`
                └── package.json name

APP_UPDATES[0].version ── APP_VERSION ──┬── CACHE_NAMESPACE
                                        └── package.json version

APP_CONFIG.name/shortName/description/themeColor
                └── <head> meta, manifest.webmanifest
```

Static files cannot read a JavaScript object at runtime, so
`npm run config:sync` writes the derived values into them, and
`npm run config:verify` (part of `npm run verify`) fails if they drift.

`APP_ID` is validated, not sanitised. An invalid id fails loudly, because an id
quietly rewritten into something you did not choose is how two products end up
sharing a namespace — and every one of the author's apps on `github.io` shares
one origin.

## Design tokens

Four layers in one `:root`, meant to be edited in order:

1. **Brand** — fonts, accent, and the ground-and-surface ramp.
2. **Semantic** — `--bg`, `--surface`, `--text`, `--success`… Roles, aliased
   onto layer 1. Components reference only these.
3. **Scale** — type, space, radius, shadow, motion, layout, touch, safe-area
   insets, breakpoints. Rarely changed.
4. **Domain** — Mission Control's own colours: the status language
   (`--sig-*`), the field's materials (`--mat-*`, `--field-*`), each
   project's ground and accent (`--terrain-*`, `--tint-*`), and the wide
   layout (`--layout-wide`, `--brief-dock`).

Two contracts keep the system real rather than aspirational: no `font-family`
literal outside layer 1, and no `font-size` outside the type scale. Genuine
exceptions are marked inline with `/* fs-exempt: reason */`. A third keeps the
product from taking over a foundation class name: the product may extend
`.detail-row` or `.notice`, never redefine them.

## The overlay engine

One `MutationObserver` on the body subtree drives everything that must happen
when any surface opens or closes: scroll lock (`position: fixed`, depth
counted), focus (the surface, not its first field), stacking (open order, not
document order), ARIA (`role="dialog"`, `aria-modal`), and Escape through the
surface's own declared close path.

Two presentations share it: `.overlay` is a bottom sheet, `.overlay.overlay-page`
is a full page. Mission Control's surfaces are all pages — the Quick Brief on a
phone, Update state, Tool links, Backup & data, What's new — plus the one
confirmation sheet. They nest (Update state opens over the brief) and the
device back gesture closes the top one.

**To add a surface:** declare a `.overlay` div with an id and a `.sheet` inside
it, give it a `close*()` function, and toggle `.open`. Do not add a lock/unlock
pair.

## Storage

One adapter. Every key is prefixed with `APP_ID` inside the module, so no call
site can write an unnamespaced key.

```
mission-control.sys.schemaVersion      migration state
mission-control.sys.backup.<v>.<key>   pre-migration snapshots
mission-control.ui.lastSeenUpdate      What's new read state
mission-control.ui.selectedProject     the project in focus
mission-control.data.projectStates     the states you recorded — one record per project
mission-control.data.privateLinks      your ChatGPT and Claude links — one record per project
mission-control.draft.projectState     an unsaved state edit
mission-control.draft.projectLinks     an unsaved links edit
```

`set()` returns a real boolean. `getJSON()` returns the fallback on corrupt data
rather than throwing. A missing key reads `null` and is never repaired with a
default. A first launch writes exactly one key, the schema version.

Records carry an `id` (the project's) and an `updatedAt`, so backup import —
which merges any collection of records by id, newest winning — works for both
collections without knowing what they are. A stored record this version
cannot read (an unknown project, an unknown status) is kept aside and written
back untouched; saving a new state for that project replaces it.

## Mission Control — the product model

```
PROJECT_REGISTRY (source, public)          data.projectStates (device)
  id, name, shortDescription,                 status, needsQa, needsDecision,
  repositoryUrl, liveUrl,                     blocker, version, phase,
  defaultBranch, visualTheme                  currentTask, nextAction, updatedAt
            │                                           │
            │         SAMPLE_STATE (source) ◄── used only while no record exists
            ▼                                           ▼
                         projectView(id)  — derived on read, never stored
          attention · signal · workerState · tools · isSample · claudeFallback
                                  │
            hub counts · attention queue · field scene · quick brief
```

- **Identity** is public and never changes at runtime.
- **State** is yours. `status` is the lifecycle (planning, building,
  release ready, stable, paused). What the project needs from you is
  separate: `needsQa`, `needsDecision`, and `blocker` — a project is blocked
  exactly when a blocker is written, so there is no separate flag to
  disagree with it.
- **Attention** is derived: `blocked`, `needs_decision`, `needs_qa`, most
  severe first. The **signal** is the first of those, otherwise the
  lifecycle status; it drives the beacon's colour and the crew's pose
  (`workerState`). **Active** means planning, building or release ready.
- **Sample state** is shown until you record a real one. It has no version
  and no phase, its text says "Example:", and every place that shows it says
  "sample". A project on sample state opens the editor *empty*, so one tap on
  Save can never turn an example into a fact.

`SIGNALS` is the visual language: every status and attention has a word, a
short word, a shape and a crew state, and its hue is a `.sig-*` class onto a
layer-4 token. None of them relies on colour.

## Private links

The ChatGPT and Claude links live only in `data.privateLinks`. One link rule
(`parseToolLink`) guards every destination the app opens, at save time and
again at render time:

- `https` only; a Claude link may also use the app's documented
  `claude://code/…` form (`https://claude.ai/code/…` is the universal-link
  form, and `…/code/new?repo=&branch=` starts a session)
- no username or password inside the link, no token, key, password or
  signature among its parameters
- no whitespace, quotes or angle brackets, and a length cap

The grammar is hand-written so it behaves identically in every browser and
under test. A stored value that no longer passes is treated as not
configured and flagged in its editor. Tools render as real `<a>` links —
`target="_blank" rel="noopener noreferrer"` for the web, a plain link for the
app scheme — and show only the destination's host.

The **Claude fallback** is designed, not active: `claudeFallbackFor(project)`
derives `{ repo, branch }` from the repository URL and `defaultBranch`, which
is everything a future "start a new session" launcher needs. Nothing about it
is stored.

## The project field and its 3D seam

The field is drawn by exactly one renderer, through three calls:

```js
Field.mount(host)    // once
Field.draw(scene)    // whenever anything changes
Field.focus(id)      // bring one project forward
```

`scene` is `fieldScene(views)`: ids, names, themes, statuses, signals,
attention, worker states, the sample flag and the selection — a render-only
description. The renderer never reads storage, never decides a status and
never owns the selection; a contract checks all three.

**Phase 1 ships `IsoField`:** one `<button>` per project containing an inline
isometric SVG platform — a plinth, a terrain layer, the project's landmark,
a status beacon and a placeholder crew. Landmarks are data (`LANDMARKS`): lists
of boxes, cylinders, cones and face discs in platform units, drawn back to
front. The only motion is CSS — the beacon breathes when a project needs you,
a working crew bobs — and the global reduced-motion rule stops both.

**Phase 2 swaps in WebGL** by implementing the same three calls: one
canvas, one scene, a group per project, shared geometry and materials,
`LANDMARKS` rebuilt as meshes, and a button per project kept as the hit and
accessibility layer. Three.js is the intended library, vendored locally for
offline use. Nothing outside the field section changes. Three.js was left
out of Phase 1 on purpose: it adds a large library outside the tested script
block, the harness cannot run WebGL or canvas, and the workflow did not need
it to prove itself first.

## Layout

Mobile first. On a phone the hub is one column and the Quick Brief is a page;
on a phone on its side the field becomes one row of six. At
`(min-width: 900px) and (min-height: 600px)` — `WIDE_QUERY` in the script and
the same media query in the stylesheet, kept equal by a contract — the hub
widens and the brief docks beside the field. Rotating into the wide layout
with a brief page open closes the page; the docked brief shows the same
project.

## PWA

Every path is relative, so the app works from any deployment sub-path. The
service worker is network-first with a cache fallback, precaches only the app
shell, ignores other origins (so an opened ChatGPT or Claude link is never
cached), and on activate deletes only its own older caches.

## Testing

`test/harness.js` reads `index.html` as text, extracts the largest `<script>`
block, and evaluates it in a Node `vm` against a DOM stub and an in-memory
`localStorage`. Top-level `const`/`let` a test needs must be listed in
`BRIDGE`.

Contracts 1–19 defend the foundation; 20–25 defend Mission Control: the
registry (six projects, one shape, nothing private), the status model
(separate, derived, never stored twice), private links (validated, local,
never shown in full), the hub (attention first, one focus, remembered), the
field seam, and secret safety. `npm run verify` also runs the config check,
the residue scan and the secret scan.

The harness cannot see hit-testing, layout or the service worker. Those are
checked in a real browser: real touch, real typing, reloads, offline, reduced
motion and rotation, at phone, iPad and desktop sizes.

## The foundation → domain seam

The foundation reaches the product through exactly four points:

```js
Domain.hydrate   // hydrateMissionControl: states, links, selection
Domain.render    // renderMissionControl: hub and the Settings links list
Domain.wire      // editor drafts, pagehide flush, the layout watcher
Domain.tabIcons  // { home, settings }
```

`boot()` and `renderAll()` call only these. A contract asserts that no
foundation code names anything the product defines; the key table,
`APP_CONFIG` and `APP_UPDATES` are the product's words declared where the
foundation expects them.

## Where to change what

| You are changing | Change it here |
|---|---|
| A project's name, purpose, repository or live URL | `PROJECT_REGISTRY` |
| A project's look | its `visualTheme`, the `--terrain-*`/`--tint-*` tokens, and `LANDMARKS` |
| The status vocabulary | `PROJECT_STATUSES`, `SIGNALS`, and the `--sig-*` tokens |
| What counts as active | `ACTIVE_STATUSES` |
| The link rule | `parseToolLink` — and contract 22 |
| The field's rendering | `IsoField`, behind `Field` |
| A data shape | bump `DATA_SCHEMA_VERSION` and add a migration |
| A release | an `APP_UPDATES` entry, then `npm run config:sync` |
