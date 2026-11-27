# Emberreach — Core Rules (v0.3)

> First pass. All numbers are placeholders until playtesting.

---

## 1. What you need

- One **d20** per player, plus a set of **d4, d6, d8, d10, d12**
- A character sheet per player ([template](../sheets/character-sheet.md))
- **A party of 1 to 5 heroes** (3–5 is the table norm). There is no hard limit, but every hero adds a turn to each
  round, so play slows down above 5. A single hero can play the built-in adventures solo.
- ~20 tokens for **Momentum** (glass beads, coins) and ~10 for the GM's **Dread** pool
- Optional: a grid map and minis. The rules work fine without them using zones (see §6.3)

---

## 2. The core roll: the Test

When the outcome is uncertain and failure would matter, roll a **Test**:

> **d20 + Attribute + Skill rank** vs a **Difficulty (DC)**

| Difficulty | DC | Example |
|---|---|---|
| Easy | 8 | Climb a knotted rope |
| Standard | 12 | Pick a common lock |
| Hard | 16 | Talk a guard captain out of an arrest |
| Heroic | 20 | Leap a chasm in plate armor |
| Legendary | 24 | Outwit a dragon at its own riddle game |

### 2.1 Degrees of result

| Result | Outcome |
|---|---|
| Beat DC by **5+** | **Strong success**: you succeed and gain **1 Momentum** |
| Meet or beat DC | **Success** |
| Miss by **1–3** | **Success at a cost**: you succeed, but the GM adds a Complication (or the GM gains 1 Dread) |
| Miss by **4+** | **Failure**: it doesn't work, and the situation changes |
| Natural **20** | **Triumph**: strong success plus something extra, whatever the total |
| Natural **1** | **Fumble**: failure plus a Complication, whatever the total |

### 2.2 Boons and Banes

Circumstances add or subtract a die instead of a flat number:

- **Boon:** add **+1d4** to the Test. A second boon makes it **+1d6**, a third **+1d8** (max).
- **Bane:** subtract **1d4**, then 1d6, then 1d8, the same way.
- Boons and banes cancel one-for-one. Only the net amount is rolled.

Boons come from help, good tools, clever plans, high ground, and spending Momentum.
Banes come from wounds, bad footing, darkness, and haste.

### 2.3 Helping

One ally can help if they describe *how*. The helper gives a Boon. If the Test fails,
the helper shares any consequences.

### 2.4 Group Tests

When everyone must do it (sneaking past, crossing a river), everyone rolls.
If **at least half** succeed, the group succeeds.

### 2.5 Contests

Hero against an NPC (arm wrestling, a chase): the hero rolls against a DC of
**10 + the NPC's relevant bonus**. Players always roll. The GM doesn't.

---

## 3. Making a hero

1. Pick an **Ancestry** (§3.2)
2. Pick a **Calling** (your class, §4)
3. Assign **Attributes** (§3.1)
4. Pick a **Background**: gives 2 skill ranks and a starting contact (§3.4)
5. Spend **2 more skill ranks** anywhere
6. Choose **gear** from your Calling kit (§7)
7. Work out your **Grit, Dodge, Will**, and **Ember** (§3.5)
8. Write one **Oath**, something your hero has sworn to do (§8.3)

### 3.1 Attributes

Six attributes. The number on your sheet is **added directly to rolls** (no conversion table).

| Attribute | Covers |
|---|---|
| **Might** | Strength, endurance, heavy weapons, grappling |
| **Grace** | Agility, reflexes, stealth, finesse and ranged weapons, dodging |
| **Wits** | Perception, instinct, reaction speed, initiative |
| **Lore** | Learning, memory, reasoning, arcane magic |
| **Spirit** | Willpower, faith, inner fire, divine magic, resisting fear |
| **Presence** | Charm, intimidation, leadership, deception |

**Starting array:** assign **+3, +2, +1, +1, 0, −1** however you like, then apply your Ancestry bonus
(maximum +4 at level 1).

### 3.2 Ancestries

| Ancestry | Bonus | Trait |
|---|---|---|
| **Human** | +1 to any attribute | **Adaptable:** +1 extra skill rank and 1 extra talent at level 1 |
| **Stoneborn**: squat, grey-skinned folk who mine the old Forge ruins | +1 Might | **Bedrock:** once per scene, ignore being knocked prone, pushed, or grabbed. Can see in darkness as if in dim light |
| **Wildkin**: beast-featured people of the deep Reach (choose: fox, bear, owl, hare) | +1 Grace or Wits | **Instinct:** you can never be surprised. Pick one beast perk: keen nose, claws (d6 unarmed), night eyes, or a +2 bonus to jumping |
| **Emberkin**: humans touched by a fallen ember, with glowing veins and warm skin | +1 Spirit | **Inner Flame:** resist fire and cold (halve that damage). Once per rest, you can shed light in a 10 m radius or ignite something you touch |
| **Hollowborn**: Forge-built automatons who woke up with souls | +1 Lore or Might | **Unliving:** don't eat, sleep, or breathe. Immune to poison and disease. Healing magic heals you for half, but repair (a Craft Test during a rest) heals you fully |

### 3.3 Skills

Skills have **ranks 0–3** (rank 4 at level 7+). Untrained (rank 0) is fine. You just get no bonus.
Pair a skill with whichever attribute fits the action (Athletics + Might to climb,
Athletics + Grace to tumble).

| Skill | Skill | Skill |
|---|---|---|
| Athletics | Arcana | Insight |
| Stealth | History | Persuade |
| Sleight | Nature | Deceive |
| Survival | Medicine | Intimidate |
| Notice | Craft | Perform |

**Weapon skills** work the same way: **Melee**, **Ranged**, and **Spellcraft** each have ranks.

### 3.4 Backgrounds (pick one, or write your own with the GM)

| Background | Skill ranks | Contact |
|---|---|---|
| Ash-farmer | Nature, Athletics | A village elder who owes you a favor |
| Forge-scavenger | Craft, Notice | A fence in the Ruin Market |
| Temple foundling | Medicine, Insight | A priest of the Last Flame |
| Disgraced noble | Persuade, History | An estranged sibling at court |
| Caravan guard | Survival, Intimidate | A merchant who trusts you |
| Street performer | Perform, Sleight | A gossip who hears everything |
| Hedge scholar | Arcana, History | A rival academic |
| Deserter | Stealth, Melee | An old squad-mate, still enlisted |

### 3.5 Derived numbers

| Stat | Formula |
|---|---|
| **Grit** (stamina) | Calling base + Might + (level × Calling growth) |
| **Wound slots** | 3 (+1 for Stoneborn) |
| **Dodge** (added to your dodge rolls, §6.5) | Grace + armor + shield |
| **Will** (added to your rolls against mental attacks, §6.5) | Spirit |
| **Speed** | 2 zones / 10 m per move |
| **Ember** (magic and talent fuel) | Calling base + your casting attribute |

---

## 4. Callings

Each Calling gives: base Grit and growth, base Ember, starting skill ranks, a **signature feature**,
and a **talent list**. You pick **2 talents at level 1**, then 1 more each level.

### 4.1 Warden: the shield-bearer

*Stands at the front so others don't have to.*

- **Grit** 12 + 5/level · **Ember** 2 + Spirit · **Armor** heavy · **Skills** Melee 2, Athletics 1
- **Signature: Bulwark.** As a Reaction, when an ally within reach is attacked, you take the hit instead
  and roll your own dodge with a Boon.
- **Talents**
  - *Taunt* (1 Ember): one foe must target you on its next turn or take a Bane on every attack.
  - *Shield Wall*: allies adjacent to you get +1 Dodge.
  - *Unbreakable*: once per rest, when you'd take a Wound, take it as 5 Grit damage instead.
  - *Shove*: when you hit, also push the target one zone or knock it prone.
  - *Sentinel*: foes that leave your reach provoke a free attack.
  - *Iron Oath*: +2 Will, immune to fear while your Oath is active.

### 4.2 Blade: the duelist

*Fast, precise, deadly up close.*

- **Grit** 10 + 4/level · **Ember** 2 + Grace · **Armor** light · **Skills** Melee 2, Athletics 1
- **Signature: Flurry.** When you hit with a Strong success, make one extra attack right away
  (no Momentum needed).
- **Talents**
  - *Riposte*: when you dodge an attack with a Strong success, deal your weapon die in damage.
  - *Twin Fang*: fight with two light weapons and roll both damage dice, keep the higher.
  - *Blooded* (1 Ember): +1 weapon die of damage to a foe already below half Grit.
  - *Dancer*: moving through foes' zones never provokes.
  - *Executioner*: your critical range is 19–20.
  - *Battle Trance* (2 Ember): for one round, take two Actions.

### 4.3 Hexer: the arcanist

*Bends the raw physics of the Forge.*

- **Grit** 8 + 3/level · **Ember** 4 + Lore · **Armor** none · **Skills** Spellcraft 2, Arcana 1
- **Signature: Arcane Casting.** Casts Arcane spells with Lore. Starts with 3 spells and learns
  1 per level (§5).
- **Talents**
  - *Overchannel*: add +1 spell die to a spell, but take a Bane on the cast.
  - *Ember Shield* (Reaction, 1 Ember): +3 Dodge against one attack.
  - *Twinned*: single-target spells can hit two targets for +1 Ember.
  - *Quiet Casting*: cast without words or gestures.
  - *Ward-sense*: always sense magic within 10 m.
  - *Familiar*: a small ember-spirit scouts, carries, and can deliver touch spells.

### 4.4 Mender: the flamekeeper

*Priest of the Last Flame. Heals, protects, and burns the unholy.*

- **Grit** 9 + 4/level · **Ember** 4 + Spirit · **Armor** medium · **Skills** Spellcraft 2, Medicine 1
- **Signature: Divine Casting.** Casts Divine spells with Spirit. Starts with 3 spells and learns
  1 per level. Always has *Mend Wounds*.
- **Talents**
  - *Sanctuary* (2 Ember): your zone becomes holy ground. Foes there take a Bane until your next turn.
  - *Stitch the Soul*: during a rest, remove 1 extra Wound from one ally.
  - *Searing Faith*: your melee hits deal +1d4 fire damage.
  - *Last Rites* (Reaction, 2 Ember): an ally about to be taken Down stays at 1 Grit instead.
  - *Beacon*: shed holy light. Undead and shadow foes take a Bane against you.
  - *Shared Burden*: when you heal someone, you also heal half that amount.

### 4.5 Pathfinder: the hunter-scout

*Tracks, traps, and shoots from cover.*

- **Grit** 9 + 4/level · **Ember** 2 + Wits · **Armor** light · **Skills** Ranged 2, Survival 1
- **Signature: Quarry.** Mark one foe per scene. You get a Boon on all Tests against it
  and always know where it is.
- **Talents**
  - *Volley* (1 Ember): attack every foe in one zone with a single roll.
  - *Trapper*: during a rest, set 2 traps. Each deals 2d6 and roots its victim in place.
  - *Ghost Step*: Stealth in the wilds always gets a Boon.
  - *Animal Companion*: a hawk, hound, or wolf that acts on your turn.
  - *Pinning Shot*: when you hit, the target's Speed drops to 0 until its next turn.
  - *Guide*: the party never gets lost and gains +1 Supply die step when traveling.

### 4.6 Silvertongue: the rogue-bard

*Charm, lies, poison, and perfect timing.*

- **Grit** 8 + 3/level · **Ember** 3 + Presence · **Armor** light · **Skills** Persuade 2, Deceive 1, Stealth 1
- **Signature: Opening.** Once per round, when you hit a foe that an ally is next to, or one that
  hasn't acted yet, add +2d6 damage.
- **Talents**
  - *Inspire* (1 Ember, Reaction): give an ally a Boon on any Test.
  - *Silver Song* (2 Ember): all allies in your zone recover 1d6 Grit.
  - *Cutpurse*: Sleight Tests to steal or plant items always get a Boon.
  - *Mockery* (1 Ember): one foe takes a Bane on its next attack and must target you.
  - *A Friend Everywhere*: in any town, you know someone useful.
  - *Vanish*: once per scene, after an attack, become hidden if any cover is nearby.

### 4.7 Kilnheart: the mineral alchemist

*Swallows the Reach's minerals and fires them in the gut.*

- **Grit** 9 + 4/level · **Ember** 2 + Might · **Armor** light · **Skills** Melee 2, Craft 1
- **Signature: Crucible.** Once on your turn, without using your Action, pay 1 Ember and swallow a mineral you know. Its power lasts until the scene ends. You hold one at a time, so a new one replaces it. You know 3 minerals at level 1.
- **Talents**
  - *Twin Draught*: hold two minerals at once.
  - *Wide Palate*: learn 2 more minerals.
  - *Quick Swallow*: use Crucible as a Reaction.
  - *Shared Dose* (2 Ember): an ally in reach gains one of your minerals until the scene ends.
  - *Last Spark*: end a held mineral to add +2d6 damage to a hit.
  - *Tempered Gut*: immune to poison. Boon on Tests against disease.

#### Common minerals

Each **Vein** has a **Hot** mineral that drives you forward and a **Cold** one that steadies you.

| Vein | Hot | Cold |
|---|---|---|
| **Blood** (fighting) | **Sulfur:** your weapon hits deal +1d4 fire damage | **Slate:** +2 Dodge |
| **Stride** (movement) | **Cinnabar:** each Move covers 1 extra zone | **Rootstone:** you can't be knocked Prone, pushed or Grabbed |
| **Mind** (senses and will) | **Wakeglass:** Boon on Notice and Wits Tests | **Hushstone:** +2 Will, and you can't be Frightened |
| **Marrow** (endurance) | **Marrowsalt:** instantly recover 1d8 + Might Grit | **Stillsalt:** ignore the Banes from your Wounds |

- **Opposites:** you can't hold both minerals from one Vein, even with *Twin Draught*. Swallowing one ends the other.
- **Marrowsalt** acts at once. You never hold it, so it doesn't replace a held mineral, and it doesn't end
  *Stillsalt*.
- **Burning Out** (§5.2) works for Crucible: take **1 Wound** for each missing point of Ember.

#### Deep minerals

You can't learn these. The GM awards them as treasure, and each dose is used up. Only a Kilnheart can
swallow one. It doesn't use your Action, costs no Ember and doesn't replace your held mineral.

| Mineral | Power |
|---|---|
| **Heartcoal** | Take one extra Action this turn |
| **Gloamspar** | Remove 1 Wound |

---

## 5. Magic

### 5.1 Casting

- Casting a spell is your **Action**. Pay the spell's **Ember cost**.
- Roll **d20 + casting attribute + Spellcraft** vs the spell's DC (a foe's **Defense**,
  a foe's **Resolve**, or a set DC for utility spells). If a foe's stat block lists no Resolve,
  use its Defense.
- **Success at a cost** on a spell: it works, but take **Strain** (1 Grit per Ember spent).
- **Fumble:** **Backlash.** Roll on the Backlash table (§5.4).

### 5.2 Ember recovery

- **Short rest:** recover half your Ember (round up).
- **Long rest:** recover all of it.
- **Burning Out:** you can cast with Ember you don't have. Take **1 Wound** for each missing point.

### 5.3 Starting spell lists (v0.1)

**Arcane (Hexer)**

| Spell | Ember | Target / DC | Effect |
|---|---|---|---|
| Ember Bolt | 0 | 1 foe, Defense | 1d10 fire damage, range far |
| Shatter | 1 | 1 zone, Defense | 2d6 thunder damage to all, objects crack |
| Binding Glyph | 1 | 1 foe, Resolve | Target cannot move until it passes DC 12 at the end of its turn |
| Blink | 1 | Self | Teleport 2 zones as a Reaction |
| Veil | 1 | Self/ally, DC 12 | Invisible until you attack or the scene ends |
| Forge Lance | 3 | Line, Defense | 3d8 fire damage |
| Mindspike | 1 | 1 foe, Resolve | 2d6 psychic damage, target takes a Bane on its next action |
| Kindle | 0 | Utility | Light, small flames, warm or chill an object |

**Divine (Mender)**

| Spell | Ember | Target / DC | Effect |
|---|---|---|---|
| Mend Wounds | 1 | Ally in reach, auto | Heal 2d6 + Spirit Grit |
| Radiant Lash | 0 | 1 foe, Defense | 1d8 radiant damage. Undead take a Bane next turn |
| Bless | 1 | Allies in zone | Boon on their next Test |
| Ward of Flame | 1 | Ally | +2 Dodge until the end of the scene |
| Rekindle | 3 | Downed ally, DC 14 | Revive at half Grit and remove 1 Wound |
| Smite the Dark | 2 | 1 foe, Resolve | 3d6 radiant damage, doubled against undead |
| Calm | 1 | 1 creature, Resolve | Ends fear or rage. Hostile NPCs stop to talk |
| Purify | 0 | Utility | Cleanse food, water, poison, or disease |

### 5.4 Backlash (d6)

1. **Flare:** you and everyone adjacent take 1d6 fire damage
2. **Drain:** lose all remaining Ember
3. **Wild:** the spell hits a random target
4. **Echo:** a loud boom. Everything nearby knows where you are
5. **Scar:** gain a cosmetic ember-scar, and the GM gains 2 Dread
6. **Surge:** the spell works *anyway*, at double effect, and you take a Wound

---

## 6. Combat

### 6.1 Rounds and turns

Combat runs in **rounds**. Each round has two phases:

1. **Heroes' Phase:** heroes act **in any order they agree on**.
2. **Foes' Phase:** the GM acts with all foes.

**Ambush:** if a side is surprised, the other side gets a full free phase first.
**Wits Test (DC 12) at the start:** any hero who succeeds may act *before* the Foes' phase
even if the foes ambushed.

### 6.2 Your turn

On your turn you get:

- **1 Action:** attack, cast, use a talent, Dash (another move), Help, Hide, Ready, or anything creative
- **1 Move:** move up to your Speed
- **1 Reaction per round:** on anyone's turn, used for talents, readied actions, and Bulwark

Free: talk, drop an item, glance around.

### 6.3 Zones, not squares

The battlefield is split into **zones** (rooms, a bridge, a balcony).

- **Reach:** in the same zone, adjacent to the target
- **Near:** 1 zone away
- **Far:** 2–3 zones away. Ranged weapons and most spells reach this far
- Leaving a zone with a foe in it **provokes** a free attack from that foe unless you Disengage
  (which uses your Action).

*On a grid: 1 zone ≈ 6 squares.*

### 6.4 Attacking (heroes roll)

> **d20 + attribute (Might/Grace) + Melee/Ranged** vs the foe's **Defense**

- **Hit:** roll weapon damage + attribute.
- **Strong success:** +1 Momentum.
- **Natural 20 (Critical):** maximum damage on the weapon die, then roll it again and add it.
- **Success at a cost (Glancing hit):** deal **half damage** (round down). On-hit effects
  (talents like *Shove* or *Pinning Shot*, *Opening*, poison) don't trigger. Spending 2 Momentum
  turns it into a clean hit.

### 6.5 Dodging (heroes roll here too)

When a foe attacks you, **you roll**:

> **d20 + Dodge** (Grace + armor + shield) vs the foe's **Attack DC**

- **Success:** you avoid it (or block it).
- **Success at a cost:** take **half damage**.
- **Failure:** take full damage.
- **Natural 1:** take full damage, and the foe gets its "on a critical" effect.

Mental attacks (fear, charm) use **d20 + Will** vs the foe's **Will DC**.

- **One attack, one roll.** Each foe attack is one dodge roll by the hero it targets.
  An area attack makes **every hero in the area** roll one dodge.
- **Swarms:** Minions act in groups of 3–6 as a single **swarm** that makes **one attack per round**
  (see the GM guide). You dodge a swarm once, not once per Minion.

### 6.6 Grit, Wounds, and going Down

- Damage comes off **Grit** first.
- When damage takes you **below 0 Grit**, set Grit to 0 and take **1 Wound**.
  At 0 Grit, **every hit that lands deals a Wound** instead of damage.
- **Each Wound** gives you a **Bane** on every Test with one Attribute. Roll **d6** to find out which:
  **1** Might · **2** Grace · **3** Wits · **4** Lore · **5** Spirit · **6** Presence. Write it down.
  A Grace Wound also hits your dodges, and a Spirit Wound hits your Will rolls.
  Wounds on the same Attribute stack (Bane d4 → d6 → d8).
- **Fill all your Wound slots:** you're **Down**. You can't act, and you're dying.
  - At the start of each Heroes' Phase, roll **d20 + Spirit**. **10+** means you hold on.
    Three failures means your hero dies. A Natural 20 means you get back up with 1 Grit.
  - Any healing or a DC 12 Medicine Test stabilizes you.
- **The Last Stand:** while Down, you may choose to spend your Oath (§8.3) to take
  **one final turn** with three Actions. After that turn, your hero dies heroically.

### 6.7 Momentum (the party's shared pool)

Gain Momentum from Strong successes, Triumphs, and achieving story goals. Max **6** in the pool.
Any hero can spend it:

| Cost | Effect |
|---|---|
| 1 | Add a Boon to any Test (declare before rolling) |
| 1 | +1 weapon die of damage on a hit |
| 1 | Learn a foe's weakness or remaining Grit |
| 2 | Take an extra Move |
| 2 | Turn a Success-at-a-cost into a clean Success |
| 3 | Take an extra Action |
| 3 | Instantly recover 1d8 + level Grit |

Momentum **empties to 0 at the end of each scene**. Use it or lose it.

### 6.8 Dread (the GM's pool)

The GM starts each session with **Dread equal to the number of players**. The GM gains Dread
from fumbles, Successes at a cost (if the GM chooses that instead of a Complication), and Backlash.
The GM spends it to:

- Activate a foe's **Dread abilities** (listed in its stat block)
- Bring in **reinforcements** (2 Dread)
- Make a foe **act twice** this round (3 Dread, Bosses only)
- Add a Bane to a hero's Test (1 Dread, once per Test, but the GM must narrate why)

### 6.9 Conditions

| Condition | Effect |
|---|---|
| **Prone** | Melee attacks against you get a Boon. Ranged attacks against you get a Bane. Standing up costs a Move |
| **Grabbed** | Speed 0. Escape: Athletics or Grace Test vs DC |
| **Blinded** | Bane on attacks and dodges |
| **Frightened** | Bane on Tests while the source is in sight. Can't move closer to it |
| **Burning** | 1d6 damage at the start of your turn. Spend an Action to put it out |
| **Rooted** | Speed 0, but you can still act |
| **Stunned** | No Actions or Reactions. You dodge with a Bane |
| **Hidden** | Your first attack gets a Boon. Foes must find you first (Notice vs your Stealth) |

---

## 7. Gear

### 7.1 Weapons

| Type | Damage | Attribute | Notes |
|---|---|---|---|
| Light (dagger, short sword) | d6 | Might or Grace | Throwable (near), concealable |
| Versatile (sword, axe, spear) | d8 | Might or Grace | d10 if wielded two-handed |
| Heavy (greatsword, maul) | d12 | Might | Two-handed, Bane to Stealth |
| Bow / sling | d8 / d6 | Grace | Range far |
| Crossbow | d10 | Grace | Range far, reloading takes your Move |
| Unarmed | 1 + Might | Might | |

### 7.2 Armor

| Armor | Dodge bonus | Drawback |
|---|---|---|
| None | +0 | |
| Light (leather) | +1 | |
| Medium (chain, scale) | +2 | Bane on Stealth |
| Heavy (plate) | +3 | Bane on Stealth and Athletics (swim/climb). Requires Might +1 |
| Shield | +1 | Uses a hand |

### 7.3 Calling kits

Each kit also includes a backpack, bedroll, rope, torches, 3 **Supply** (§8.1), and **20 silver**.

- **Warden:** versatile weapon, shield, heavy armor
- **Blade:** two light weapons *or* one versatile weapon, light armor
- **Hexer:** a focus (wand or orb), dagger, a spellbook, ink
- **Mender:** a mace or staff, shield, medium armor, a holy symbol, bandages (3 uses: +1d6 Grit)
- **Kilnheart:** versatile weapon, light armor, a mineral pouch, a mortar and pestle
- **Pathfinder:** bow and 20 arrows, light weapon, light armor, a snare kit
- **Silvertongue:** light weapon, light armor, a disguise kit, lockpicks, 1 vial of poison (+1d6, one hit)

---

## 8. Exploration, rest, and story

### 8.1 Supply

Food, water, torches, and small comforts are tracked as one **Supply die**, starting at **d8**.
Each day of travel, or each long rest outdoors, roll it. On a **1–2**, the die steps down
(d8 → d6 → d4 → out). Buy more in town: 10 silver per step.

### 8.2 Resting

| Rest | Time | Recovers |
|---|---|---|
| **Short rest** | ~1 hour, once or twice a day | Roll **Grit dice**: half your max Grit. Recover half your Ember |
| **Long rest** | One night, with Supply | All Grit and Ember. Remove **1 Wound** (2 if you're in a safe town) |

### 8.3 Oaths

Every hero has an **Oath**, something they have sworn to do: *"I will find who burned my village."*

- Once per session, when your Oath drives a choice, gain **1 Momentum**.
- **Fulfilling** an Oath: gain a level-up talent immediately, then swear a new Oath.
- **Spending** your Oath for a Last Stand (§6.6) ends it permanently.

### 8.4 Social encounters

NPCs have an **Attitude**: Hostile → Wary → Neutral → Friendly → Devoted.
A successful Persuade, Deceive, or Intimidate Test (with a reasonable pitch) shifts
the NPC one step. A strong success shifts two. Failure may shift it the wrong way.
**No roll can make someone act against their core nature.** Roleplay sets the Boons and Banes.

---

## 9. Advancement

- **Milestone leveling:** heroes level up at the end of each adventure or major story beat
  (roughly every 1–2 sessions). Levels go from **1 to 10**.

| Level | Gains |
|---|---|
| Every level | +1 talent (or +1 spell for casters), +Grit growth, +1 skill rank |
| 3, 6, 9 | +1 to one attribute (max +5) |
| 4 | **Calling Mastery:** a stronger version of your signature feature *(to be written for v0.4)* |
| 5 | +1 to all attack and spell Tests (Proficiency) |
| 7 | Skills can go to rank 4 |
| 10 | **Legend:** an epic capstone ability *(to be written for v0.4)* |

---

## Open questions

None right now. The v0.1 questions were settled on 2026-11-21 (see [decisions](../docs/decisions.md)).
Add new ones here as they come up.
