# Emberreach — GM Guide (v0.2)

## 1. The GM's job

- **Describe** the world, **play** the people and monsters in it, and **call for Tests**
  only when failure would matter.
- **You never roll in combat.** Foes have fixed numbers. Heroes roll against them.
  Spend your attention on narration and on your **Dread** pool instead.
- **Complications, not dead ends.** When a hero succeeds at a cost or fails, change the situation:
  an alarm, a broken tool, a new threat, a hard choice.

### 1.1 Complication ideas

Lose time · lose gear · make noise · split the party · reveal the wrong thing ·
make an enemy · hurt yourself (1d6) · give the GM 1 Dread · a foe appears · the ground gives way

---

## 2. Foe stat blocks

Foes use a small, fixed block. **There are no foe dice:** their numbers are DCs the heroes roll against.

```
NAME  (Tier: Minion / Standard / Elite / Boss)
Defense  X   (heroes roll to hit vs this)
Grit     X   (Minions: drop on any hit)
Attack DC X  (heroes dodge vs this) — Damage X
Will DC  X   (only if it has mental attacks; heroes roll Will vs this)
Resolve  X   (spells that target Resolve roll vs this; if not listed, use Defense)
Moves    X zones
Traits   passive abilities
Dread    abilities that cost the GM's Dread
```

### 2.1 Tiers

| Tier | Grit | Notes |
|---|---|---|
| **Minion** | 1 hit | Act in groups of 3–6 as a single **swarm** that makes one attack per round |
| **Standard** | 8–20 | One attack per round |
| **Elite** | 25–45 | Two attacks per round, or one attack plus a Dread ability |
| **Boss** | 60+ | Acts in **both** phases (a short turn after each hero acts), has phases at half Grit |

### 2.2 Numbers by level (guideline)

| Party level | Foe Defense | Attack DC | Standard damage |
|---|---|---|---|
| 1–2 | 11–12 | 12 | 4–6 |
| 3–4 | 13 | 13 | 6–8 |
| 5–6 | 14 | 14 | 8–11 |
| 7–8 | 15 | 15 | 11–14 |
| 9–10 | 16 | 16 | 14–18 |

---

## 3. Sample foes

**Ash Rat Swarm** (Minion swarm ×5)
Defense 10 · Grit 1 each · Attack DC 11, 3 damage (one attack per swarm) · Moves 2
*Traits:* each rat that drops lowers the swarm's damage by 1.

**Cinder Goblin** (Standard)
Defense 12 · Grit 9 · Attack DC 12, 5 damage (spear) · Moves 2
*Traits:* **Skulk.** Gains Hidden when in darkness.
*Dread (1):* **Fire Pot.** Throws a pot at a zone. Every hero there dodges vs DC 12 or starts **Burning**.

**Hollow Sentry** (Standard, broken automaton)
Defense 14 · Grit 14 · Attack DC 12, 6 damage · Moves 1
*Traits:* immune to poison and fear. Takes double damage from Shatter and other thunder effects.

**Reach Wolf** (Standard)
Defense 12 · Grit 10 · Attack DC 12, 5 damage · Moves 3
*Traits:* **Pack.** +2 damage if another wolf is next to the target.
*Dread (1):* **Drag Down.** A hit knocks the target prone.

**Smoke Wraith** (Standard, undead)
Defense 13 · Grit 12 · Attack DC 13, 5 cold damage · Will DC 12 · Moves 2, flies
*Traits:* takes half damage from non-magic weapons.
*Dread (1):* **Dread Wail.** Every hero in Near range rolls Will vs Will DC 12 or becomes Frightened.

**Bandit Captain** (Elite)
Defense 14 · Grit 30 · Attack DC 13, 7 damage ×2 · Moves 2
*Traits:* **Commander.** Allied bandits get +1 damage.
*Dread (2):* **Parry.** Cancel one hit against the captain.

**Ember Drake** (Elite)
Defense 14 · Grit 40 · Attack DC 14, 8 bite + 4 burning · Moves 2, flies
*Traits:* immune to fire.
*Dread (2):* **Flame Breath.** Line attack. Dodge vs DC 14 or take 12 fire damage (half on a success at a cost).

**The Soot King** (Boss, level 2–3 party)
Defense 14 · Grit 70 · Attack DC 13, 8 damage · Will DC 13 · Moves 2
*Traits:* **Boss turns.** After each hero's turn, the Soot King makes one attack or moves.
**Ash Crown.** Below 35 Grit, the room fills with smoke. Everyone without darkvision is Blinded
beyond Reach.
*Dread (1):* **Summon Soot.** Call 3 Ash Rats. *(2):* **Smother.** Grab a hero (escape DC 13).
That hero takes 6 damage at the start of each round.

---

## 4. Building encounters

Budget **threat points** equal to **2 × number of heroes**, adjusted by difficulty:

| Foe | Cost |
|---|---|
| Minion swarm (3–6) | 1 |
| Standard | 1 |
| Elite | 3 |
| Boss | 2 × number of heroes (the boss is the whole encounter) |

- **Easy:** budget × 0.5 · **Standard:** × 1 · **Hard:** × 1.5 · **Deadly:** × 2
- Add terrain (a burning bridge, a collapsing floor, a lever) to most fights. Give heroes things to *do*.

---

## 5. Starter one-shot: *The Soot King's Hearth* (level 1, 3–4 hours)

*This adventure also ships in the app as [data/adventures/soot-kings-hearth.json](../data/adventures/soot-kings-hearth.json).
Change both together.*

**Hook:** The village of **Brindlecross** grew around a fallen ember that warms the whole valley.
Three nights ago, the ember went cold. Soot-black rats now pour out of the old Forge vent under
the village shrine. The elder offers 50 silver each, plus the hearth-blessing:
everyone who helps gets a free long rest in town forever.

### Scene 1: The cold village (social / investigation)
- Talk to the **elder Maren** (Friendly), the **shrine-keeper Oswin** (Wary, he's hiding something),
  and **children** who saw "a crown of smoke."
- **Oswin's secret:** he took a sliver of the ember to sell. A DC 12 Insight Test spots the lie, and
  a Persuade or Intimidate Test gets a confession. This gives a Boon later:
  the sliver can *re-kindle* the hearth.

### Scene 2: The vent (exploration)
- Descend 30 m. Group **Athletics** Test (DC 12) to climb down. Anyone who fails takes 1d6.
- **Encounter:** 2 Ash Rat swarms + 1 Cinder Goblin. Easy.

### Scene 3: The Forge corridor (puzzle / trap)
- A **Hollow Sentry** guards a door, dormant. A DC 14 Craft or Arcana Test can deactivate it.
  Failure wakes it.
- A **steam vent trap** fills the hall: DC 12 Notice to spot it, dodge vs DC 12 or take 2d6.

### Scene 4: The goblin camp (choice)
- 4 Cinder Goblins serve the Soot King out of fear. Talking them over (Wary → Friendly) can turn
  them into allies or guides. Fighting them is a Hard encounter.

### Scene 5: The Soot King's Hearth (boss)
- A huge chamber with the cold ember in the center. The **Soot King**, a smoke elemental crowned
  with ash, is feeding on the ember's last heat.
- **Terrain:** soot pits (Bane on movement), chains overhead (Athletics to swing across zones),
  and the cold ember itself.
- **Twist:** any hero can spend their Action touching the ember and making a **Spirit Test (DC 14)**.
  Each success deals 10 radiant damage to the Soot King. With Oswin's sliver, the Test gets a Boon.
- **Victory:** the ember reignites. Everyone levels up to 2 and gets a reward
  (a +1 weapon or an *Ember Charm*: once per session, recover 1 Ember).

### Follow-up hooks
- Who taught a smoke elemental to eat embers? A soot-stained letter in the King's hoard is signed
  **"the Ashen Choir."**
- Oswin's buyer is still in the city of **Lanthorn**, waiting for an ember sliver.
