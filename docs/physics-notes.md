# Physics notes

Why the agent tools compute what they compute. Read `CLAUDE.md` for the design
principle this document exists to defend.

## The problem with the delta v we had

`MissionState::transfer_delta_v` in `mining-physics/src/lib.rs` models a
Hohmann transfer between two **Earth orbits**. It uses Earth's gravitational
parameter and treats the asteroid's distance as an altitude above Earth's
surface:

```rust
let mu = 3.986e14_f64; // Earth gravitational parameter
let r1 = 6.731e6_f64;  // LEO radius (m)
let r2 = self.distance_km * 1000.0 + 6.371e6;
```

Asteroid transfers are heliocentric. Past a few million km the `r2` terms go to
their limits and the result stops depending on the target. Measured by running
the compiled wasm directly, ship 2400 kg dry with 800 kg of fuel:

| Target | Distance km | transfer_delta_v m/s |
| --- | --- | --- |
| 2011 UW158 | 64,000,000 | 3264.7 |
| Bennu | 168,000,000 | 3235.6 |
| 433 Eros | 218,000,000 | 3229.8 |
| 1986 DA | 280,000,000 | 3224.9 |
| 16 Psyche | 370,000,000 | 3220.0 |

A 1.4 percent spread across a 5.8x range of distance, and it runs the wrong
way: Psyche, the farthest target, reads as the cheapest to reach. An agent
asked to pick the best target from these numbers is choosing noise.

Two more things that fall out of the same run. The default ship in the
simulator has a delta v budget of 920.6 m/s against a transfer requirement of
about 3230 m/s, so the shipped configuration cannot reach anything until the
operator raises the fuel load. And `fuel_for_delta_v(3000)` returns 3728.6 kg
for a ship carrying 800 kg.

## What we do instead

**Delta v comes from JPL.** The NHATS API returns real mission delta v per
object, computed from actual trajectory solutions. Verified against the live
API: a query at `dv=6, dur=450, stay=8` returns 730 objects, each with
`min_dv.dv` in km/s and `min_dv.dur` in days, plus `min_size`, `max_size`, `h`
and an orbit condition code.

The engine then does what an engine is good at: given a delta v, a dry mass and
a payload, it computes propellant, mass ratios, durations, yield, cost and the
mission timeline. That split is honest and it is also the better demo, because
every number on screen either came from JPL or from a deterministic function
with a unit test behind it.

`transfer_delta_v` stays in the code so the existing simulator keeps working.
The agent tools do not call it.

## The rocket equation needs the payload

`fuel_for_delta_v` uses `ship_mass_kg` as the dry mass and ignores cargo:

```rust
let exp = (dv / self.exhaust_velocity).exp();
self.ship_mass_kg * (exp - 1.0)
```

The return leg is the expensive one precisely because the ore is aboard. The
tool version takes dry mass plus payload so that a heavier haul costs more
propellant, which is also one of the sanity tests.

## Scale

The simulator's ship holds 1000 kg of ore. That is one ton, so a goal phrased
as 500 tons is impossible for every configuration that exists today. The ship
catalog introduced with the tools uses realistic capacities. At the current
extraction rate of 0.8 kg/s, 500 tons takes about 7.2 days of continuous
mining, which is a reasonable mission length, so the rate survives and the
capacity does not.

## Composition is an estimate and says so

`AMD.jsx` derives a platinum group metal score by searching the object's name
for a parenthesized spectral class:

```js
if (n.includes("(M)") || n.includes(" M ")) return "M";
```

JPL designations do not carry spectral class, so this falls through to the S
class default for effectively every object, and the value axis of the whole
app is a constant.

SBDB does return real physical parameters. Verified against 433 Eros: diameter
16.84 km, H 10.40, G 0.46, GM, density, extent. But taxonomy is frequently
absent. 1986 DA is a well known M type and SBDB returned no spectral field for
it at all.

So composition is reported as a class when a class is known and as unknown
otherwise, and the per ton value is returned by `get_assumptions` with its
source, labeled in the UI as an assumption rather than a measurement.

The orbital elements drawn in `AMD.jsx` come from `Math.random()`. They are
decoration for the 3D view. Nothing the agent reasons about reads them.

## Constants and where they come from

`diameterFromH` in `AMD.jsx` is the standard magnitude to diameter relation
with an assumed albedo of 0.2, and it is correct. It stays.

Ship specs in the existing simulator: exhaust velocity 3200 m/s (a plausible
ion thruster), thrust 450 N, extraction rate 0.8 kg/s. These are reasonable
and they are now declared as assumptions rather than buried in a constructor.

One caution on `tick`: its propellant burn is
`(thrust_n / (ship_mass_kg * 1000.0)) * dt`, which is not a mass flow rate.
Mass flow is thrust divided by exhaust velocity, 450 / 3200, about 0.14 kg/s,
while the current expression gives roughly 0.00045 kg/s for a 1000 kg ship.
`tick` drives the animation, not the plan, so it is left alone, and
`simulate_mission` computes its own propellant use.

## The economics, and what I tuned

The three ships and the price list are fiction, but they are fiction with
sources, and `get_assumptions` hands the agent every one of them. Two choices
are worth stating plainly.

**Water is priced as avoided launch cost**, 2.7 million USD per ton, from the
published Falcon 9 price to low Earth orbit. That single number decides the
whole game: water bearing bodies are worth about 324,000 USD per ton of ore
while stony ones are worth about 435, a factor of 745. That is the accepted
view of why asteroid mining might pay, so it is the right number to build on,
but it is a policy figure rather than a market price and the UI has to say so.

**I raised Ion Drifter's propellant capacity from 60 to 120 tons** so that a
500 ton haul from Bennu fits. That is tuning a made up ship to make the
headline mission work, and it should be read that way. Nothing else was moved
to make the demo come out well.

What came out of it without tuning is the part worth showing on stage. Five
candidates, Ion Drifter, 500 tons:

| Target | Class | Delta v km/s | Mission days | Profit |
| --- | --- | --- | --- | --- |
| 2000 SG344 | S | 3.549 | 551 | -123 M |
| 2009 UY19 | C | 5.079 | 551 | +11 M |
| 2010 NU71 | C | 5.733 | 671 | -1 M |
| 101955 Bennu | B | 6.995 | 539 | +40 M |
| 162173 Ryugu | C | 8.248 | 551 | +11 M |

The cheapest target to reach loses 123 million dollars, and the winner has
nearly twice the delta v of the loser. Composition beats proximity, and a long
mission can wipe out a cheap one, which is why 2010 NU71 lands at break even
despite being easier to reach than Bennu. There is no shortcut to that answer
from the numbers a model already knows, which is the point.

## The ship catalogue, and what the research turned up

The three ships this engine started with were invented: a prospector, a chemical
freighter and an ion drifter, with masses chosen to make the mining scenario
work. They are gone. The catalogue is now four real spacecraft and three
haulers that say outright that they do not exist.

Every figure for a real spacecraft carries a source in `ships.json`, and a
figure nobody has published is `null`. That is not tidiness: `Ship::specs()` in
Rust returns the list of missing fields instead of the numbers, and every tool
that needs them refuses with `specs_not_published`. Vestri is the case that
forced it. AstroForge has published its mass, roughly 200 kg, and nothing else,
so there is no honest way to plan a mission with it, and the engine says so
rather than filling the gaps.

### Sources disagree more than you would expect

Nearly every mass in this file is disputed between sources, and the
`uncertainty` field on each ship records it. OSIRIS-REx is 880 kg dry per NASA's
own fact sheet, 860 kg per Spaceflight101's mission design analysis, and its
launch mass is given variously as 1,529 kg, 1,955 kg and 2,110 kg. Psyche is
2,747 kg at launch per JPL and 2,608 kg per Wikipedia. Hayabusa2's launch mass
is 600, 609 or 610 kg depending where you look, which is why its dry mass here
is derived rather than quoted. Mission costs vary by a factor depending on
whether launch, operations and extended missions are counted.

Where a rated figure and a measured one differ, the measured one wins.
Hayabusa2's mu10 thrusters are rated at 3,000 s of specific impulse and
delivered 2,740 to 2,890 s in flight, so 2,800 s is what the engine uses.

### No flown spacecraft can complete a round trip in this catalogue

This came out of the engine, not out of an opinion, and there is a Rust test
holding it in place. OSIRIS-REx carries about 1.82 km/s of delta v with an empty
hold; the easiest round trip in the 50 object dataset needs 3.55 km/s. Hayabusa2
has 3.5 km/s and misses by a hair. Psyche has 8.93 km/s and could fly 40 of the
50, and has no sample mechanism at all, so it would come home empty.

Two reasons, both honest. The NHATS delta v assumes a dedicated round trip
mission, where the real missions used Earth gravity assists and years of cruise
that this model does not represent. And a sample return probe is not a small
freighter: OSIRIS-REx brought back 121.6 g, which is the record, and Hayabusa2
brought back 5.4 g.

Rather than show a visitor "insufficient propellant" for every real ship, the
`ship_envelope` tool answers the more interesting question: how much delta v is
in the tank, how far short of the easiest trip that falls, how many objects the
ship could reach, and what it actually brought home in real life.

### What I tuned, and admitting it

The three haulers are invented and I tuned them, so the numbers are mine, not
nature's. Their specific impulses are real: 360 s for a flown methalox upper
stage, 1,800 s for the SPT-140 that Psyche flies, 2,800 s for Hayabusa2's mu10.
Everything else, the dry masses, the tanks, the holds, the costs and the design
lives, I chose so that the three of them give three different answers to the
same question rather than all failing.

At Bennu with a 500 ton target: the methalox shuttle's hold is too small, the
Hall tug's hold is big enough and its tank is not, and the ion freighter can do
it for about 48 million dollars of profit. The ion freighter's tank started at
90 tons, which left a 5 percent margin on that mission, and a demo balanced on
a 5 percent margin is a demo that breaks. It is 240 tons now. That is a tuning
decision and it belongs in this file rather than hidden in a data file.

The chemical shuttle is deliberately almost useless: it can reach 41 of the 50
objects empty and only one of them with a full hold, and that one loses money.
That is the rocket equation doing its job, and it is the clearest thing in the
app for showing why electric propulsion matters.
