# Architecture

How Mission Control fits together: the foundation it was built on, and the
product that sits on the foundation's six seams.

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
mission-control.data.stateSources      which record each project shows: 'manual' or 'repository'
mission-control.cache.repoStatus       each repository's last valid status, where and when it was
                                       fetched, and how the last check went
mission-control.draft.projectState     an unsaved state edit
mission-control.draft.projectLinks     an unsaved links edit
```

`set()` returns a real boolean. `getJSON()` returns the fallback on corrupt data
rather than throwing. A missing key reads `null` and is never repaired with a
default. A first launch writes the schema version; once the repositories have
answered it adds `cache.repoStatus`, and `data.stateSources` for each project
that adopted a published status. Nothing is invented: no manual record is
ever written for you.

Records carry an `id` (the project's) and an `updatedAt`. A stored record this
version cannot read (an unknown project, an unknown status) is kept aside and
written back untouched; saving a new state for that project replaces it.
Keeping it is lossless storage — it is never exported (see *Backups*).

**The prefix is a name, not a wall.** Browser storage belongs to the origin,
and every app served from `morecobrax-dot.github.io` shares that origin. The
`mission-control.` prefix keeps Mission Control's keys from colliding with
another app's; it does not stop any script on that origin from reading them.

## Backups

Export is an allowlist by construction. The foundation builds the file from
`Domain.backupData()` when the product declares it; Mission Control's
(`backupMissionControl`) returns one key, `data.projectStates`, holding the
readable records of registry projects, each rebuilt field by field from
`BACKUP_FIELDS`. Nothing else can reach the file: not `data.privateLinks`, not
the editor drafts, not `ui.*` preferences, not `sys.backup.*` recovery
snapshots, not unreadable records, not any field a record carries beyond
the allowlist — and not `data.stateSources` or `cache.repoStatus`: which record
a project shows is this device's choice, and a published status is public and
fetched fresh by every device, so a copy in a file could only be older.

Import mirrors it. `Domain.restoreData()` (`restoreMissionControl`) accepts
only `data.projectStates`, rebuilds each incoming record from the same
allowlist, and merges by id with the newer `updatedAt` winning. Anything else
in the file is ignored — a source choice or a repository status in a file is
never taken. Private links or link drafts in a backup made by 0.1.0 are never
restored, merged or used to delete the links on this device; the import
reports it in a note on the Backup page, reports records it could not read,
and names any project whose imported state is kept behind its repository's
status. Without the two hooks the foundation falls back to its generic
behaviour: every key except recovery snapshots out, every collection of
records merged back in.

## Mission Control — the product model

```
PROJECT_REGISTRY (source, public)     data.projectStates (device)      cache.repoStatus (device)
  id, name, shortDescription,           the state you recorded:          the last valid PROJECT-STATUS.json
  repositoryUrl, liveUrl,               status, needsQa, needsDecision,  of a public repository — the same
  defaultBranch, visualTheme,           blocker, version, phase,         record shape — plus sourceUrl,
  publicRepo                            currentTask, nextAction,         fetchedAt, checkedAt, outcome
            │                           updatedAt                                  │
            │                                     └──── sourceOf(id) ─────────────┘
            │                                     (data.stateSources, device: exactly one)
            ▼                                                 ▼
                     projectView(id) — the effective state, derived on read, never stored
        recorded · attention · signal · workerState · source · repo · tools · theme
                                  │
            hub counts · attention · field scene · quick brief
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
- **No record is no state.** A project nobody has recorded has
  `recorded: false`, a `null` status, no attention and the signal
  `unrecorded`, shown as **Needs update**. It counts toward Projects and toward
  nothing else — not Active, QA, Decision or Blocked — and the hub says how
  many projects need an update. While any state is unknown the attention area
  says "No recorded attention items"; "Nothing needs you right now" appears
  only when every state is recorded and none asks for you. Its editor opens
  empty with no status chosen. (0.1.0 showed invented example states instead;
  they were only ever computed, never stored, so there was nothing to migrate.)
- **Any number of projects.** The six required projects come first in the
  registry; nothing assumes six is the maximum. A record whose `visualTheme`
  has no landmark yet is drawn in the `generic` look (`themeOf`).

`SIGNALS` is the visual language: every status, every attention and
`unrecorded` has a word, a short word, a shape and a crew state, and its hue is
a `.sig-*` class onto a layer-4 token. None of them relies on colour.

## Connected status

A public repository may publish its project's state as `PROJECT-STATUS.json`
on its default branch. Everything below lives in the product section of the
script; the foundation knows nothing of it.

**The contract** (`STATUS_KEYS`, `validateStatusFile`). Schema 1, every key
present: `schemaVersion`, `appId`, `version`, `phase`, `status`, `needsQa`,
`needsDecision`, `currentTask`, `nextAction`, `blocker`, `updatedAt`. The
words and limits are the editor's (`PROJECT_STATUSES`, `STATE_LIMITS`), so a
repository cannot say anything the app could not show; blocked is still
derived from `blocker`. `appId` must be the registry id the address was built
from. Text is plain: control characters and direction overrides are refused,
whitespace collapses, and everything is escaped when drawn. `updatedAt` must be
ISO 8601 with a zone and no more than a day ahead of this device's clock. The
answer is capped at 8 KB. A file that breaks any rule is refused whole with its
reason; a newer `schemaVersion` is `unsupported`, never half-read. A valid file
is rebuilt field by field into exactly the record a state saved here is.

**The address** (`statusUrlFor`) is derived from the registry alone —
`repositoryUrl` and `defaultBranch` — and only for `publicRepo: true`:
`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/PROJECT-STATUS.json`.
GitHub's raw host answers any origin (`Access-Control-Allow-Origin: *`, on a
404 too), caches for 300 seconds and revalidates by ETag. The request carries
nothing: `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, no headers,
no token. A private repository is never asked. It is another origin, so the
service worker leaves it alone and a status never enters the shell cache.

**Ownership** (`sourceOf`, `effectiveState`). A project shows exactly one
record: your choice in `data.stateSources` if you made one; otherwise your
manual record if there is one; otherwise its repository snapshot. The
snapshot of a project nobody had recorded is adopted when it arrives, and the
choice is saved then, so importing a manual record later cannot flip it. A
project with a manual record switches only when you choose *Use repository
updates*; *Use my own state instead* switches back. Neither deletes the other
record. A connected project has no editor — editing it would be a hidden
override — saving in the editor chooses your own state, and clearing it shows
*Needs update* rather than letting the repository take its place.

**Checking** (`refreshStatuses`, `checkProject`, `settleCheck`). Asked on open
(after the first render), on return to the foreground, and by Refresh — each
project only when due: `STATUS_FRESH_MS` (15 minutes) after an answer,
`STATUS_RETRY_MS` (1 minute) after a failure that may pass, and
`STATUS_BACKOFF_MS` (1 hour) after a 403 or 429, which Refresh honours too.
One request per project in flight; asking again joins it. `STATUS_TIMEOUT_MS`
(8 seconds) ends a request that never answers. Offline, nothing is sent. No
timer polls. Every way a check ends is a named outcome — `ok`, `older`,
`missing`, `offline`, `unreachable`, `timeout`, `http`, `rate-limited`,
`invalid`, `unsupported`, `wrong-app`, `too-large` — said in words in the
brief. Only `ok` replaces the snapshot, and only with one that is not older
than the snapshot kept.

**Two times.** `snapshot.updatedAt` is when the publisher wrote the status;
`fetchedAt` is when this device last received a valid copy; `checkedAt` is
when it last asked. The screen says "updated" only of the first, so asking
again never makes old news look new.

**Publishers' gate** (`scripts/project-status.js`). One checker, kept here and
copied byte for byte into every publishing repository (contract 1, checker
revision 1 — its git blob is the same in all of them). Each publisher's
`npm run verify` runs it first. It fails, with the reason and the fix, when the
file breaks the contract above, names another project, carries a key beyond
it or anything matching `scripts/secrets.js`, or when `version` is not that
repository's release version. It only reads. Contract 27 holds it to this
reader: the same constants, the same refused characters across every code
point, the same secret rules, and 26 shared cases that both sides must read
alike — nothing a publisher may publish is refused here. Where a repository
declares its release version lives in its own `package.json`
(`"projectStatus": { appId, version: { file, list, pick, prefix } }`).

**What `version` means.** The publisher's canonical release version on the
same commit (the newest release-notes entry), and nothing more. It changes in
the commit that changes the release version and at no other time. An equal
version never means deployed, QA passed or stable: production verification
belongs to each project's release workflow, and the other fields say what
its author declares. The gate cannot see whether those words are still true
or whether unpublished work exists; each project's instructions make the
review part of completing a milestone, and its paste-back report must say
"Mission Control status reviewed and published". The gate runs locally — no
publisher has CI — so nothing enforces it on GitHub.

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

## The project field: one renderer behind one seam

The field is drawn by exactly one renderer at a time, through four calls:

```js
Field.mount(host)    // once
Field.draw(scene)    // whenever anything changes
Field.focus(id)      // put keyboard focus on one project
Field.unmount()      // hand the host to another renderer
```

`scene` is `fieldScene(views)`: ids, names, themes, statuses, signals,
attention, worker states, whether a state is recorded, the words a label says
(`spoken`, and `badge`: one status, attention first), the selected project's
`sign` (its status and everything that needs you, in the brief's words and
shapes) and the selection — a render-only description. A renderer never
reads storage, never fetches, never decides a status and never owns the
selection: a tap calls `tapProject()`, and the next draw says what is
selected. Contracts 24 and 30 check all of it.

**The field is `WorldField`: one miniature island.** It lives outside the
page script, in two ES modules the page imports after its first paint:

- `field/world.js` — everything decided rather than drawn, with no Three.js
  and no DOM, so the contracts import and test it in Node: where each
  district stands (a grid in registry order, back to front, its columns
  chosen per view), the island round them and what grows on it, the
  perspective camera as arithmetic (overview, focus, reveal, bounded panning,
  projection and hit-testing), the gesture arbiter (tap, pan, cancel), the
  crew's poses, and every place and its life as data — boxes, cylinders,
  cones, balls, rocks, rings and tori named by colour token.
- `field/render3d.js` — turns it into pixels with Three.js: one canvas, one
  scene, one perspective camera at a fixed yaw and pitch. Each place's parts
  merge into one geometry per finish (matte, metal, glow), built once per
  look and shared; stations, hand props and life elements are built once.
  The island and its growth are one mesh each, rebuilt only when the layout
  changes shape. A status change swaps a material or a visibility; nothing
  is rebuilt.

Three.js 0.186.1 is vendored in `vendor/three/`: a subset of only the
classes the world imports, tree-shaken and minified by esbuild,
`scripts/vendor-three.js` being the one way it is made (pinned tarball
integrity, pinned esbuild, target `es2020,safari15` so no class static
blocks), with its licence and a provenance file whose sha256 contract 30
holds the file to. It is about 135 KB gzipped. Nothing is fetched from a CDN.

**Lifecycle.** Each renderer has its own host inside one `.field-box`:
`#projectField` for `IsoField` and `#worldHost`, laid over it, for the world.
The page draws `IsoField` first. `startWorld()` runs once, only where a WebGL 2
context can really be made (one probe, released at once): the field box takes
the world's height with the flat field drawn inside it, whole and usable,
while the module downloads and the world is made behind it. Until the world's
first frame is on screen its view is invisible, so it takes no taps and no
focus. Its `onReady` then calls `adoptWorld()`, which in one step unmounts the
flat field, makes the world the field and moves keyboard focus from a flat
platform to the same project's button; a selection made while loading carries
over. Any failure — the import, the context, a render, or a lost context not
restored within 2.5 s — calls `stopWorld()`: the world is destroyed and the
flat field, never removed while loading, is what remains, for the rest of the
visit.
`worldStage` goes `idle → loading → on` or `off`, never back, so there is no
retry loop. `destroy()` disposes every geometry, material and texture,
releases the context and removes its DOM.

**One loop, on demand, and nothing measured in it.** The module's one
`requestAnimationFrame` loop runs only while the camera moves, a sign rises
or something is alive, and only while the world is on screen, uncovered (no
overlay — the page's `scroll-locked`), the page visible and the context
alive. It draws at up to about 60 frames a second (never faster on a 120 Hz
screen), and life settles into still poses five minutes after the last touch.
A frame only moves things: labels and the sign move by `transform`, and are
measured when their words or their room change, never in a frame (0.3.1 read
label sizes on every frame of a zoom). When frames keep arriving slowly, the
drawing resolution steps down (2, 1.75, 1.5, 1.25, 1 device pixels per CSS
pixel) and never back up in that visit. Under Reduce Motion every camera move
is instant and nothing loops. The drawing buffer is at most 2 device pixels
per CSS pixel and 2.5 million pixels.

**Composition.** One island, seen in depth: nearer districts are drawn
larger than farther ones. Districts stand in registry order, back to front,
left to right; the number of columns is whichever draws the smallest
district in view largest in the box the world has (an arrangement that shows
every district beats one that pans). Framing uses each place's real height
(`placeHeight`, measured from its recipe, its beacon, its crew and its life)
and each label's measured size, so a low place or a short name never pays
for the tallest. The overview shows every district and label as large as
fits, never drawing a district in view below a readable width; a larger
island starts at the first district and pans. Trees, pines, shrubs, rocks,
flowers and a pond or two grow between the districts from a fixed seed —
never on a pad and never tall near one — and join nothing to anything.

**Camera and touch.** A fixed yaw and pitch through a gentle lens: no orbit,
no zoom gesture. Two framings — the overview and focus (one place, its label
and its sign, close) — with 420 ms interruptible flights. The camera looks
only at the island: its target stays within a pad of the outer districts.
The viewport alone has `touch-action: none`: a drag inside it pans, a drag
outside scrolls the page. One arbiter decides every touch: under 8 px it is a
tap; past that it is a pan for good. A tap on the island is hit-tested
against each district's drawn outline (its pad and its roof); where two
overlap the nearer wins, and open grass selects nothing. The click that a
pan or an island tap also makes is swallowed for a moment, so a label the
camera has just moved under the finger never takes it; a keyboard's click
always goes through. Pointer cancel and lost capture end a gesture with no
tap. The camera's frame is transient: never stored. Resizing, rotating or
docking reframes in the same mode with the same selection; a reload starts
at the overview with the stored selection.

**The button layer and the sign.** Every project keeps a real `<button>` in
registry order, holding its label, moved under its district each frame: it
is the keyboard's stop and the accessible name, which says every status. A
label is type, not a box: the name, then one status — a chip only for what
needs you, otherwise the status word in its colour — at least 44 px tall.
Only the selected project's label has a backing. A label that can be read
takes a tap; one that would overlap another is hidden and takes none (the
focused label, the sign and the selected label win, in that order), as is
one whose district has left the view. Keyboard focus shows a hidden label
and brings its district into view, even one behind the camera. The selected
project wears a sign over the back of its place, where its tallest
structures stand: its status and everything that needs you, with the words
and shapes the brief uses, a blocker in its own words, and "Tap again for
the brief". It rises in once when the selection changes, stays whole inside
the view (its stem still points at the roof), takes no taps and is hidden
from assistive tech, which the button and the dock already tell. Overview
appears whenever the whole island is not in view.

**Places, crews and life.** Each look has a place: a training hall inside a
running track, a scheduling studio with a timeline wall, a library corner
with a lectern and a pond, a vault with coins and a ledger, a launchpad, a
sushi counter with its capybara chef, and a plainly generic module — each
with windows, doors, lamps, planters, benches and props. Identity (the
ground, the seam of light round each pad, the accents) is the project's own
`--terrain-*`/`--tint-*`; the island is `--land-*` and `--mat-*` earth and
plant tokens, each at least ΔE 20 from every status hue; status lights only
the beacon's lamp and halo and the worker's helmet, and only when a state is
known — with no record the lamp is dark and there is no worker. The crew's
station and pose come from `workerState` alone (building works at a bench,
QA holds a clipboard, a decision points at a console, blocked stands at a
barrier, stable tends a valve, paused sits dimmed, planning leans over a
blueprint, release ready raises an arm once, on the change itself — never on
a reload). Each place also has its own life (`life` in its recipe): runners
lap the track, the studio's clock turns and its now-line slides, pages turn
and a lamp glows in the library, the vault wheel spins and a coin drops,
lights climb the gantry and steam rises at the launchpad, plates ride the
sushi belt past the chef's knife. Life moves only while the project is known
to be under way — building, in QA, awaiting a decision, stable (more slowly),
planning or release ready — and holds still where no state is recorded,
where work is blocked or paused, and under Reduce Motion, where it shows its
first moment. It is a place, never a measure: it does not speed up, grow or
count with anything.

**`IsoField` is the fallback**: one `<button>` per project containing an
inline isometric SVG platform, landmarks as data (`LANDMARKS`), CSS motion
only. Light has two owners there too: identity light belongs to the place
(`--field-rim`, `--tint-*`, `--field-pool`), status light to the beacon, lit
only by a known state. Every accent is at least ΔE 20 (CIELAB) from every
status hue — contract 24 measures it.

## Layout

Mobile first. The top of the hub is compact — a small header with Refresh,
tight counts, and one row of attention buttons that say only what each needs
(Decision, QA, or what is blocking; three or more sit two to a row on a
phone) and the unknown count — so the world starts in the first screen.

The world's box takes the height the screen has left: `fitField()` measures
where the box starts, the tab bar and the dock, after every hub render and on
resize, and sets `--world-h`; the camera frames whatever it gets. Under the
world sits the dock: the selected project's name, its one dominant status and
a Brief action, always the same height (a hint until something is selected),
so choosing a project never resizes the world, and always above the tab bar.
The details are in the brief. On a phone the hub is one column and the Quick
Brief is a page. On a phone on its side the hub takes the full width and the
world the screen's whole height under the tab bar; the page scrolls to it,
and selecting a project brings the dock into view. In the wide layout the
dock gives way to the docked brief. At
`(min-width: 900px) and (min-height: 600px)` — `WIDE_QUERY` in the script and
the same media query in the stylesheet, kept equal by a contract — the hub
widens and the brief docks beside the field. Rotating into the wide layout
with a brief page open closes the page; the docked brief shows the same
project.

## PWA

Every path is relative, so the app works from any deployment sub-path. The
service worker is network-first with a cache fallback, precaches the app
shell and every file in `APP_FILES` (the world's modules and the Three.js
subset — `npm run config:sync` writes the list into `sw.js`), ignores other
origins (so an opened ChatGPT or Claude link, or a
repository's status file, is never cached), and on activate deletes only its
own older caches. Offline, the app opens from the shell cache and shows each
project's last valid status from `cache.repoStatus`.

## Testing

`test/harness.js` reads `index.html` as text, extracts the largest `<script>`
block, and evaluates it in a Node `vm` against a DOM stub and an in-memory
`localStorage`. Top-level `const`/`let` a test needs must be listed in
`BRIDGE`. The harness has no WebGL, so there the page keeps the flat field;
the world's modules are imported directly by contract 30.

Contracts 1–19 defend the foundation; 20–29 defend Mission Control: the
registry (six required projects, one shape, nothing private, no ceiling, a
status address only for a public repository), the status model (separate,
derived, never stored twice; no record is no state), private links
(validated, local, never shown in full), the hub (truthful counts, one line on
what needs you, one focus, remembered), the field seam (including a seventh
project, identity light and ΔE), secret safety, the backup boundary (allowlist
out, allowlist in, private links, source choices and fetched status never
leave or return), the status file (27), connected state (28), checking the
repositories (29) and the world (30: the pinned library, presentation-only
modules, every place and crew state whole, layout and camera, labels and the
tap-or-pan arbiter), the last two against a stand-in for GitHub's raw host and a
clock the test moves. `npm run verify` also runs the config check, the residue
scan and the secret scan. The runner fails a run that never reaches its end:
a contract whose promise never settles would otherwise let Node exit 0.

The harness cannot see hit-testing, layout, WebGL, the network or the service
worker. Those are checked in a real browser: real touch, real typing,
reloads, offline, reduced motion and rotation, at phone, iPad and desktop
sizes, against the real published status files — with failures injected on
the wire.

## The foundation → domain seam

The foundation reaches the product through six points:

```js
Domain.hydrate      // hydrateMissionControl: states, links, sources, fetched status, selection
Domain.render       // renderMissionControl: hub, the Settings links list, Refresh
Domain.wire         // editor drafts, pagehide flush, the layout watcher, checks on open and return
Domain.tabIcons     // { home, settings }
Domain.backupData   // backupMissionControl: what a backup file may carry
Domain.restoreData  // restoreMissionControl: what an import may accept
```

`boot()`, `renderAll()`, export and import call only these. A contract asserts that no
foundation code names anything the product defines; the key table,
`APP_CONFIG` and `APP_UPDATES` are the product's words declared where the
foundation expects them.

## Where to change what

| You are changing | Change it here |
|---|---|
| A project's name, purpose, repository or live URL | `PROJECT_REGISTRY` |
| A new project | one record in `PROJECT_REGISTRY`, after the six required ones; `publicRepo: true` only if its repository is public |
| A project's published status | `PROJECT-STATUS.json` in that project's repository — never in this one |
| The status file's contract | `STATUS_KEYS`, `validateStatusFile` and `scripts/project-status.js` together — contract 27 holds them equal; a new shape is a new `schemaVersion`; then copy the checker unchanged to every publisher |
| How often repositories are asked | `STATUS_FRESH_MS`, `STATUS_RETRY_MS`, `STATUS_BACKOFF_MS` — and contract 29 |
| A project's look | its `visualTheme`, the `--terrain-*`/`--tint-*` tokens, its place in `ENVIRONMENTS` (`field/world.js`) and, for the fallback, `LANDMARKS` |
| What a backup may carry | `BACKUP_FIELDS` — and contract 26 |
| The status vocabulary | `PROJECT_STATUSES`, `SIGNALS`, and the `--sig-*` tokens |
| What counts as active | `ACTIVE_STATUSES` |
| The link rule | `parseToolLink` — and contract 22 |
| The field's rendering | `field/render3d.js` (and `IsoField`, the fallback), behind `Field` |
| Layout, camera, gestures, crews | `field/world.js` — and contract 30 |
| The Three.js version | `scripts/vendor-three.js`, then `npm run verify` |
| A file the app loads | `APP_FILES`, then `npm run config:sync` |
| A data shape | bump `DATA_SCHEMA_VERSION` and add a migration |
| A release | an `APP_UPDATES` entry, then `npm run config:sync` |
