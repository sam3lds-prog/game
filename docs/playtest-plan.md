# Sprint 7 — external playtest kit

Goal: confirm with real players that the tutorial is understood, difficulty feels right, faces delight rather than distract, and nothing crashes or loses progress.

## Setup
- TestFlight external group, 20–50 testers (a target, not a promise). Mix: Queens/LinkedIn-puzzle fans, casual mobile players, a few who never play logic puzzles.
- Ask testers to turn on *Settings → Share anonymous gameplay stats* (it's off by default) — only then do you get funnel data. Configure `VITE_ANALYTICS_ENDPOINT` for that build, update the privacy policy and App Privacy answers first.
- One week, then a 15-minute call with 5–8 testers.

## What to ask testers to do
1. Install fresh and play without help until Level 5. Don't read any instructions outside the app.
2. Play the Daily on at least 4 days.
3. Try Challenge mode once and Unlimited Hard once.
4. Use a hint at least once.

## Survey (after day 7)
1. Was anything about the rules unclear after the tutorial? Which step?
2. Which level first felt hard? Too hard?
3. Did the animals' expressions help, distract, or go unnoticed? (Options + comment.)
4. Did hints explain enough before you pressed Reveal?
5. Did you ever lose progress or see something broken? What were you doing?
6. Would you keep playing the Daily? Why / why not?
7. Zen or Challenge — which did you prefer?

## Signals to watch (with stats on)
- Tutorial completion rate; drop-off step.
- Level 5 completion; first level with >30% abandonment.
- Median time and hint use per size; reveal-hint share (high = too hard or unclear).
- Repeated invalid taps on the same cell (confusion).
- 9×9 abandonment; quitting right after a result screen.
- D1 / D7 return; crash-free sessions.

## Release gate (from the spec)
- Zero known P0 bugs: correctness, progress loss, entitlement, reward.
- Test suite, build, 10k generator run and catalog validation green.
- Tutorial and faces validated by testers; 9×9 operable on the smallest device in the group.
- Recalibrate campaign bands if early levels feel harder than the engine thinks.
