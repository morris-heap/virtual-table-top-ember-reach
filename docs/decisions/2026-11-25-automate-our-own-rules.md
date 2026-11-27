### 2026-11-25 — Automate our own rules, don't become a VTT platform (VTTER-92)

**Decision:** Product scope for the companion app. No change to the d20 rules, so the rules stay at **v0.2**.

The app **deeply automates Emberreach's own rules**. It does **not** become a platform for running other games.

1. **In scope:** rules automation read from `/data` (VTTER-89), the side-based combat tracker (VTTER-36),
   a live shared table (VTTER-87), a shared roll log (VTTER-88), simple image-and-token maps (VTTER-85),
   a GM-only layer with editing during play (VTTER-90), and slabs (VTTER-91).
2. **Out of scope, deliberately:**
   - **Dynamic lighting and per-token vision.** Years of work, and pillar 4 says a grid isn't even required.
     *(Amended 2026-11-26: fog of war, including per-token vision, is now in scope as a GM setting. Dynamic lighting
     stays out. See the entry above.)*
   - **3D terrain and sculpting.** Those competitors are whole game engines.
   - **A user scripting language** (Let's Role's JavaScript, Tabletop Simulator's Lua). We are one game, not an engine.
   - **A system builder for other RPGs.** Generalising costs us the rules automation, which is the only reason
     to pick this app over a general VTT.
   - **A content marketplace.** Slabs cover sharing at a fraction of the cost.
   - **Built-in video or voice.** Tables already use Discord.
3. **Players never buy in to join.** A GM's Game is free to join for every member, and nothing at the table is
   gated behind a player's own purchase or subscription.

**Why:**
- A competitive review on 2026-11-25 of Roll20, Foundry VTT, Fantasy Grounds, Beyond Tabletop, Game Master Engine,
  Tableplop, Tabletop Simulator, TaleSpire, Let's Role and Role found that every one of them is a *general* VTT:
  they automate nobody's rules in particular, because they can't. We own the rules **and** the code, and `/data`
  is already machine-readable, so resolving a Test, a Glancing hit, Grit, a d6 Wound Bane and Momentum
  automatically is the one thing no competitor can do for this game. It is the app's reason to exist.
- The excluded features are where general VTTs spend their years. Lighting in particular was still producing
  bugfixes in Roll20's 2026 changelog, and it buys us nothing that our pillars ask for.
- Writing the boundary down keeps later work from drifting into rebuilding Roll20 badly.

**Affects:** README.md (roadmap), AGENTS.md (companion app scope), and the VTTER-46 backlog.
No rules text and no `data/` changes.
