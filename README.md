# MAGNET YARD: SCRAP RUSH

An original stylized 3D browser game prototype, built independently with Three.js, TypeScript and Vite.

## Current milestone — v0.2 playable game iteration (not final release)
- One original 3D industrial scrapyard with recycler and two moving crushers
- Hovering magnetic drone, keyboard/arrow-key movement, mouse click-to-move and touch joystick
- Three scrap materials: steel, copper and heavy alloy
- Automatic magnetic attraction and visible orbiting cargo
- Material matching streak bonuses, cargo mass handling penalty and crusher cargo loss
- Automatic recycler deposits, coins, 90-second shifts and results
- Three permanent upgrades: magnet radius, cargo capacity and handling
- Local browser progress saving and synthesized feedback sounds
- Responsive HUD, pause, restart and upgrade workshop

## What's new after user Android + laptop feedback (v0.2)
- More readable desktop/portrait camera and responsive UI.
- Recycler direction compass, current shift contract and permanent contract rewards.
- Cargo instability when turning sharply with a heavy magnetic orbit.
- Animated WebGL particle effects for pickup, bank and crusher hits.
- Fairer timed crusher press collisions.
- Optional sound mute.
- Guarded CrazyGames SDK lifecycle foundation (not yet a submission-tested integration).
- Repeatable automated desktop/mobile browser gameplay tests.

Read PROJECT_STATUS.md for the exact continuation checkpoint, completed tests and all remaining release gates.

## Start on the connected Windows laptop
**Easiest:** double-click PLAY_GAME.cmd in this folder. It launches the local game server and opens the browser. Keep the server window open while playing.

Alternatively, open PowerShell in this project directory, then run:

    npm.cmd install
    npm.cmd run dev

Open http://localhost:5173/ in Chrome or Edge.

If the dev server is already running, just open http://localhost:5173/ .

## Build check

    npm.cmd run build
    npm.cmd run test:e2e

The build command validates TypeScript and creates a production site in dist/. The e2e command requires installed Chrome and runs automated desktop/mobile gameplay smoke checks.

## Controls
- WASD / Arrow keys: move drone
- Left click / drag on ground: click-to-move
- Android touch: on-screen joystick
- U: open workshop
- Escape: pause / resume
- R: restart shift
- Enter the glowing cyan recycler ring with cargo to bank coins

## What to test
1. Collect nearby scrap within 10 seconds of moving.
2. Check that metal visibly circles the drone.
3. Notice heavier cargo slowing the drone.
4. Return to the cyan recycler and confirm coin rewards.
5. Buy an upgrade and verify it persists after browser refresh.
6. Try both moving crusher zones and observe cargo loss / time penalty.
7. Complete a 90-second shift, then restart.
8. Test Chrome/Edge desktop and Android browser touch input.

## Project isolation
This folder is new and separate. It does not use or modify REALM RUSH, NEON APEX, FALL//FORGE, SHADOW STRIKE, JOBPATH INDIA or ByteBright sources.

## Release limitations (important)
This is a first prototype, not a CrazyGames submission candidate. It still needs full real-device QA, performance profiling, gameplay balancing, refined visuals, accessibility, mute/settings UI, more content, SDK integration, covers and preview media. No publication or revenue is guaranteed.

## v0.3 gameplay additions
- MAGNET SURGE: Space on laptop, touch MAGNET SURGE on mobile.
- The burst lasts 3.5 seconds, pulls scrap faster from farther away and has a 16.5-second cooldown.
- Overdrive cannot be triggered when paused or from the upgrade shop.
- Every completed shift records your best banked coin total and lifetime shift count.
- Crushers show amber (safer) versus red (danger phase) rings.
- Saved coins, upgrades and contracts from v0.2 remain in the same local save key.
## v0.4 priority delivery
After completing at least one recycler deposit, collect another glowing purple rare alloy.
A one-time 18-second priority bonus of +70 coins becomes available this shift if the alloy is banked in time.
Missing the timer never loses the scrap itself. Magnet Surge is available during the rush.
Two new yard gantry cranes, ground navigation markings and rare alloy beacons are original geometry.

## v0.5 graphics quality and score ranks
Pause the game to select Eco, Balanced or Crisp rendering. Eco is a recommended first choice
for weaker Android devices. This setting persists in the existing local save without changing
coins, upgrades or contracts. The pause dialog also shows recently measured running FPS
(for local diagnostics only; true sustained device performance requires real-world playtests).
Completed shifts earn Trainee/Bronze/Silver/Gold ranks based on banked shift coins.

## v0.6 graphics polish
The drone now has original animated rotors, extra neon trim, dynamic magnetic arcs and an
instanced motion trail. The recycler has a moving halo, and the yard has subtle dust particles.
The Eco quality setting hides the optional trail, dust, secondary field ring and dynamic light
to reduce draw and shader work on weaker Android hardware. The underlying gameplay, save
format, upgrades and priority delivery mechanics are unchanged. 
## v0.7 Golden Salvage
Three original glowing gold caches spawn about 12, 40 and 68 seconds into each
90-second shift. Each stays on the yard for up to 16 seconds while uncollected.
Collect with your magnet and return to the cyan recycler to earn at least 60 coins
per core. Heavy gold cargo remains subject to ordinary handling and crusher risk.
A visible gold objective panel shows distance and remaining time on mobile/desktop.
There are no ads or payment hooks required for this local playable version.
## v0.8 first-play start screen
The run begins on an interactive menu with a Start 90-Second Shift button.
The 90-second timer remains paused until the Start button is clicked/tapped.
Desktop controls: WASD/arrows, click to move, Space for Magnet Surge.
Mobile controls: on-screen joystick and Magnet Surge button.
Existing localStorage save data remains compatible and shows prior personal best and shift count.
Closing or switching away from the game tab pauses an active run; the game can be resumed manually.
## v0.9 mobile render optimization
All scene primitives now reuse GPU geometries and duplicate metal/matte
materials are cached. Mobile devices disable the hardware MSAA setting while
desktop keeps it, and the existing Eco/Balanced/Crisp choices control
instanced particle budgets at 48/96/144. The game also avoids rendering while
hidden to save mobile battery. Existing save format remains compatible.
This does NOT certify real phone FPS or thermals: Chrome emulation is not real hardware.
## v0.10 portable preview
Vite base is now relative (./) so the same production files work under a nested
folder, without hardcoded /assets paths. The portal-preview ZIP contains
index.html and assets/ at its top level; extract it into a static web-server
directory to review it. The installed CrazyGames lifecycle adapter is only
verified against a local browser mock. No actual SDK, ads, submission or
review approval is represented by this ZIP.
## v0.11 Final Sprint
For the final 20 seconds of each shift, the drone receives a temporary 25%
magnetic reach increase. Recycling during this window adds a 25% bonus to the
base value of that deposit. The timer glows amber and the usual objective
explains the bonus. No special input is required. Permanent upgrades and
localStorage game progression remain compatible.
## v1.0 local release candidate
A tested local browser build includes the 90-second original arcade loop,
Golden Salvage, Priority Delivery, Final Sprint, three upgrades, save data,
desktop/mobile controls, render presets, and graphics polish.
New original artwork lives in public/cover.svg, public/icon.svg and PNG builds.
Promo screenshots are in promo/. Local privacy/credits pages are in public/.
CrazyGames v3 SDK script loading occurs only when a CrazyGames host or embed is
detected (or through the development-only mocked QA path). The SDK is NOT
certified against a live CrazyGames session or platform policy in this release.
A separate GitHub repo and public hosting have not yet been created.
See GAME_LISTING.md and DEPLOYMENT.md for handoff details.