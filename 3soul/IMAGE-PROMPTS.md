# Price It — image prompts, batched for Gemini

**28 images outstanding, in 7 prompts.** Each prompt produces one 2×2 grid
containing four square photographs. Hand me the grid file and I slice it:

```bash
python3 tools/slice-grid.py <grid.png> <name1> <name2> <name3> <name4>
```

Names in reading order — top-left, top-right, bottom-left, bottom-right — exactly
as listed under each batch. The slicer cuts the grid, crops each panel to the
aspect ratio its slot needs, compresses it under 250 KB and installs it. Then
`python3 tools/sync-images.py` points the page at whatever has arrived.

Batch one (8 images) is already delivered and live.

---

## Why a grid, and the one rule that matters

Asking for four panels in one image keeps a batch visually consistent — same
light, same palette, same session — which is the whole difficulty with generating
a set one prompt at a time.

**Keep every subject inside the central 75% of its own panel.** Each square gets
cropped again to fit its slot (4:3 for most, 4:5 for portraits and stories, 1:1
for avatars), so the outer eighth of each quadrant is crop margin. Backgrounds
should stay quiet all the way to each panel's edge.

Nothing may cross a quadrant boundary. No captions, no numbering, no dividing
lines — the slicer cuts on exact quarters.

---


## Batch 1 — Customer reviews, part one

Customer pieces, photographed more casually than campaign work — real surfaces, real rooms, honest light. These should read as considered customer photographs.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `review-01-kelly-engagement-ring.jpg`
- **Top-right** → `review-02-isha-everyday-ring.jpg`
- **Bottom-left** → `review-03-piyali-pendant.jpg`
- **Bottom-right** → `review-04-saloni-earrings.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (review-01-kelly-engagement-ring)** — a custom engagement ring with a round centre stone and a slim pavé band, on a light wooden table beside a window

**Top-right (review-02-isha-everyday-ring)** — a slim everyday diamond ring with a low-profile setting, worn on a woman's hand resting on a cream cushion, face out of frame

**Bottom-left (review-03-piyali-pendant)** — a simple diamond pendant on a fine chain, laid on a pale marble windowsill in morning light, shot from directly above

**Bottom-right (review-04-saloni-earrings)** — a pair of customised diamond drop earrings on a folded linen napkin, slightly apart and not perfectly aligned

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Each panel will be cropped to 4:3 landscape from its square, so keep the subject clear of the top and bottom eighths.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


## Batch 2 — Reviews part two, and two audiences

Two more customer pieces and the first two 'who uses this' situations. Situational panels show the moment of a decision; faces may be partial or turned away.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `review-05-randhir-custom.jpg`
- **Top-right** → `review-06-aditi-custom.jpg`
- **Bottom-left** → `who-01-wedding-families.jpg`
- **Bottom-right** → `who-02-proposal-shoppers.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (review-05-randhir-custom)** — a custom diamond ring in white gold held between two fingers against a soft blurred indoor background, face out of frame

**Top-right (review-06-aditi-custom)** — a diamond bracelet fastened on a woman's wrist, forearm resting on a wooden table in window light, face out of frame

**Bottom-left (who-01-wedding-families)** — three generations of an Indian family around a table at home, a cloth-lined tray of bridal gold between them, the eldest pointing something out, mid-conversation

**Bottom-right (who-02-proposal-shoppers)** — a young Indian couple leaning over a small tray of engagement rings, shot from behind the tray so their hands and the rings are sharp and their faces soft

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Each panel will be cropped to 4:3 landscape from its square, so keep the subject clear of the top and bottom eighths.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


## Batch 3 — The remaining four audiences

Situations rather than portraits. Each shows a different reason someone needs a jewellery price they can trust.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `who-03-investors.jpg`
- **Top-right** → `who-04-designers.jpg`
- **Bottom-left** → `who-05-nri-luxury-buyers.jpg`
- **Bottom-right** → `who-06-resale-sellers.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (who-03-investors)** — a flat overhead of eight loose round brilliant diamonds in a neat grid on white paper beside a folded grading certificate and fine steel tweezers, clinical but warm, text on the certificate illegible

**Top-right (who-04-designers)** — a jewellery designer's hands sketching a ring setting in pencil on tracing paper, with a brass compass, a colour swatch and one loose stone beside the drawing

**Bottom-left (who-05-nri-luxury-buyers)** — a person at a café table holding a phone showing a jewellery page, a small notebook of handwritten figures beside it, phone screen indistinct, face cropped out

**Bottom-right (who-06-resale-sellers)** — two or three worn gold bangles and a chain resting on the pan of a small brass jeweller's scale with a loupe beside it, honestly lit, gently scratched with age

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Each panel will be cropped to 4:3 landscape from its square, so keep the subject clear of the top and bottom eighths.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


## Batch 4 — Customer avatars, part one

Head-and-shoulders portraits, natural light, plain warm backgrounds, relaxed and candid rather than corporate. All four should look photographed by the same person on the same afternoon.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `avatar-01-namrata.jpg`
- **Top-right** → `avatar-02-ananya.jpg`
- **Bottom-left** → `avatar-03-hritik.jpg`
- **Bottom-right** → `avatar-04-kavita.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (avatar-01-namrata)** — an Indian woman in her early 30s with a warm natural smile, plain soft cream background

**Top-right (avatar-02-ananya)** — an Indian woman in her mid 20s wearing gold jhumka earrings, plain sand-coloured background

**Bottom-left (avatar-03-hritik)** — an Indian man in his early 30s in an open-collar shirt, calm expression, plain pale grey background

**Bottom-right (avatar-04-kavita)** — an Indian woman in her late 40s in a muted saree, warm settled expression, plain ivory background

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Each panel stays square and is masked to a circle at 44px, so the face must be centred, large, and well clear of every edge.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


## Batch 5 — Avatars part two, the founders, and a spare

Two more avatars and the founders portrait. The founders panel is the odd one out in framing — a two-person environmental portrait rather than a headshot — but shares the same light.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `avatar-05-sara.jpg`
- **Top-right** → `avatar-06-mihir.jpg`
- **Bottom-left** → *(not used: no founders portrait on the page)*
- **Bottom-right** → `hero-backdrop.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (avatar-05-sara)** — an Indian woman in her late 20s wearing minimal jewellery, light natural expression, plain cream background, head-and-shoulders

**Top-right (avatar-06-mihir)** — an Indian man in his late 30s in a muted kurta, calm expression, plain warm neutral background, head-and-shoulders

**Bottom-left (founders-jay-hemali)** — two founders of an Indian fine-jewellery house standing together in their workshop, a man and a woman around 40 in understated modern Indian clothing, at ease, looking to camera, workbenches and trays of loose stones softly blurred behind them — makers, not executives

**Bottom-right (hero-backdrop)** — a quiet overhead still life of a jeweller's bench: a loupe, fine tweezers, a brass scale and a few loose stones on dark walnut, no hands in frame

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Panels one and two are cropped square and masked to a circle, so centre those faces. Panel three is cropped to 4:5 portrait. Panel four becomes a page backdrop behind live text, so make it the quietest of the four: heavily out of focus, no dark tones, nothing sharp.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


## Batch 6 — Customer stories, part one

Vertical video posters. Each should look like a frame paused mid-sentence — phone-shot framing, real rooms, natural expressions — not a posed portrait. Leave the centre of each panel reasonably clear: a play button is overlaid there.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `story-01-poster.jpg`
- **Top-right** → `story-02-poster.jpg`
- **Bottom-left** → `story-03-poster.jpg`
- **Bottom-right** → `story-04-poster.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (story-01-poster)** — an Indian woman in her 30s seated at home, mid-sentence to a phone camera, wearing bridal gold

**Top-right (story-02-poster)** — an Indian man in his 30s talking to a phone camera, holding a small closed ring box

**Bottom-left (story-03-poster)** — an Indian woman in her 20s turning her head slightly to show a diamond earring to the camera, bedroom light

**Bottom-right (story-04-poster)** — an older Indian woman in a saree speaking warmly to camera in a sitting room, wearing an heirloom necklace

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Each panel will be cropped to 4:5 portrait from its square, so keep the subject clear of the left and right eighths.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


## Batch 7 — Customer stories, part two

Four more paused video frames, same treatment as batch 6.

**Output one image: a 2×2 grid, 2048×2048, four square 1024×1024 panels.**

- **Top-left** → `story-05-poster.jpg`
- **Top-right** → `story-06-poster.jpg`
- **Bottom-left** → `story-07-poster.jpg`
- **Bottom-right** → `story-08-poster.jpg`

```
Create a SINGLE image laid out as a clean 2×2 grid: four separate square
photographs, one in each quadrant, edge to edge with no gutters, no borders, no
frames and no captions. Each quadrant is its own distinct photograph, but all four
share one lighting setup, one palette and one camera treatment so they read as a
set shot in the same session.

**Top-left (story-05-poster)** — a young Indian couple side by side on a sofa, mid-conversation with a phone camera

**Top-right (story-06-poster)** — an Indian woman at a desk holding up a printed cost breakdown towards the camera, mid-sentence, the figures on the sheet illegible

**Bottom-left (story-07-poster)** — an Indian man in a kurta holding up his wrist to show a broad engraved gold kada

**Bottom-right (story-08-poster)** — an Indian woman unwrapping a small jewellery parcel, caught mid-reaction, looking down at the parcel rather than at the camera

Shot in soft diffused natural daylight from one side. Warm neutral palette of
cream (#F6EFE0), ivory and pale sand, with warm gold (#B08D57) as the only accent.
Shallow depth of field, gentle falloff, no harsh specular highlights. Matte and
lightly textured surfaces. Editorial fine-jewellery photography for an Indian
luxury house, calm and unhurried, expensive through restraint rather than sparkle.
Photorealistic, high detail, natural colour, natural Indian skin tones.

Each panel will be cropped to 4:5 portrait from its square, so keep the subject clear of the left and right eighths.

Negative, applies to all four panels: no text, no captions, no numbers, no
watermarks, no logos, no price tags, no currency symbols, no glitter or lens-flare
effects, no blue-white CGI sparkle, no over-saturated colour, no studio sweep
background, no obvious stock-photo staging, no borders or frames around the
panels, no drop shadows between panels, no collage styling.
```

---


---

# Delivered — batch one, 8 images, live on the page

| File | Slot |
|---|---|
| `case-01-namrata-solitaire-ring.jpg` | solitaire on silk |
| `case-02-ananya-jhumka-earrings.jpg` | jhumkas on linen |
| `case-03-hritik-tennis-bracelet.jpg` | tennis bracelet |
| `case-04-kavita-mangalsutra.jpg` | mangalsutra |
| `case-05-sara-pendant.jpg` | engraved pendant |
| `case-06-mihir-gold-kada.jpg` | engraved kada |
| `film-how-it-works-poster.jpg` | film poster |
| `og-share-card.jpg` | social share card |

Supplied at 2816×1536, centre-cropped to 4:3, compressed under 250 KB. 1.3 MB
for the set. The film poster has a play symbol drawn into the artwork, so the page
suppresses its own overlay on that slot (`.reel.baked-play`); regenerate without
the symbol and remove that class.

---

# Technical

| | |
|---|---|
| **Grid output** | 2048×2048, four 1024×1024 quadrants, no gutters or borders |
| **Crop safety** | subject inside the central 75% of its own quadrant |
| **Format** | PNG or JPEG from Gemini; I convert and compress |
| **Final size** | under 250 KB per image after slicing, handled by the tool |
| **Install** | `python3 tools/slice-grid.py grid.png n1 n2 n3 n4` then `python3 tools/sync-images.py` |

Missing files show a labelled placeholder at the right aspect ratio, so batches
can land in any order without the page ever looking broken.
