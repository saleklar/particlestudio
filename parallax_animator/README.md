Parallax Animator — minimal panel

Files:
- parallax_animator.html — UI for importing PSD/images, preview and export
- parallax.js — preview, PSD parsing (using PSD.js), export to Spine-like JSON
- parallax.css — styles

Quick start (from workspace):

1. Serve the folder (recommended) to avoid PSD and image CORS issues:

```powershell
cd e:\VIBE_PROJECTS\particlestudio\parallax_animator
python -m http.server 8000
# open http://localhost:8000/parallax_animator.html
```

2. Open the clean replacement demo (camera-depth loop model):

	- `parallax_3d_demo.html`
	- In the main Particle Studio, the Parallax button now opens this file.

3. Import multiple images. The order in the file picker becomes depth order (first = far, last = near). Camera moves forward through layers continuously.

Notes & limitations:
- PSD parsing uses PSD.js (https://github.com/meltingice/psd.js). Not all PSD features are supported. For best results export PSD with visible layers.
 - If you prefer offline PSD import, download a local copy of `psd.min.js` and place it beside `parallax_animator.html`:

```powershell
cd e:\VIBE_PROJECTS\particlestudio\parallax_animator
# Download using PowerShell
Invoke-WebRequest -Uri "https://unpkg.com/psd/dist/psd.min.js" -OutFile "psd.min.js"
```

Replacement notes:
- `parallax_3d_demo.html` is a full rewrite focused on stable perpetual forward motion.
- It does not depend on PSD parsing or legacy layer-state logic.
- Export format is a simple Spine-like JSON for convenience, including embedded base64 PNGs; you may adapt it to your Spine export pipeline.

Next improvements you might ask for:
- Better hierarchy/group handling and parent bone transforms
- Per-layer motion curves, position offsets and rotation
- ZIP download of images and proper Spine atlas
- Seamless loop generator using alpha crossfade baked into PNG sequence
