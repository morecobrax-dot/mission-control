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

**The chrome and the world** (0.10.0). The app's chrome is warm ivory: the
ground (`--brand-ground`, `#F3EEE4`) is ΔE 1 from the world's sky, surfaces
are lighter cream, the sunken one warm stone, words deep charcoal and warm
grey, the accent a deep blue. Two sets of tokens never mix:

- **The chrome's** — layers 1 to 3, `--border-control` (the 3:1 edge of a
  field or a switch), `--scrim`, and the status inks `--status-text-*`.
- **The world's** — `--sig-*`, `--tint-*`, `--terrain-*`, `--mat-*`,
  `--city-*`, `--light-*`, `--land-*`, `--glow-*`, `--worker-*`,
  `--iso-shade`, `--world-*`. `render3d.js` reads only these, through the
  tile's `.sig-*`/`.theme-*` classes and `:root`.

A `.sig-*` class sets both `--sig` (the hue that lights a beacon, a helmet,
an authored place's status rim, a world label's chip) and `--sig-text`
(the ink the chrome writes that status in: a chip's word, a count, an
attention stripe, a picked status). Each ink is the hue's own family,
darkened to 4.5:1 or better on every surface and on its own 12% tint, so
retheming the chrome cannot recolour the city, and making a status
readable on cream never touches a beacon. Contract 24 measures every word
token and every ink on every surface, the 3:1 edges and the focus ring,
and that the renderer reads no chrome token. The flat field (`--field-*`)
sits on the world's ground. `APP_CONFIG.themeColor` and
`backgroundColor` are the ground, so the launch screen and the browser's
bar match; the status bar asks for dark words (`default`). How an iOS Home
Screen app paints that bar has not been checked on a device.

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

**Status age** (0.9.3, `statusAgeOf`). How old the record a project shows
is: the effective record's own `updatedAt` — the repository's, or the one
you recorded — never `fetchedAt` or `checkedAt`. Elapsed time between two
instants in whole 24-hour days, so no time zone or daylight-saving change
moves it; a time without a zone, or none, claims nothing, and a time ahead
of this device's clock is age 0. From `STATUS_OLDER_DAYS` (14) a record is
older: `projectView` carries `age`, the hub summary adds a short count
("2 last updated 14+ days ago", the whole sentence for a screen reader) and
the brief says the date, the age in days and that it is older. Nothing else
reads it — status, attention, the HUD, the world's lights and crews are
exactly what they were. Derived at every render (and on return to the
app, which now redraws), never stored, never on a timer. The count is
always on screen while any record is older, by plain flex wrapping at the
summary's own type size: beside what the line already says (two lines in
its one line's height), and when it stands alone (every state known, the
attention buttons speaking) beside the buttons where two readable lines
fit, otherwise one line below them — the world gives that line's height
and nothing else changes. 0.9.3 measured and folded it to a screen
reader's line instead (`placeOlderNote`, removed in 0.9.4). Contract 32.

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
(`spoken`, and `badge`: one status, attention first), the `card` of the
project in focus (its status and everything that needs you, in the brief's
words and shapes, and that a tap opens the brief), which project is chosen
(`selected`) and which is in focus (`focused`) — a render-only description.
The app owns both: `selectedId` is the choice, stored and shown in the dock;
`focusedId` is this visit's focus, never stored, so the overview and a
relaunch have nothing in focus and nothing there offers the brief. A
renderer never reads storage, never fetches, never decides a status and
never owns either: a tap calls `tapProject()` (focus, then the brief), a
swipe `navigateProject()` (the next place, quietly, never a brief) and
Overview `leaveFocus()` (the choice stays), and the next draw says what is
chosen and what is in focus. Contracts 23, 24 and 30 check all of it.

**The field is `WorldField`: one miniature city.** It lives outside the
page script, in two ES modules the page imports after its first paint:

- `field/world.js` — everything decided rather than drawn, with no Three.js
  and no DOM, so the contracts import and test it in Node: where each
  district stands (a grid in registry order, back to front, its columns
  chosen per view), the city round them (`cityPlan`), the perspective camera
  as arithmetic (overview, focus, reveal, bounded panning, projection,
  hit-testing, and one kind of flight), the gesture arbiter (tap, swipe,
  pan, cancel, the axis and speed of a drag), where each label stands and
  which can be read, the crew's poses, and every place and its life as data
  — boxes, cylinders, cones, balls, rocks, rings and tori named by colour
  token.
- `field/render3d.js` — turns it into pixels with Three.js: one canvas, one
  scene, one perspective camera at a fixed yaw and pitch. Each place's parts
  merge into one geometry per finish (matte, metal, glow), built once per
  look and shared; stations, hand props and life elements are built once.
  The island, the canal's water and the merged city rebuild only when the
  layout changes shape. Building masses use small bevels; shared Standard materials
  and one cached directional shadow map provide soft, grounded lighting. A status change swaps a material or a visibility; nothing
  is rebuilt.
- **Authored places.** Since 0.8.0 every one of the six required looks is
  drawn this way (the first project, DayPlan, Daily Verse, Personal Savings, Space
  Kindergarten, Capy Sushi). A look may be drawn from a GLB authored in
  Blender (`art/blender`, `docs/3D-ART-BIBLE.md`): `ASSETS` in `world.js` maps
  the registry's `visualTheme` to the file, the width its plinth is drawn at
  and its measured rise. Blender owns the geometry, materials and clips; the
  app owns state, light and every touch. The renderer loads each file once,
  clones it per district with its skeletons (`cloneSkinned`), copies its
  materials per district so one project's state recolours only its own
  place, and sets it into its city block in place of the recipe, whose pad,
  crew, life, beacon and painted light step aside: `assetFloor` stands the
  file so the master platform's dark lower plinth (0.42 of its 16.9 width,
  `mc_platform.py`, held by contract 30) is just under the paving, leaving
  its identity band as a coloured course at the curb, its ledge, its lit
  status rim and its deck above it. That is placement only; the file is drawn
  as Blender made it. Its status lights (rim, beacon,
  helmet bands) share one material, recoloured from the button's `--sig` and
  dark without a record; a paused place is dimmed. A place's crew is one
  skinned mesh on one skeleton, each role's bones named
  `<role>__<bone>` (`CREW_JOIN`) and the roles listed in the rig's
  `mc_crew` extras; the renderer slices every clip per role by that prefix,
  and `assetCrew(workerState, role)` says what each does: its own job while
  building, a signal when something needs you, still when blocked or paused.
  With no record the whole crew is hidden, since one skeleton cannot hide a
  part of itself. Clips cross-fade; under Reduce Motion and on a first draw
  they simply are. A place's own life (a clock's second hand, a gate that
  walks its timeline) is one clip, `MC_LIFE` (`ASSET_LIFE_CLIP`), that moves
  only nodes marked `mc_life`: it plays at `lifeSpeed` while `lifeActive`
  says the project is under way and otherwise stands at its first moment.
  A file that fails, or has not loaded in 5 s, gives the district back to
  its recipe; if it arrives later it still takes its place, and the layout
  follows its height.
- **Adding an authored place** is data, not renderer code: export the file,
  add a line to `ASSETS` (the look, the file, the plinth width, the rise the
  export audit measured), then `npm run config:sync`, which ships it. The renderer names no
  look, project or file, and contract 30 checks each file against
  `DISTRICT_BUDGET` — at most 24 draws, 80k triangles, 16 materials, 8
  workers, 2 MB and no textures — which the export (`export_glb.py`) also
  enforces and writes into the file's audit. The export keeps the model and
  changes how it is packed: meshes of one material joined, materials that
  differ only in colour folded into one family whose colour is per vertex,
  every worker joined into one crew, the status lights joined into one
  mesh, and normals, colours and skin weights stored in 8 bits
  (`KHR_mesh_quantization`).

Three.js 0.186.1 is vendored in `vendor/three/`: a subset of only the
classes the world imports, tree-shaken and minified by esbuild,
`scripts/vendor-three.js` being the one way it is made (pinned tarball
integrity, pinned esbuild, target `es2020,safari15` so no class static
blocks), with its licence and a provenance file whose sha256 contract 30
holds the file to. The gzip budget is measured by the contract rather than assumed from the
previous renderer. RoundedBoxGeometry, GLTFLoader (with the physical
materials and the animation system it brings) and SkeletonUtils' `clone`
(exported as `cloneSkinned`) are in the pinned local bundle, about 161 KB
gzipped. Nothing is fetched from a CDN.

**One light, from the Blender studio rig** (`LIGHT` in `world.js`): a warm
key sun that casts, a weak cool fill and a rim that do not, and a hemisphere
light carrying the Blender world's gradient (warm ground, pale sky) at
π × its strength, which is what image-based light would give a surface.
Since 0.9.0 it is daylight: a stronger, warmer sun, a brighter sky and softer
shadows over a bright city on a warm ivory ground (the world's own
background, `.world-view`); since 0.10.0 the page's chrome is the same warm ivory
(see **The chrome and the world** below).
What is kept is Blender's split of the faces, not its angles: the face that
fills the view is lit, the narrow face to its right is in shade, cast
shadows run to screen-right. Tone mapping is Khronos PBR Neutral, which
keeps authored hue and saturation; AgX in three.js is the flat base look.
The sky is prefiltered once and reflected only by glass and metal: sampled
by every pixel it cost more than the whole authored place. The shadow map is
2048 wherever the GPU allows 4096 textures; it is cached, and refreshed about
twelve times a second only while an authored worker moves and its place is
drawn at least 240 px wide.

**Lifecycle.** Each renderer has its own host inside one `.field-box`:
`#projectField` for `IsoField` and `#worldHost`, laid over it, for the world.
The page draws `IsoField` first. `startWorld()` runs once, only where a WebGL 2
context can really be made (one probe, released at once): the field box takes
the world's height with the flat field drawn inside it, whole and usable,
while the module downloads and the world is made behind it. Until the world's
first frame is on screen its view is invisible, so it takes no taps and no
focus; that first frame waits for every authored place to settle (drawn, or
given back to its recipe), so a block is never seen swapping models. Its `onReady` then calls `adoptWorld()`, which in one step unmounts the
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
`requestAnimationFrame` loop runs only while the camera moves, a label
glides or something is alive, and only while the world is on screen, uncovered (no
overlay — the page's `scroll-locked`), the page visible and the context
alive. It draws at up to about 60 frames a second (never faster on a 120 Hz
screen), and life settles into still poses five minutes after the last touch.
A frame only moves things: labels and the card move by `transform`, and are
measured when their words or their room change, never in a frame (0.3.1 read
label sizes on every frame of a zoom). When frames keep arriving slowly, the
drawing resolution steps down (2, 1.75, 1.5, 1.25, 1 device pixels per CSS
pixel) and never back up in that visit — but only when the frame itself is
the reason. A screen presenting at 30 Hz (iOS Low Power Mode, a
battery-saving browser) spaces cheap frames 33 ms apart, so before it steps
down the renderer times two frames of its own (the lower of the two, each
finished by a one-pixel read) and `shouldStepDown` believes the gap only
when that cost fills `costShare` of it. Timing is two extra frames, so after
each cheap verdict the next is further off (1, 2, 4 … 32 windows of 45
frames, about 48 s at 30 Hz); a new size starts over. Under Reduce Motion every camera move
is instant and nothing loops. The drawing buffer is at most 2 device pixels
per CSS pixel and 2.5 million pixels.

**Composition.** One island, seen in depth: nearer districts are drawn
larger than farther ones. Districts stand in registry order, back to front,
left to right; the number of columns is whichever draws the smallest
district in view largest in the box the world has (an arrangement that shows
every district beats one that pans). Framing uses each place's real height
(`placeHeight`, measured from its recipe, its beacon, its crew and its life;
`assetHeight` for an authored place), so a low place never pays for the
tallest. The overview shows every district as large as fits, never drawing a
district in view below a readable width; a larger city starts at the first
district and pans. Its labels stand on their own places, so they ask no room
of it. The minimum measures the pad geometry, not typography: labels retain
their CSS type size. A 92px geometry floor cropped a three-column city on
phones; the 68px floor lets the full six-block city fit as two columns,
including the whole slab, on a short phone too.

**Names decide the arrangement** (0.9.5). The renderer gives `chooseLayout`
the labels' measured rooms, and each arrangement is judged by the names that
can actually be read at its overview — placed and resolved exactly as the
renderer does (`overviewLabelRects`, `resolveLabels`, `labelOff`). The whole
city with every name readable wins; with every name readable over the whole
city it fits down to `minPlacePx` (44, a fingertip) rather than the
geometry-only 68; otherwise the most names readable, then as before. A city
that pans starts zoomed only as far out as keeps every name in its view
clear of its neighbours, so at the overview a name is readable or off the
view, never hidden behind another. At the view's edge a label slides in to
be read only a little (`labelSpot`, `WORLD.labelSlide`: a tenth of its
width, 0.9.6), so its middle stays over its own place and a place leaving
the view takes its name with it. 0.9.5 kept it in the view however far its
place had gone: on a 320×568 phone (a 288×280 world that pans) a left-hand
place off the edge left its name pinned there, over the place a pan had
come to show, and with Capy Sushi, DayPlan or Personal Savings in the
middle of the view their names were hidden about four frames in ten.
Letting a label slide while its place's front was still under it halved
that but not enough: a label hanging wholly to one side of a place half
off the edge still covered Capy Sushi's. Contract 30 sweeps every frame a
pan may rest on, whoever leads: each readable name has its middle over its
own place, every name can be panned to and read, and a place in the
middle of the view has its name (only two names each standing on its own
place may still meet, and collision protection hides one). Every fitting
overview is unchanged; a city that pans may start with an edge place's
name a pan away rather than slid off its place. 0.9.4 chose by
geometry alone: on a 375×667 phone with two
unknown records and two or three attention buttons (a 343×296 world) two
columns at 66px lost by 2px to three columns whose 100px labels collided,
and four of six names showed. Without rooms the choice is the geometry-only
one, unchanged. Label words changing (a status arriving) do not relayout;
the hub gaining a row does, through the resize.

**The city between the places** (`cityPlan`, merged by `cityParts` into
three draws, plus the island and the water). Every place stands in its own
block, paved one curb above the road with a sidewalk round it. Rows are
parted by a cross street, or once, nearest the middle, by a canal the
city crosses on footbridges, with low walls along it and bollards where a
street meets it. Between two places in a row runs a street or a planted
lane, alternating from row to row, so the streets meet at offset corners
rather than a grid; a short row's spare room is a paved square. A ring road
runs round the city inside a promenade at the shore, and the island is a
rounded rectangle with a stone face and a soft contact shadow on the page.
Crossings are painted only at street corners, cars park at curbs clear of
every mouth, one loading bay holds a parked truck, and trees line the
promenade (never quite evenly), the lanes and the quays — never in front of
a place, where they would hide it or its card. It is computed from the
places' positions alone, the same every time, for any number of places, and
says nothing about any project: roads encode no relationship. Every street,
paving and water colour is at least ΔE 20 from every status hue.

**Camera and touch.** A fixed yaw and pitch through a gentle lens: no orbit,
no zoom gesture. Two framings — the overview and focus (one place and its
card, close) — and one way between them: `planFlight` carries the camera
from wherever it is, at the speed it already has (`flightSpeed`, at least a
brisk start so a tap answers at once), over a time that grows with the way
in views, with a small rise on a long hop, to rest exactly on its frame. A
flight interrupted by another, a swipe caught mid-flight or a flick released
into one never stops the camera dead. The camera looks only at the island:
its target rests within a pad of the outer districts. The world owns every
touch that starts in its box: the view is `touch-action: none` to its
square corners (only what is drawn is rounded: the ground, the canvas and
the label layer), so no drag there is ever the page's. One arbiter decides
every touch and its axis as it starts: under 8 px it is a tap. In focus a
clearly sideways drag swipes: the camera follows the finger along the very
path the flight will take (`swipeFrame`), and `swipeVerdict` goes to the
next place (finger left) or the previous only when the drag went far enough
or was flicked, never on a twitch or a flick back; the next place is
reading order, and at either end the city gives a little and comes back.
Every other drag pans (`panStart`, `panMove`, `panEnd`): the ground point
under the finger stays under it (`groundAt`, `project`'s inverse), within
where the camera may rest (`panRest`): the place in focus, the canonical
overview while the whole city is in view, or otherwise anywhere a pad
beyond the outer districts. Past that the city gives on each of the
screen's axes, half the finger's way at first and at most `WORLD.pan.reach`
of the view's shorter side. A drag that catches a flight starts where the
camera is; let go, the pan settles by the one flight, carried by a flick
only where it can move, at once under Reduce Motion. Anything else that
sends the camera (Overview, Escape, the app's focus, a new shape) ends a
drag under way where the city is drawn, reporting nothing. Arrow keys move
between places in focus and Escape goes to the overview, as the Overview
button does. A keyboard stop on a place (`focusin`) reveals it; the focus
handed on as the overview lands is not a stop. When Overview hides itself
holding the focus (a tap or click gives a button the focus), or the focus
is on a name that cannot be read at the overview, `placeLabels` hands it
to a name that can — the chosen project's, else the first in reading
order — inside `S.handing`, a guard set only around that one `focus()`
call, so nothing is revealed and the camera stays where the person sent it
(0.9.7; 0.9.6 revealed the chosen project wherever it was, and in a city
that pans a tap on Overview ended away from the overview). A tap on the island is hit-tested against each district's
drawn outline (its pad and its roof); where two overlap the nearer wins,
and open streets select nothing. The click that a drag or an island tap
also makes is swallowed for a moment, so a label the camera has just moved
under the finger never takes it; a keyboard's click always goes through.
Pointer cancel and the view's own lost
capture end a gesture with no tap and no navigation (a touch is first
captured by what it touched; handing that to the view is not a cancel —
0.8.0 treated it as one and every touch drag ended at its first move). Under
Reduce Motion a swipe waits for its verdict and the camera cuts. The
camera's frame is transient: never stored. Resizing, rotating or docking
reframes in the same mode; a reload starts at the overview, with the stored
choice and nothing in focus.

**The button layer, the labels and the card.** Every project keeps a real
`<button>` in registry order, holding its label, moved by transform each
frame: it is the keyboard's stop and the accessible name, which says every
status. One rule places every label (`labelSpot`): on its own place, its
foot at the front edge, so it names that place and covers no other; for the
place in focus, its card just in front of it, where it hides nothing of the
place. A label eases between the two (`under`) in the one loop, and one
whose words change glides from where it was rather than jumping. A label is
type over the city with a halo of its ground: the name, then one status —
solid in its hue when it needs you, pale for a recorded state, a dashed
outline for Needs update — at least 44 px tall. The chosen project's label
stands on a light plate with an ink ring; the card is a light plate with
every status, a blocker in its own words and "Tap for the brief", and only
the place in focus has one. A label that can be read takes a tap; one that
would overlap another (the keyboard's, the focused and the chosen label win,
then what needs you, then nearer rows) or the Overview button, or whose
place has left the view, is hidden and takes none. The labels readable
where a flight goes are decided as it leaves, so none flickers on the way.
Keyboard focus shows a hidden label and brings its district into view, even
one behind the camera. Overview appears whenever the whole island is not in
view; at the overview it is away but still laid out, so it is measured with
the view and never in a frame.

**Places, crews and life.** Each project owns an architectural block:
a training building with a rooftop running track, a scheduling tower with a
clock, a columned reading house, a savings building with a vault entrance,
a space-learning observatory, and a sushi shop with capybara chef. A generic
block serves additional registry records. Shared frontage helpers create
recessed windows, cornices, rooftop utilities, awnings and storefronts.
Project identity uses `--terrain-*`/`--tint-*`, while architectural finishes
use `--city-*` and material tokens. Matte and metal surfaces are Standard
materials; warm window geometry is unlit, with small painted additive pools.
The hemisphere sky plus a soft directional shadow map approximate bounce and
contact light. This is not ray-traced global illumination.

Status still lights only the beacon, halo and worker helmet. No record means
no status worker or lit status beacon. Worker stations and poses follow
`workerState`, with acknowledgment only on an actual release-ready transition.
Project-specific life such as a rooftop runner, clock hand or chef's knife
uses the existing state rules and never invents activity.

Separate city ambience has no project inputs: one small service truck and
two passers-by (Living City 1, 0.9.2), each placed by a pure function of the
world's one clock, `streetTime`, over a route `cityPlan` computes from the
places' positions. The truck (`driveAt`, `DRIVE`) is the city's box truck
recipe at 0.85 scale on one circuit of the ring road's outer lane: it keeps
right (anticlockwise as seen), eases from its pace to a slower one through
each quarter turn over a speed table integrated once per plan, and its
whole body clears the promenade, blocks, parked cars, tree crowns and canal
by at least 0.1, its wheels on the road (contract 30 sweeps it every 5 cm
in eleven cities). Each passer-by (`walkWays`, `walkerAt`) walks one
stretch of paving — a planted lane, else a street's sidewalk, else a
place's side — in a different row from the other: stop, walk, stand and
turn round, walk back, turn, walk on, eased at every stop, at its own pace
and period so the two are never in step, and continuous over the day's
join. The passers-by are one authored file (`STREET`, `street-life.glb`),
loaded and waited for like a place's (`startStreet`), one skinned mesh on
one skeleton whose `<role>__root` bones the app stands where `walkerAt`
says after the clips, which carry no root motion; the walk clip's phase
follows the distance walked (`WALK.cycle` is the measured stride), so no
foot slides. The clock runs only while the world's life does, never under
Reduce Motion: a still world holds the truck where it is and stands each
passer-by at ease. Neither casts into the cached shadow map (each has a
soft shadow of its own) nor takes a tap, and neither ever represents an AI
agent, work rate, transfer, progress or an integration. Both are made once;
a new layout only gives them new ways.

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
where the box starts, the tab bar and the dock, after every hub render, on
resize and as the hub's tab comes back, and sets `--world-h`; the camera
frames whatever it gets. The hub is then one screen (`html.hub-screen`):
below the dock the document keeps only the tab bar's room, never more than
the box leaves, and the root does not overscroll, so there is no page to
drag or bounce behind the world (0.9.0's hub was 51 px taller than every
screen). Settings is a page as before, and a phone on its side scrolls.
Under the world sits the dock: the selected project's name, its one
dominant status and a Brief action, always the same height (a hint until
something is selected), so choosing a project never resizes the world, and
always above the tab bar.
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

Every path is relative, so the app works from any deployment sub-path.

**One release at a time (0.7.1).** 0.7.0 served its modules and models at
the same address in every release, network-first through the browser's HTTP
cache, and precached whatever came back. Pages and the browser each keep a
copy of every file for ten minutes, per address, so an update could run new
HTML with an old renderer or layout, and cache the mixture for offline. Now:

- **Immutable addresses.** `scripts/release.js` walks the real import graph
  from `field/render3d.js` and every relative asset address the modules
  name (the models in `ASSETS`). It copies each file into `release/` as
  `<name>.<first 12 hex of its sha256>.<ext>` and rewrites every reference,
  so a file's address changes exactly when its bytes do. Nothing is listed
  by hand. An import it cannot follow (a non-literal `import()`, a bare
  specifier, a model with an external file) stops the build.
- **One generator.** `npm run config:sync` writes `release/`, the page's
  `APP_RELEASE`, `WORLD_MODULE` and `APP_FILES`, and the worker's `RELEASE`
  (every file with its sha256 and size) and `CACHE_NAME` (the version plus a
  hash of that manifest); `config:verify` fails on any drift. Shipped files
  are `-text` in `.gitattributes`, so the bytes hashed are the bytes
  committed and served. Edit `field/` or `art/exports/`, then sync: the dev
  server runs the release copies.
- **Verified install.** The worker fetches every file past the HTTP cache
  (`cache: 'reload'`), or copies it from the release that last ran here, and
  checks its size and sha256; a 200 is not proof. One wrong, missing,
  partial or late (60 s) file fails the install, and the running release is
  untouched; verified files are kept for the retry. A file is never answered
  with the page, and nothing unverified is stored under a release address.
- **The page is its release.** Navigations are answered with the active
  release's own `index.html`, and `release/` files from that release (or the
  one before it), so a page and everything it loads are one release. Other
  origins (status files, opened links), other paths and non-GET requests are
  never answered or kept.
- **Updates wait for you.** A verified release waits. The page asks it which
  release it is (`MC_RELEASE`) and, if it is a different one, offers it in
  Settings (Update ready) with one toast. Tapping it activates the release
  (`MC_ACTIVATE`) and reloads that page once. Nothing else ever reloads a
  page: other tabs keep running and are offered it, and it also starts on
  the next launch with no old tab open. Leaving the page saves an open
  editor's draft, as before.
- **Retention.** Activation marks its cache complete (`__release__`), keeps
  the most recent release that ran before it — so a page still on it can
  import or fetch a model late — and deletes every other cache of this app:
  older releases, unfinished installs and pre-release caches. Only names
  `<id>-v<digit>…` are this app's; other apps' caches on the shared origin
  are never touched. A tab two releases behind loses its late loads (the
  world falls back to the flat field) and is offered the update.
- **The first update from 0.7.0.** The new worker installs only after every
  file is verified from the network, never from 0.7.0's cache. Since 0.7.0
  pages cannot show an update action, it then takes control at once (only
  when no verified release has run here), removes 0.7.0's cache and reloads
  nothing. Pages already open keep whatever 0.7.0 gave them, mixed or not,
  until they are next opened, and while 0.7.0's worker is still in charge its
  behaviour cannot change. From the first verified release on, every
  guarantee above holds.

Offline, the app opens from its release and shows each project's last valid
status from `cache.repoStatus`. Contract 31 runs the real `sw.js` against a
controllable network and cache store.

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
| A project's authored place | Blender (`art/blender`), then `export_glb.py` into `art/exports/`; its look in `ASSETS` (`world.js`) with the rise measured from the file, then `npm run config:sync` |
| What an authored crew does in each state | `assetCrew` (`world.js`) — and contract 30 |
| What one authored place may cost | `DISTRICT_BUDGET` (`world.js`) and the same numbers in `export_glb.py` — contract 30 holds them equal, and `BUDGET` must still hold six |
| The world's light | `LIGHT` (`world.js`) and the `--light-*` tokens |
| The Three.js version | `scripts/vendor-three.js`, then `npm run verify` |
| A file the app loads | import it from a module, or name it in `ASSETS`, then `npm run config:sync` (`scripts/release.js` finds it) |
| How updates install, activate and clean up | `sw.js` (outside its generated blocks) and `Updates` in `index.html` — contract 31 |
| A data shape | bump `DATA_SCHEMA_VERSION` and add a migration |
| A release | an `APP_UPDATES` entry, then `npm run config:sync` |
