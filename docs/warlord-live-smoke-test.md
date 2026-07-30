# Warlord Live Foundry Smoke Test

Use this checklist in Foundry VTT 13 with dnd5e 5.3.3 or newer. Test with a
player-owned Warlord actor and a GM available to inspect effects and resources.
Record every Foundry-only discrepancy as a failing regression test before
changing the implementation.

## Core Warlord

- [ ] Add a new Warlord and set Captain, Mentor, then Strategist; confirm the
  stored choice changes representative DCs and Rallying Cry's displayed
  modifier.
- [ ] Cancel the first-use Leadership prompt and confirm no activity or resource
  is consumed.
- [ ] Use Inspiring Word with d6, d8, d10, and d12; confirm one native Heal card,
  one use spent, and the chosen Leadership modifier each time.
- [ ] Double-click Inspiring Word and confirm one prompt and one use.
- [ ] Short rest and confirm Inspiring Word, Rallying Cry, and Exploit Dice
  recover.
- [ ] At level 10, confirm 30-foot range and no initiative recovery.
- [ ] At level 11, confirm 60-foot range and one Inspiring Word/Rallying Cry use
  returns on initiative.
- [ ] Upgrade an existing actor with custom notes and spent uses; confirm both
  are preserved.

## Tactical Exploits

Test one activity from each Tier A mechanic family, every Tier B activation
family, and all four Tier C Orders.

- [ ] Two different die-spending Exploits reduce the same Tactical Exploits pool.
- [ ] Defensive Order and the other free Orders spend no die.
- [ ] A configured Leadership Style changes Dirty Hit, Feint, Menacing Shout,
  Intimidating Command, and War Cry DCs.
- [ ] Tactical Superiority doubles module-owned 15-foot and 30-foot ranges.
- [ ] No Exploit automatically moves a token, makes another actor roll, or edits
  a completed check/save.
- [ ] All four Tier C items use Foundry's Post to Chat action without an extra
  activity.
- [ ] Existing chosen Exploits and custom activity content survive migration.
- [ ] Limited-use free Orders spend only their own documented use.
- [ ] At level 11 or later, confirm a module-owned 15-foot range becomes 30 feet
  and a module-owned 30-foot range becomes 60 feet.
- [ ] For Tier A Exploits, confirm native activities handle their declared
  action, targets, rolls, resource costs, and supported effects while any
  conditional trigger or unsupported follow-up remains player-controlled.
- [ ] For every Tier B activation family, confirm the activity tracks the
  supported activation and consumption, then follow its chat instructions for
  reactions, movement, another creature's attack, or manual effect removal.
- [ ] Confirm Tier C and other prose-only/manual mechanics remain Post to Chat
  and do not duplicate Foundry's native Post to Chat control with a redundant
  activity.

## Fighting Styles

- [ ] Enchant one eligible weapon with Balanced Fighting and verify +2 damage.
- [ ] Enchant one finesse weapon with Classical Swordplay and verify +2 attack.
- [ ] Enable and disable Classical Swordplay and Defensive Fighting AC effects.
- [ ] Apply Mounted Warrior to the Warlord and mount, then remove both on
  dismount.
- [ ] Use Protection and verify it displays the Warlord's proficiency bonus only.
- [ ] Use Standard Bearer, roll the target's next save, and remove the effect.
- [ ] Use Tactical Fighting's Help activity and confirm Search remains Post to
  Chat.

For every Fighting Style, use the item's documented enable, disable, apply, and
remove actions when eligibility changes. Confirm none of the styles automatically
moves a token, commands another actor, or mutates an attack, save, check, damage,
or healing roll outside Foundry's normal workflow.

## Results

| Foundry version | dnd5e version | Module commit | Tester | Pass/fail | Notes |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |
