# Desktop Pet Research

Last checked: 2026-06-12

## Summary

For this project, the best candidates are not simply the cutest premade models.
The real constraint is whether a model can be embedded on a public website without creating obvious license or redistribution risk.

## Best Options

### 1. Official Live2D sample animals

Good when:
- we want a legal, free, low-risk starting point
- we want something that can be integrated immediately

Relevant sources:
- Live2D sample data page: https://www.live2d.com/en/learn/sample/
- Terms of use: https://www.live2d.com/eula/live2d-sample-model-terms_en.html
- Commercial-use FAQ: https://help.live2d.com/en/other/other_16/

Good sample candidates:
- Tororo & Hijiki: two cat models with paw licking / ear scratching motions
- Wankoromochi: animal mascot model with accessory swapping

Why this is safe:
- official runtime folders are provided for embedding
- commercial use is permitted for General Users and Small-Scale Enterprises, subject to Live2D terms

Tradeoff:
- the art direction feels more like a sample/demo than a bespoke mascot

### 2. 0x4682B4 customizable models

Good when:
- we want a more finished and polished Live2D result
- we are okay paying a small amount
- we need clearer software integration language

Relevant sources:
- Type-H1 docs: https://docs.glycoproduction.com/models/type-h1/
- Type-H3 docs: https://docs.glycoproduction.com/models/type-h3/
- License: https://docs.glycoproduction.com/license/
- BOOTH Type-H1: https://0x4682b4.booth.pm/items/4991289
- BOOTH Type-H3: https://booth.pm/en/items/6402750

Current pricing seen:
- Type-H1: 2,800 JPY
- Type-H3: 2,800 JPY

Why this is strong:
- license explicitly permits commercial use
- license explicitly permits software integration if reasonable protection is used
- preset characters are included

Tradeoff:
- more character-like than pet-like
- still requires us to adapt the runtime files for the site

## Style-Only Candidates

These are visually usable, but I would not deploy them to a public site without checking license details much more carefully.

### DoodliStudio BOOTH shop

Shop:
- https://clipartbunny.booth.pm/items

Current items seen:
- Bouncy Cup Kitty: 1,500 JPY
- Kawaii Cow: 1,500 JPY
- Kawaii Mushroom: 1,500 JPY
- Adorable Potato: 800 JPY
- Free female model: 0 JPY

Relevant pages:
- Free female model: https://booth.pm/ja/items/6597484
- Kawaii Cow: https://booth.pm/en/items/6223993

Why they are attractive:
- much closer to "cute ready-made mascot" than the earlier custom concepts
- cheap and visually finished

Why they are risky:
- the visible product text focuses on VTuber / OBS / VTube Studio usage
- public website deployment usually exposes model files unless we add protection
- redistribution restrictions may conflict with naive static hosting

### Pumpkin Kitty

Page:
- https://booth.pm/en/items/5150525

Why it is interesting:
- free
- cat-like
- already framed as a small accessory / pet-style Live2D asset

Why it is not my default pick:
- licensing snippet is permissive for streaming / videos, but website embedding is still not as clearly described as the 0x4682B4 license

## Integration Libraries

### Fastest
- l2d-widget: https://github.com/hacxy/l2d-widget

### More controllable
- Live2dOnWeb: https://github.com/Konata09/Live2dOnWeb

For this repo, both are compatible with the current plain HTML/CSS/JS stack.

## Recommendation

If we want the safest immediate path:
1. Use official Live2D sample animals first.
2. Integrate with `l2d-widget` or `Live2dOnWeb`.
3. Replace later if a paid model is chosen.

If we want the best balance of polish and deployability:
1. Buy Type-H1 or Type-H3 from 0x4682B4.
2. Integrate with `Live2dOnWeb`.
3. Bundle or otherwise protect the runtime assets before deployment.

If we want the cutest "finished mascot" look:
1. Pick a DoodliStudio pet-like model such as Bouncy Cup Kitty or Kawaii Cow.
2. Re-check whether public web deployment is acceptable under the product terms.
3. Only then integrate it.
