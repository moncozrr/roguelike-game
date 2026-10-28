# The Ninefold Veil — Art Review Bundle

Generated and saved on 2026-10-28 from the current character art direction references.
These are review assets; the game does not load them yet.

## Files

1. `01-wonyon.png` — revised Wonyon enemy sprite
2. `02-protagonist-masked-animation-sheet.png` — masked spirit character animation-sheet draft (requested 51 frames)
3. `03-protagonist-heroine-concept.png` — second heroine visual proposal
4. `04-enemy-talisman-ghost.png` — talisman ghost enemy proposal
5. `05-enemy-cracked-jar-wraith.png` — cracked jar wraith enemy proposal
6. `06-boss-hungry-agwi.png` — Hungry Agwi boss sprite concept
7. `07-boss-headless-general.png` — Headless General boss sprite concept
8. `08-ground-ruined-joseon.png` — ruined Joseon ground tile draft
9. `09-props-ruined-joseon.png` — petals, stones, branches, and weeds prop sheet
10. `10-weapon-reward-cards.png` — four weapon-card visual draft
11. `11-protagonist-masked-2p5-head-sprite.png` — masked spirit gameplay sprite draft
12. `12-protagonist-heroine-2p5-head-sprite.png` — heroine gameplay sprite draft
13. `13-protagonist-masked-2p5-head-sprite-v2.png` — compact-proportion edit candidate
14. `14-protagonist-heroine-2p5-head-sprite-v2.png` — compact-proportion edit candidate
15. `15-protagonist-masked-chatgpt-2p5-sprite.png` — ChatGPT-generated masked protagonist draft (checkerboard baked in; reference only)
16. `16-protagonist-heroine-chatgpt-2p5-sprite.png` — ChatGPT-generated heroine draft (checkerboard baked in; reference only)
17. `17-protagonist-masked-chatgpt-transparent-2p5.png` — ChatGPT-generated masked protagonist with transparent background
18. `18-protagonist-heroine-chatgpt-transparent-2p5.png` — ChatGPT-generated heroine with transparent background
19. `19-protagonist-existing-design-proportion-update.png` — Dal (달), the existing female protagonist, adapted to compact 2.5-head proportions
20. `20-wonyon-style-update.png` — Wonyon style update based on the existing enemy reference and current enemy sprite direction
21. `21-dal-8-direction-sprite-review.png` — Dal's 8-direction idle-pose sheet for visual review
22. `22-dal-8-direction-48x48-grid-review.png` — Claude prompt-based 4×2 sheet normalized to a 48×48 logical grid, enlarged 8×
23. `23-dal-8dir-readable-32color-review.png` — readability revision with a reduced shared palette and binary transparency
24. `24-dal-8dir-brighter-skin-review.png` — localized brighter-skin variant of the readability revision

## Integration notes

- The two gameplay sprite drafts are 1024×1024 transparent review renders, not sliced or downsampled 48×48 production sprites.
- Compare the v2 candidates against the requested 2.5-head proportion before selecting either one; their head-to-body ratio is still a visual review item.
- The ChatGPT versions were generated as 1254×1254 transparent PNGs. The `17` and `18` files have transparent corner pixels; review the proportions and character details before runtime integration.
- Files `19` and `20` are transparent ChatGPT-generated review candidates (1254×1254 and 1402×1122). The protagonist candidate preserves the existing female dual-sword design; Wonyon keeps the dark spirit, pale cloth, vermilion, and jade motifs while matching the current enemy pixel-art treatment.
- The existing female protagonist is named **Dal (달)**, as decided by the user on 2026-10-28. No additional biography or lore is implied by this name entry.
- These are single-pose concept candidates. They do not replace the protagonist animation sheet or Wonyon's runtime left/right 48px sprites until the designs are approved and adapted to those formats.
- `21-dal-8-direction-sprite-review.png` is a 1305×1205 transparent 3×3 review layout: NW, N, NE / W, empty, E / SW, S, SE. Its center cell is transparent. It is not yet a production sprite atlas with validated equal frame bounds or animation states.
- `22-dal-8-direction-48x48-grid-review.png` follows the supplied Claude prompt's 4×2 order and is 1536×768 with transparent background and 384×384 cells (48×48 logical pixels enlarged 8×). The poses are idle-only; inspect the facing, hair-ornament asymmetry, daggers, and per-cell grounding before approval. It does not include animation states.
- `23-dal-8dir-readable-32color-review.png` is the revised review candidate: 1536×768, 4×2 cells, 48×48 logical pixels enlarged with exact 8×8 blocks, transparent/opaque alpha only, and 15 total colors including transparency. Direction-specific ornament visibility, boot-row alignment, and dagger-tip margins still need visual approval before this replaces the source reference.
- `24-dal-8dir-brighter-skin-review.png` changes only the two skin-palette entries in `23` to lighter peach tones. The 1536×768 dimensions, 15-color palette, 8×8 logical-pixel blocks, and transparent background are preserved.
- Verify their 2.5-head proportion and inspect the masked animation sheet's actual frame count, alignment, and cell boundaries before runtime integration.
- Confirm that the ground texture tiles cleanly at its edges and that the prop sheet separates into usable transparent sprites.
- These concept assets do not establish new character factions, backstories, or abilities.
