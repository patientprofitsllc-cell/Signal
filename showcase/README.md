# Patient Creations: scroll-driven 3D showcase

A recreation of the "Websites in 2026" reel style: an isometric 3D world that the camera glides through as you scroll, re-themed for [patientcreations.com](https://patientcreations.com) (brand colors, fonts, logo, copy and prices taken from the live site).

## Run it

Static files, no build step. Serve the folder and open it:

```sh
npm run dev        # python3 -m http.server 8080, then open http://localhost:8080
```

## Live preview build and QA

```sh
npm install
npm run build:artifact   # dist/patient-creations.html: one self-contained file (JS, fonts, logo inlined)
npm run qa               # 427 checks; report + screenshots in qa/output/
```

The QA suite runs the single-file build under the same Content-Security-Policy as the artifact host. It covers 7 viewports (320px phone through 1920px desktop, plus phone landscape and portrait tablet), the dark OS setting, reduced motion, and a browser with no WebGL. Each run checks:

- that the loader clears and the fonts load,
- that every chapter button lands on its scene, with hotspots showing and never hidden under the card,
- that tooltips stay on screen,
- that nothing scrolls sideways,
- that the card fits the screen,
- the mobile menu and the Escape key,
- that the skip link comes first,
- an axe accessibility scan,
- that the canvas follows a resize,
- that the console has no errors,
- that every outbound link returns 200.

## What's in it

| Chapter | Scene | Service it sells |
|---|---|---|
| 01 Studio | HQ with loading docks and branded vans | One creative partner |
| 02 Websites | Cutaway studio with desks and live site screens | Website Special $1,250, the 3 design concepts |
| 03 Process | Winding road over hills with 4 milestones | Choose, make it yours, preview, launch |
| 04 Ads & video | Lake, soundstages, billboards, camera crane, drones | Cinematic $299, UGC $129, rental films, Monthly Ads |
| 05 Automation | Train of leads, lead engine, payment kiosk | Lead capture, follow-up, Stripe, AI agents |
| 06 Launch | Main Street shops with floating Business Cards + tower | Business Cards, $2,499 Launch Bundle |

After the 3D section: welcome headline, services, pricing, process and a call to action. Every button links to the matching page on patientcreations.com.

- `world.js`: the Three.js scene. All geometry is built from primitives and canvas textures (no model files), plus the camera path.
- Rendering: up to 4K (a 3840×2160 pixel budget) on every device, with a governor that steps resolution down only if frames run slow. Materials are physically based with studio reflections, and the textures are drawn at double resolution. Contact shadows sit under everything, and the shadow edges stay steady while the camera moves.
- A utopian look:
  - Streets have textured asphalt with painted lanes, curbs, paver sidewalks, crosswalks and glowing street lamps, layered so nothing flickers.
  - Electric cars with glass canopies, light bars and glowing rims drive both lanes.
  - People are tall, athletic figures in armored tech-wear, with a backpack loadout, a glowing visor and light-lined suits. They have a full walk cycle and are drawn as instanced parts, so the crowd stays cheap.
  - Signs are backlit neon panels.
  - The glass tower has gold fins, a rooftop garden and a crown light ring, and the studio roof carries solar arrays.
- The world is alive: vans, a car, a train, drones, boats, walking people, bird flocks, drifting cloud shadows, shimmering water, and a slow idle camera drift.
- `main.js`: scroll → camera progress, chapter card, chapter nav, "+" hotspots, loader, mobile menu.
- `vendor/three.module.min.js`: three r169 (MIT, see `vendor/THREE-LICENSE`). Fonts are self-hosted from Fontsource (OFL).

## Promo reel

`reel/patient-creations-reel.mp4` (720×1280, 30 fps, 12.2 s, silent) recreates the original "Websites in 2026" reel as a filmed-looking 3D shot:

- `reel/room.js`: a Three.js desk scene. A 24" all-in-one monitor sits in front of a window, with sheer curtains blowing in a breeze, sunlight and god rays that dim as clouds pass, dust floating in the beam, a pendant lamp, a plant, a steaming mug, a keyboard and a mouse. Screen light spills onto the desk in the colour of whatever the site is showing.
- The camera behaves like a phone in someone's hand. It opens on a rack focus, slowly pushes in, trembles and breathes, and makes small reframing corrections. Post-processing adds depth of field, bloom, lens fringing, grain and a vignette.
- `reel/reel.html`: the caption, Instagram mark and dimmed outro on top.
- `reel/render.cjs`: for every frame it draws the real site, screenshots it onto the monitor, and captures the shot.

```sh
npm install && npm run reel -- --handle @yourhandle
node reel/render.cjs --stills 0.5,4,9.5 --out-dir /tmp/stills   # quick preview frames
```

Without `--handle` the reel shows `PATIENTCREATIONS.COM`. A full render takes 15 to 30 minutes on a machine without a GPU. Add music in your editor or app when you post.
