# Product design

The rules this foundation encodes. They are not preferences — each one is here
because ignoring it produced a real defect in a real shipped product.

Where a rule is enforced by a test, that is noted. The rest are judgment, and
judgment is what code review is for.

---

## Mobile first, on real devices

Design for a phone held in one hand, then let it widen. A desktop screenshot
proves nothing: the failures are the notch, the home indicator, the software
keyboard, the rotation, and the thumb.

- Editable inputs render at **16px minimum**. Below that, Safari on iOS zooms
  the page on focus and does not zoom back out. *(enforced)*
- Actionable targets are **at least 44px**. The visible mark can be smaller —
  the target is what must not be. *(enforced)*
- Safe-area insets are read on **all four edges**. Left and right matter in
  landscape, which is where most implementations discover they forgot. *(enforced)*
- Automatic text inflation is off, pinch zoom is not. Turning off zoom entirely
  removes an accessibility affordance to fix a layout bug. *(enforced)*
- Landscape reclaims vertical space rather than clipping content. *(enforced)*

## One obvious primary action

A screen with five equal buttons has no primary action, and every tap becomes a
decision. Give the workflow's forward action the weight; let everything else
recede.

- The primary action takes the room; the secondary yields.
- A destructive action does **not** wear the loud button. If confirming a
  deletion is the most prominent thing on screen, the design is pushing toward
  the outcome nobody wants. *(enforced)*
- An action that only makes sense at the end of a flow exists only at the end
  of it. Offering "finish" on step one puts the loudest control on screen
  against the thing that has not been done yet.

## Two surfaces, and only two

- A **sheet** is a decision or a short form. It rises from the bottom, carries
  buttons, and is dismissible where nothing would be lost.
- A **page** is a destination you navigate into. It fills the screen, carries a
  back control sized like navigation, and answers the device back gesture.

Refusing to invent a third surface type is what keeps an app with dozens of
overlays feeling like one app. If something does not fit either, the
information hierarchy is usually the real problem.

## Progressive disclosure

Beginners see simplicity. Depth appears when it is asked for.

Optional things stay optional and say so. A step that can be skipped is
skippable without penalty, and skipping is a visible, ordinary choice — not a
hidden one.

## Hierarchy before decoration

If a screen is unclear, the fix is grouping, spacing, weight and order — not
another gradient, another border, another card.

**No card soup.** Reach for typography, whitespace, grouping and a divider
before another container. A page where everything is in a card is a page where
nothing is emphasised.

Colour carries state, never decoration. And it never carries state *alone*: a
status shows a word and a shape as well as a hue. *(enforced)*

## One control, one predictable result

- A visible control must work. A tap that does nothing — because its target is
  inside a hidden parent, or painted underneath the surface above it — is worse
  than a disabled control, because it teaches distrust.
- Validate before mutating. Clearing state and *then* discovering the target is
  missing leaves a screen nothing can recover. *(enforced)*
- The same tap gives the same result. A tab opens at its top rather than
  wherever it was left. *(enforced)*
- A toast is read, never touched. It has no controls, so it takes no taps:
  one that did sat over the state editor's lower fields for three seconds,
  and the words typed there went nowhere. *(enforced)*
- Motion respects `prefers-reduced-motion`, everywhere, not on the animations
  someone remembered. *(enforced)*

## Truth over impressive fiction

- If storage cannot persist, say so on screen. Do not let someone discover it
  by losing their work. *(enforced)*
- A write is only "saved" if it landed. The storage adapter returns a real
  boolean for exactly this reason. *(enforced)*
- Unknown is a legitimate state. An empty field is unknown, not zero, and it is
  never "repaired" with a plausible default. *(enforced)*
- Do not fabricate precision — a score, a projection, a confidence — that the
  data cannot support.
- Empty states say what the area is and offer one action. They do not pretend
  to be full.

## No parallel sources of truth

- Derive; do not duplicate. The app version *is* the newest release entry. The
  cache name *is* derived from `APP_ID` and that version. The storage prefix
  *is* derived from `APP_ID`. *(enforced)*
- Do not persist what can be derived. Store the historical record; compute the
  presentation. A stored total is a total that can disagree with its parts.
- Drafts live outside committed data. That separation is what makes a
  half-finished record structurally incapable of being counted. *(enforced)*

## One mechanism, not N remembered pairs

The single most valuable architectural rule here.

Anything that must happen for *every* instance of something — locking the page
behind an overlay, restoring focus, ordering what paints on top — is
implemented **once**, driven by observed state, never as an open/close pair
that each new surface has to remember. A pair can be forgotten by the next
person. An observer cannot. *(enforced: exactly one observer)*

## Accessibility is structural

Not a polish pass.

- Semantic elements: `nav`, `main`, real `button`s.
- Every icon-only control has a label. *(enforced)*
- State is exposed, not just painted: `aria-selected`, `aria-checked`,
  `aria-invalid`, `aria-modal`. *(enforced)*
- Errors are announced and tied to their field. *(enforced)*
- Focus is visible, trapped inside a dialog, and returned to the control that
  opened it — if that control still exists. *(enforced)*
- Hidden-but-available content uses a clip technique, not `display:none`.

## Premium means restraint

Premium is hierarchy, deliberate spacing, clear actions, useful contrast,
coherent depth and predictable interaction.

It is not gradients everywhere, glow everywhere, endless cards, decorative
animation, or grey text on grey.

Spend emphasis in one place per screen and keep everything around it quiet.
One accent gradient, used only where forward motion is meant — never as
ornament.

## Root cause over UI patch

If a control is being tapped twice, find out why the first tap did nothing.
Hiding a symptom moves the bug rather than removing it, and the next person
inherits both.

**Write the reason, not the change.** When a non-obvious decision is made,
record the failure that caused it. Every unusual line in this codebase carries
one, which is the only reason it can be audited at all.

## Mission Control

The product's own rules, on top of everything above.

- **It reduces the mental load of running many projects.** The world exists
  to make project state easier and more enjoyable to understand. It must
  never become a beautiful interface that hides the information you actually
  need: every platform also says its name, its status in words, and what it
  needs from you.
- **Attention first, then the world.** The hub answers "what needs me?"
  before anything else: quiet counts, then one line — what is blocked,
  waiting on a decision or ready for QA, in that order, each a one-line
  button to its brief, and how many states are unknown. The world follows at
  once and is the focus: the top stays compact so every place and label
  is on the first screen of a phone, a phone on its side and an iPad, above
  the tab bar.
- **One island you look at, not one you fly.** Every project is a district
  on one island, seen through a fixed camera with gentle depth: no orbit, no
  zoom gesture, and nothing joins one project to another. Tap focuses,
  Overview shows everything, a drag inside the world looks around the island,
  and the page scrolls everywhere else. A drag never opens anything. Moves
  are short and can be interrupted; with Reduce Motion they are instant.
- **Smooth before rich.** A frame only moves things; it never measures the
  page. Detail and life never cost a tap its response: on a device that
  cannot keep up, the world draws at a lower resolution rather than slower.
- **The first tap says where things stand.** A sign rises over the tapped
  place with its status and everything that needs you, in the brief's words
  and shapes, and says that a second tap opens the brief. It shows only what
  the record holds: no count, score or trend it cannot support.
- **The selection is always actionable.** The selected project's name, its
  one dominant status and a Brief action sit in a slim dock under the world,
  above the tab bar, whatever was panned, focused, rotated or reopened. It is
  a pointer to the brief, not a second brief: the details live there.
- **Attention is short because the row says why.** Each button says only
  what the project needs — Decision, QA, or what is blocking — and its
  accessible name says it in full. It is never hidden behind a control.
- **One status per label.** A label says the project's name and one status —
  what needs you, if anything does — in words and a shape. Labels are type,
  not boxes: a chip only for what needs you, a backing only for the
  selection. The brief says the
  rest. Labels never shrink as projects are added; the world pans instead. A
  label that cannot be read without covering another is not shown, and cannot
  be tapped.
- **Places, not progress bars.** Each project's place says what the project
  is, drawn from what it really is. Nothing in it counts, fills or levels up;
  no building appears because a project is further along.
- **The crew shows the state and nothing else.** A worker's station and pose
  come from the state alone. No record, no worker. A release-ready worker
  raises an arm once, when it becomes ready — never again on a reload.
- **A place is alive only while its work is.** Each place does its own thing
  — runners on the track, plates on the belt, pages turning — only while its
  project is known to be under way. Where nothing is recorded, where work is
  blocked or paused, and under Reduce Motion, it holds still. Life never
  speeds up, grows or counts with anything.
- **One focus.** One tap focuses a project, a second opens its brief. The
  focus is remembered, because it is what you come back to.
- **Unknown is not a status.** A project with no recorded state says "Needs
  update" — in words, with its own shape, never as a status chip — and is
  counted as a project, not as active or as needing you. Nothing is invented
  to fill the gap.
- **Unknown says "Not recorded".** It is never filled with a plausible guess.
- **Say only what is known.** "Nothing needs you right now" is a claim about
  every project; while any state is unknown, the hub says "No recorded
  attention items" instead.
- **One record at a time.** A project shows the state you recorded or the
  one its repository published — never a blend of the two. A published
  status is adopted only by a project nobody had recorded; otherwise
  switching is a visible choice in the brief, and it keeps both.
- **A source is provenance, not a status.** A connected project says "From
  repository · updated 3 days ago", quietly and with no signal colour, and
  its brief says which file it came from. A failed check is said in words
  beside what is still shown.
- **Two times, never confused.** "Updated" is when the project's status was
  written; "Checked" is when this device last asked. Asking again never
  makes old news look new.
- **No state, no light.** A beacon is lit only by a known state; an unknown
  project's lamp is a ring. Identity light — the lit lip, the accent rim, the
  pool under the project in focus — belongs to the place, and every accent
  stays at least ΔE 20 from every status colour. *(enforced)*
- **A backup is yours, and only yours.** It carries recorded project states,
  never private links, source choices or fetched status, and the Backup page
  says exactly that.
- **Private stays off the screen.** A tool shows where it goes (its host),
  never the conversation or session it opens.
- **Actions appear only when they work.** A tool that is not set up is not
  shown; the brief says where to set it up instead.
- **Motion carries meaning or nothing.** Only a project that needs you
  breathes, and only a crew with work to do moves; blocked stands still and
  paused sits. Motion settles a minute after you last touch the world, and
  stops whenever it cannot be seen. Reduced motion stops all of it.

## Real-device QA before shipping

Install to the home screen. Test offline. Rotate it. Turn on reduced motion.
Open the keyboard on every form. Six viewports minimum, portrait and landscape.

A change that looks right in a desktop browser has not been tested.
