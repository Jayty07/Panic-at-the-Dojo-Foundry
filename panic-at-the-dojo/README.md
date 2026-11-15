# Panic at the Dojo: Patch'd Up — Foundry VTT system

Unofficial system for **Panic at the Dojo 2e (Patch'd Up)** by Vel Mini. Foundry **v13–v14**, works on **The Forge**.

## Install on The Forge
1. Forge → **My Foundry** → **Import Wizard** (or the Bazaar's *Import* button).
2. Upload `panic-at-the-dojo.zip`. Turn **off** "install from the Bazaar" if asked, so the zip itself is used.
3. Do the same for `patd-hero-builder.zip` (the character creator module).
4. Create a world using the **Panic at the Dojo: Patch'd Up** system, enable *Panic at the Dojo: Hero Builder*,
   and (recommended) **Bar Brawl**, **Isometric Perspective**, **Sequencer** and optionally **JB2A (free)**.
5. On first load as GM the system builds world compendiums with every Form, Style, Freestyle, Archetype,
   Super Move, Build, Warrior's Path, Villain Archetype and Skill (Settings → *Panic at the Dojo Tools* to rebuild).

Self-hosted: unzip into `Data/systems/` and `Data/modules/`.

## What's in it
- **Actors:** Hero, Warrior, Boss (2–6 Health Bars, one turn per bar), Stooges (one linked unit, member count).
- **Items:** Stance (Style + Form, auto-built range/dice/Armor), Form, Style/Freestyle, Archetype (Focused/Fused/Frantic/Villain), Build, Super Move, Skill, Action, Warrior's Path.
- **Cinematic Weight** world setting drives HP per bar, Heal Value, Bleed Value and Super limits. Level adds Bonus Die and HP.
- **Turn flow:** Start Turn (stance pick, Bleed Abilities for Focused/Fused/Frantic, Heroic Spirit, Too Slow, extra dice) → Action Dice roll (Dice So Nice compatible) → click **Use** on any Action, pick the number to spend; gates you didn't pay for are struck out → End Turn (Burning, Challenge, Fatigue, Speed discard, pools emptied, Dizzy ends).
- **Damage** follows WEPIA: Iron, Shield, stacking Armor (3/2/1) and temporary Armor; health bars break without carry-over, Dizzy, Bleed once per round, Taken Out.
- **Super Moves** need two matching numbers of 3+, blocked in Round 1 and once per fight; tracked per side per Round on the meter.
- **Initiative Meter** (lightning button in token controls / combat tracker): alternating Hero/Enemy(/Renegade) slots built from Health Bars, anyone on the side may take a slot, bosses take multiple turns, The Fight Must Go On!, Battle Parameters, fight reset.
- **Stance Checks** for all Tests and Contests with Skill bonuses.
- **Chat effect buttons:** Deal damage (defender chooses Iron/Shield), Push/Pull/Move/Teleport with an on-map destination picker, Gain/Give tokens, Shield, Challenge, Swap, Temp Armor. Players can affect tokens they don't own; the GM's client applies it.

## Bar Brawl + Isometric
New actors/tokens get three Bar Brawl bars above the token: **HP** (red→green), **Health Bars** (purple→gold) and **Shield** (hidden when empty); Stooges also get a member bar. Use *Tools → Apply Bar Brawl bars* for existing tokens.
In isometric scenes the system stands the bars (and nameplate) upright and pins them **above the token art's head** every frame. Client settings: offset, scale, nameplate on/off.

## Sequencer
With Sequencer active, Actions shout their name in comic lettering, hits get impact bursts and "POW!" text, pushes leave an afterimage, teleports puff, Supers get a full-screen α/Δ cut-in with screen shake, and K.O./bar-break/bleed callouts appear. JB2A is used when installed; otherwise shapes and text are drawn. Movement uses Sequencer's crosshair (falls back to click-to-place).

## Not in the beta rulebook
The beta PDF stops before the detailed Boss and Stooge chapters, so Bosses use the Warrior HP table by default (adjust *Extra HP per bar*), and Stooge-specific rules are left to the GM.

Rules content © Vel Mini, CC BY-SA 4.0. See LICENSE.txt.
