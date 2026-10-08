# Patient Creations: scroll-driven 3D showcase

A recreation of the "Websites in 2026" reel style: an isometric 3D world that the camera glides through as you scroll, re-themed for [patientcreations.com](https://patientcreations.com) (brand colors, fonts, logo, copy and prices taken from the live site).

## Run it

Static files, no build step. Serve the folder and open it:

```sh
npm run dev        # python3 -m http.server 8080, then open http://localhost:8080
```

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
- `main.js`: scroll → camera progress, chapter card, chapter nav, "+" hotspots, loader, mobile menu.
- `vendor/three.module.min.js`: three r169 (MIT, see `vendor/THREE-LICENSE`). Fonts are self-hosted from Fontsource (OFL).

## Promo reel

`reel/reel.html` is the 9:16 composition (desk, monitor showing the live site, caption, Instagram outro). `reel/render.cjs` captures it frame by frame and encodes `reel/patient-creations-reel.mp4` (720×1280, 30 fps, 12.2 s, silent).

```sh
npm install && npm run reel -- --handle @yourhandle
```

Without `--handle` the reel shows `PATIENTCREATIONS.COM`. Add music in your editor or app when you post.
