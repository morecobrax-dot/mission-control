# Development method

Instructions for AI coding sessions in this repository. These override default
behaviour.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing architecture, and
[PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) before changing anything a user sees.

This is **Mission Control**, a product built from the app-starter
foundation. Its own rules are at the end of this file (29 onward).

---

## Before changing Mission Control

In this order:

1. Read [PRODUCT-DESIGN.md](PRODUCT-DESIGN.md) — the rules the UI must obey.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) — what already exists, so you do
   not rebuild it: the foundation, the product model, the link rule, the
   field seam.
3. Read the phase brief. If the requirement is not written down, ask for it
   before writing code.
4. **Separate foundation from domain before you type.** Name which parts of the
   change are product-specific and which are genuinely reusable.

### The foundation-modification rule

**A product-specific need stays in the product.** Do not change generic
foundation code because one product wants something. Add it in the domain
section, behind the `Domain` seams.

Only upstream a change to the foundation when it is reusable *on its own terms*
— when a second, unrelated product would want it identically. If you are
unsure, it is not reusable yet. Leave it in the product; it can be promoted
later, by hand, after a second product proves the need.

This rule exists so a savings app does not slowly turn a general foundation
into a finance framework. The same applies in the other direction: never add a
domain concept — a transaction, an account, a category — to the storage
adapter, the overlay engine, toast, confirmation, or navigation.

### No dependency linkage

A product created from this starter is **independent**. Never introduce a git
submodule, an npm package, a shared remote runtime, or any automation that
pulls starter changes into a product or pushes product changes back. Copy the
knowledge, then own the product.

## Workflow

```
AUDIT → UNDERSTAND → IMPLEMENT → ADVERSARIAL VERIFY → DIFF AUDIT → SHIP → REPORT → STOP
```

- **Audit** the existing code before proposing a change. Read the thing you are
  about to modify, and the thing that calls it.
- **Understand** why it is the way it is. Nearly every unusual line here carries
  a comment naming the failure that caused it. If you are about to remove
  something that looks redundant, find that comment first.
- **Implement** the requested change, and only that change.
- **Adversarially verify.** Try to break what you built. Repeat it a hundred
  times. Open it, close it, rotate it, refresh mid-edit, deny it storage.
- **Diff audit** before shipping. Read the whole diff. Every surviving line
  should have a reason to exist.
- **Report** what you did, what you verified, and what you did not.
- **Stop** at the requested phase. Do not begin the next one.

## Before changing anything

1. **Run the baseline first.** `npm run verify` before you start, so you know
   whether a failure is yours.
2. **Find the current source of truth before adding another one.** If you are
   about to declare a value, search for it first. Identity, tokens, storage
   keys, release history and overlay state each have exactly one owner, and a
   contract enforces it.
3. **Prefer extending an existing system to creating a parallel one.** A second
   overlay mechanism, a second storage wrapper or a second version constant is
   a defect, not an addition.
4. **Do not redesign unrelated surfaces during targeted work.** If you notice
   something else, say so; do not fix it in the same change.

## Hard rules

1. **New code goes in the largest inline `<script>` block.** A second block or
   a linked file is invisible to every contract, and the suite will still pass.
   The one exception is the 3D field: `field/world.js` and
   `field/render3d.js` are ES modules the page imports, with the vendored
   `vendor/three/`. Contract 30 imports them directly; anything they must
   guarantee needs an assertion there, and nothing else goes outside the page.
2. **Never hard-code a font size, font family, or colour.** Use the tokens. A
   genuine exception is marked `/* fs-exempt: reason */` on the lines above it.
3. **Never add a lock/unlock pair to an overlay.** The engine's observer handles
   scroll lock, focus, stacking and ARIA. A hand-rolled pair reintroduces the
   bug the engine exists to prevent.
4. **Never touch `localStorage` outside the storage adapter.** Anything else is
   an unnamespaced key and an origin collision waiting to happen.
5. **Never edit `release/`, the generated blocks of `sw.js` and `index.html`,
   `manifest.webmanifest` or the derived `<head>` block by hand.** Edit
   `APP_CONFIG`, `field/` or `art/exports/`, run `npm run config:sync`.
6. **Never reference a path outside the repository** in application or tooling
   code. The starter is self-contained.
7. **No `alert()`, `confirm()` or `prompt()`.** Use `toast()` and
   `confirmAction()`.
8. **No new dependency, framework, or build step** without the user explicitly
   asking for one. The value here is proven behaviour, not stack novelty.

## Product rules

9. **Mobile first.** Design for a phone, then let it widen.
10. **≥44px actionable touch targets.** The visible mark may be smaller.
11. **≥16px editable inputs**, or iOS Safari zooms and does not zoom back.
12. **Respect safe areas** on all four edges, through the `--inset-*` tokens.
13. **Respect `prefers-reduced-motion`** on every animation, not most of them.
14. **One visible action, one predictable outcome.** Validate before mutating.
15. **Truthful empty and unknown states.** Absent is not zero. A missing key is
    a new user, not a corrupted one, and is never repaired with a default.
16. **No fake precision.** Do not present a number the data cannot support.
17. **Do not persist derived values.** Store the record; compute the
    presentation. A stored total can disagree with its parts.
18. **Preserve backward compatibility** wherever product data already exists.
    A shape change means a migration, not a reinterpretation.

## Testing

19. **Add regression coverage for every real defect**, in the same session that
    fixes it. Name the contract after the failure it prevents, not the function
    it calls.
20. **Run adversarial tests** — repetition, nesting, refresh mid-action, denied
    storage, corrupt input, empty and enormous collections.
21. **A contract that cannot be described as "this prevents X" should not
    exist.** Optimise for value, not for count.
22. **If you add a top-level `const`/`let` a test must reach**, add its name to
    `BRIDGE` in `test/harness.js`, or it will be invisible.

## Shipping

23. **Verify live behaviour**, not just the local file. Install it, load it
    offline, check the cache and storage names in DevTools.
24. **Compare the deployed bytes to committed source**, not to a
    line-ending-modified working copy — on Windows the working tree is CRLF and
    will report a false mismatch. Compare the git blob.
25. **Update `APP_UPDATES` on every real release**, then run
    `npm run config:sync`. The newest entry is the version; the cache name
    derives from it. Skipping this ships an app that cannot invalidate its own
    cache.
26. **`npm run verify` must be green before any commit or push.**

## Scope

27. **A product-specific need stays in the product.** See the
    foundation-modification rule above. Do not generalise on the first use.
28. **Stop at the requested phase.** Finish it completely, report, and wait.
    Do not start the next phase, do not "while I'm here", do not polish the
    demo into a product.

## Mission Control rules

29. **Nothing private in the repository.** It and its Pages site are public.
    Never commit a ChatGPT conversation link, a Claude session id or link, a
    token, an API key, a credential or a local machine path. Tests use obvious
    fixtures — `.test` hosts, ids that say `FAKE` — and `npm run secrets`
    (inside `npm run verify`) fails on anything that looks real. It reads
    binary art too, every frame of a compressed `.blend`: Blender stores a
    file browser's folder in every save, so a `.blend` is saved only through
    `save_blend` (`art/blender/scripts/mc_lib.py`).
30. **Identity is public, state is yours or published, links are private.**
    Names, purposes, repositories, live URLs and `publicRepo` live in
    `PROJECT_REGISTRY`. A state you record lives in `data.projectStates` on the
    device; a state a public repository publishes lives in its own
    `PROJECT-STATUS.json` and is cached in `cache.repoStatus`. ChatGPT and
    Claude links live only in `data.privateLinks`. Never give a private link a
    default in source; never put state in the registry.
31. **No record is no state.** A project nobody has recorded says "Needs
    update", has a `null` status and no attention, counts toward Projects and
    toward nothing else, and opens its editor empty. Never fill in a status,
    a version, a phase or any example text for a real project, and never say
    "Nothing needs you" while any state is unknown.
32. **Status and attention stay separate, and derived values stay derived.**
    A project is blocked exactly when a blocker is written. Attention, the
    signal, the crew, the counts and `recorded` are computed on read and
    never stored.
33. **Every destination passes the link rule, twice.** `parseToolLink` at save
    and again at render. Tools are real links (`noopener noreferrer` for the
    web). Screens show a link's host, never its path.
34. **Status is never colour alone.** Every entry in `SIGNALS` has a word and a
    shape, and its hue is a layer-4 token.
35. **The field is drawn only through its seam.** `Field.mount/draw/focus/unmount`,
    fed by `fieldScene()`, one renderer at a time. A renderer never reads
    `Store`, never fetches, never decides a status and never owns the
    selection or the focus: it reports a tap (`onTap`), a swipe to the next
    place (`onNavigate`) and Overview (`onOverview`), and the next draw says
    what is chosen and what is in focus; the camera follows the focus, never
    the choice alone.
    `WorldField` (`field/render3d.js`) is the field — one city, one
    perspective camera that never turns — and keeps a real button per
    project; a tap on the island is hit-tested in `field/world.js`, never by a
    box per district. `IsoField` is its fallback for the rest of a visit when the
    world cannot run. Each has its own host in one box, and the flat field
    stays drawn and is the one you can touch until the world has drawn its
    first frame. The camera's frame is never stored.
36. **The residue-scan exemption never grows.** It is exactly the two registry
    lines that name the first project and link its repository. Anywhere else
    that name still fails.
37. **Moodboards are never shipped.** `references/visual/` is git-ignored.
    Never commit, trace or reproduce that artwork.
38. **No integration the brief did not ask for.** No AI, backend, proxy, auth,
    cloud sync, Notion, OpenAI, Anthropic, GitHub API or private repository,
    and no guessing at whether a Claude session is running. Status is explicit
    data: recorded here, or published by a public repository as
    `PROJECT-STATUS.json` and read from GitHub's raw host with nothing attached
    — no token, no credentials, no referrer. Never infer a status from commit
    frequency, test counts or a version number.
39. **Dev server on port 8398.** Port 8391 is shared by other projects on this
    machine, and one localhost origin means their service workers replace
    each other.
40. **A backup is an allowlist, both ways.** Export only what
    `backupMissionControl` builds from `BACKUP_FIELDS`: recorded project
    states. Never private links, drafts, preferences, recovery snapshots,
    source choices, fetched repository status or unreadable records — keeping
    unknown data locally is not permission to export it. Import accepts only
    project states, rebuilt from the same allowlist, never restores, merges or
    deletes private links, and never changes which record a project shows;
    say so when a file held links, and when an imported state is kept behind
    a repository status. Contract 26 guards all of it.
41. **Say the shared origin plainly.** Every app on `morecobrax-dot.github.io`
    shares one browser origin. The storage prefix keeps names apart, not
    access. Never describe it as isolation, never claim how iOS Safari or a
    Home Screen app treats storage without evidence from a device, and never
    claim a link opens the ChatGPT or Claude app on the strength of a browser
    test.
42. **The registry has no ceiling.** The six required projects come first;
    a new record needs no other change, and a look it does not have yet falls
    back to `generic`. Never write code or a test that assumes six is the
    maximum.
43. **One effective state, two kept records.** A project shows its manual
    record or its repository snapshot — never a blend, field by field or
    otherwise. An unrecorded project adopts a valid repository status and the
    choice is saved at once; a project with a manual record switches only
    when the person chooses. A connected project has no editor (that would be
    a hidden override); saving in the editor chooses your own state; clearing
    one shows Needs update. Switching never deletes either record. Contract 28.
44. **A status file is refused whole.** `validateStatusFile` checks every key,
    type, status, limit and time; a newer `schemaVersion` is unsupported,
    never half-read; remote text is plain text, escaped when drawn. Every
    failed check keeps the last valid snapshot and its fetch time, and an
    older copy never replaces a newer one. Contract 27.
45. **Ask when due, never on a timer.** On open (after the first render), on
    return to the foreground, and by Refresh: 15 minutes after an answer, a
    minute after a failure that may pass, an hour after a 403 or 429. One
    request per project in flight, an 8-second timeout, nothing sent offline.
    `updatedAt` is the publisher's time and `checkedAt` the device's: never
    show one as the other. Contract 29.
46. **Identity never wears a status colour.** Every `--tint-*` stays at least
    ΔE 20 (CIELAB) from every `--sig-*`, and a beacon is lit only by a known
    state. Contract 24 measures both.
47. **A toast is never touched.** It has no controls and `pointer-events:
    none`, so it can never take a tap meant for what lies beneath it.
    Contract 8.
48. **The publishers' checker lives here, and only here.**
    `scripts/project-status.js` is copied byte for byte into every
    publishing repository and must stay identical to the reader: change the
    contract in `validateStatusFile` and the checker together, keep contract
    27 green, bump `CHECKER_REVISION`, then copy the file unchanged to each
    publisher (never edit a copy there). Its secret rules are generated from
    `scripts/secrets.js`, not retyped. `version` in a status file is the
    publisher's release version and claims nothing about deployment, QA or
    stability.
49. **The world is one loop, on demand, and a frame never measures.**
    Nothing draws while the world is hidden, covered, off screen or lost; it
    draws at up to about 60 frames a second, lowers its resolution rather
    than its frame rate, and life settles after five untouched minutes.
    Slow frames lower the resolution only when the frame's own measured cost
    fills the gap (`shouldStepDown`): a screen presenting at 30 Hz is not a
    slow renderer.
    Labels and the card move by transform and are measured only when their
    words or room change — never read layout in a frame. Reduce Motion makes
    every move instant and stills every crew and every place. Status lights
    only the beacon, the helmet and an authored place's rim, and only when
    known — no record, no light, no worker. A place's life moves only while its project is known to
    be under way (never unrecorded, blocked or paused). A place is a place,
    never a progress bar: no levels, counts or completion, and its life never
    speeds up or counts with anything. The card says only what the record
    holds, and only the place in focus has one. A crew's acknowledgment
    plays on the change itself, never on a reload.
50. **Three.js is vendored, pinned and made one way.** Change it only with
    `scripts/vendor-three.js` (version, tarball integrity and esbuild pinned);
    never edit `vendor/three/three.min.js` — contract 30 holds it to its
    sha256. A file the app loads is found by `npm run config:sync`
    (`scripts/release.js`), which ships and precaches it.

51. **City ambience is not project activity.** The user authorized connected
    city blocks and, in Living City 1 (0.9.2), exactly one small service
    truck and two passers-by; more city life needs its own brief. These are
    decorative city life, using pure bounded paths with no project-state
    inputs. Real crew poses,
    stations, beacons and attention remain derived from project records.
    Roads imply no software dependency, throughput or agent execution.
    Their routes are explicit, in `world.js`, and nothing else: the truck
    drives one circuit of the ring road (`DRIVE`, `driveAt`), keeping right
    and slowing for each turn, its whole body clear of the promenade, every
    block, parked car, tree and the canal and its wheels on the road; each
    passer-by walks one short stretch of paving in its own part of the city
    (`walkWays`, `walkerAt`), never onto a road, stopping on the way and
    turning round standing. No pathfinding, collision, traffic or time of
    day. The passers-by are authored in Blender (`street_life.py`,
    `street-life.glb`, `STREET_BUDGET`) from the crew's figure and are never
    crew: no helmet, no status material, never a tap.
    They share the world's one clock and its visibility/reduced-motion-aware
    scheduler; no separate loop, timer, network source or persisted
    simulation. Under Reduce Motion and once life settles they hold where
    they are, standing.
    The city itself (`cityPlan` in `world.js`: blocks, streets and lanes,
    the one canal, bridges, trees, lamps, parked cars) is computed from the
    places' positions alone, the same every time, for any number of places,
    and merged into a few draws; it never reads a record and never says
    anything about one. Nothing tall stands in front of a place. Contract 30.
52. **Lighting is art-directed, not a claim of real GI.** One rig for the
    whole world, from the Blender master (`LIGHT` in `world.js`): a warm key
    sun that casts, a weak cool fill and rim, and the Blender world's
    gradient as a hemisphere light. Keep Blender's split of the faces (the
    face that fills the view lit, the one to its right in shade, shadows to
    screen-right), not its angles. PBR Neutral tone mapping. The prefiltered
    sky is reflected only by glass and metal, never sampled by every pixel.
    One shadow map, cached; it refreshes only while an authored worker moves
    and its place is drawn large. Keep colours in tokens and assets local.
    Measure the frame's full cost (`measure()`, QA only) after changing art
    or light, preserve fallback and dispose the shadow target with other
    resources. Since 0.9.0 it is daylight over a bright city on a warm ivory
    ground (brighter, warmer, softer; the lit face still gets over three
    times the shade face's light); the page's chrome stays dark. Every city
    surface colour stays at least ΔE 20 from every status hue (contract 30).
53. **Blender owns an authored place; the app drives it.** A look with a GLB
    in `ASSETS` is drawn from it: never rebuild or retouch its geometry or
    materials in Three.js, and fix a material that translates badly where it
    is exported (`export_glb.py`). Its status material, dimming and crew
    clips are driven from the scene the app gives, through `assetCrew`;
    nothing in the file decides a status. Its rise is measured from the
    file. It is set into its city block by placement alone (`assetFloor`:
    the platform's dark lower plinth just under the paving, its numbers
    taken from `mc_platform.py` and held there by contract 30); never cut,
    trim or recolour a file to fit the city. The look's recipe stays as its fallback. A new authored place is a
    Blender export, an `ASSETS` entry and `npm run config:sync` — never code
    per project. Its crew is one skeleton (`<role>__<bone>`) and its own
    life is the `MC_LIFE` clip on `mc_life` nodes only.
54. **An authored place fits its budget before it ships.** `DISTRICT_BUDGET`
    (`world.js`, the same numbers in `export_glb.py`) caps draws, triangles,
    materials, workers, bytes and textures; the export fails loudly over it
    and contract 30 fails the file. Meet it by packing (joining a material's
    meshes, colour families, one crew, compact vertex data), never by
    flattening the model, baking away a status light, dropping a worker or
    merging materials that look different. A pass that visibly changes a
    Cycles render is rejected. Raise the budget only with measurements, and
    keep `BUDGET` able to hold six places at it.
55. **One release at a time, verified.** Every file the page loads ships
    under a content-hashed name in `release/`, generated with its sha256 by
    `npm run config:sync`; never add a runtime file by any other path, never
    load one at an unversioned address, and never let `import()` take a
    non-literal. The worker installs a release only when every file is the
    exact bytes (a 200 is not proof), serves a page only its own release,
    never answers a file with the page, never reloads a page and never
    claims one; an update activates when the person taps it or the app
    reopens. Activation keeps exactly one earlier release and removes only
    this app's caches. The 0.7.0 transition is the one takeover. Contract 31.
56. **Chosen and in focus are two states, and the app owns both.**
    `selectedId` is the choice: stored, shown in the dock. `focusedId` is
    this visit's focus: never stored, set by `focusProject` (a tap, a swipe
    through `navigateProject`, a Needs-attention button) and cleared by
    `leaveFocus` (Overview, Escape). Only the project in focus carries a
    card, and only a tap on it opens its brief; the overview, a relaunch and
    the world's first draw have nothing in focus, so nothing there offers
    the brief (0.8.0 kept one value for both, and said "Tap again for the
    brief" over a project nobody was looking at). A swipe never opens a
    brief. Contracts 23, 24 and 30.
57. **One way the camera moves, and a drag is decided once.** Every move —
    overview, focus, the next place, back, a pan settling — is a
    `planFlight` flight from where the camera is, at the speed it already
    has, landing exactly on its frame; instant under Reduce Motion. A drag's
    axis is decided as it starts: in focus a clearly sideways one swipes
    (`swipeVerdict`: far enough or flicked, never a twitch or a flick back);
    every other drag pans (rule 58). The next place is reading order, never
    round the end; a swipe is reported once. Only the view's own lost
    capture ends a drag (a touch's implicit capture moving to the view is
    not a cancel). Labels readable where the camera goes are decided as it
    leaves, and a label whose words change glides; none jumps or flickers.
    Contract 30.
58. **The world owns every touch that starts in it, and the hub is one
    screen.** The view is `touch-action: none` to its square corners (only
    what is drawn is rounded), so no drag there is ever the page's: 0.9.0
    left up and down (`pan-y`) and its rounded corners to the page, and on
    an iPhone a drag from the world's edge or empty ground moved the page.
    Fix touch ownership where it lives, never with a global
    `preventDefault`. A pan keeps the ground under the finger (`groundAt`)
    wherever the camera may rest (`panRest`) and past that only gives,
    bounded (`WORLD.pan`); at the overview while the whole city is in view,
    and in focus, the camera rests on one frame, so a drag gives and
    settles back instead of travelling empty space. No orbit, zoom or pinch.
    Whatever else sends the camera (`goTo`) ends a drag under way where it
    is drawn. With the world, `fitField` makes the hub one screen
    (`html.hub-screen`): nothing to scroll on an upright phone, an iPad or
    a desktop window; a phone on its side is the exception and scrolls by
    its chrome. Contract 30.
