# Town Team Home: Product details page

Open `index.html` through any local server (for example `npx serve` or `python3 -m http.server`).

## Files
- `index.html`: page markup (product info copied exactly from the PDF)
- `styles.css`: design tokens (colors sampled from the PDF's own fill values) and layout
- `script.js`: turntable viewer, thumbnails, rotation indicator, preloading

## Assets and where they came from
| Asset | Source |
|---|---|
| `assets/brand/town-team-home-logo.svg` | Vector paths extracted from `Artboard_4.pdf` |
| `assets/product/frames/view-01…06-*.jpg` | The six labelled views in `Artboard_5` (Front, Front left, Left, Back, Right, Front right), lifted onto identical canvases and aligned on one rotation axis |
| `assets/product/gallery/hanger.jpg` | `Artboard_8` |
| `assets/product/gallery/flat-lay.jpg` | `Artboard_7` (stray white rectangle below the garment painted out) |
| `assets/product/thumbs/front-photo.jpg` | `Artboard_6` (thumbnail for the 360° view) |
| `assets/product/thumbs/*` | Small versions of the above |
| `assets/fonts/*` | Urbanist (OFL), fallback for Neulis Sans |

`Artboard_6` (studio front) is used only as the thumbnail for the 360° view; the turntable itself uses the aligned frames so the product never jumps.

## Adding more rotation frames
Edit `productFrames` at the top of `script.js`. Plain paths are spaced evenly around 360°:

```js
const productFrames = [
  "assets/product/frames/spin-01.jpg",
  "assets/product/frames/spin-02.jpg",
  // …24, 36 or 72 frames
];
```

Use `{ src, angle, label }` objects when the angles are uneven, as with the current six views.
There are no photos at 135° and 225°; the viewer shows the nearest real view rather than inventing one.

## Fonts
Neulis Sans and Neulis Cursive load from the Adobe Fonts web project in `index.html`:

```html
<link rel="stylesheet" href="https://use.typekit.net/gpq6zma.css">
```

The kit must include Neulis Sans Light (300), Medium (500) and Bold (700, product name and prices), and Neulis Cursive Medium (500).
Regular and Hairline are not needed.
Fonts appear only on domains allowed in the web project settings on fonts.adobe.com; `localhost` is normally allowed.
Urbanist in `assets/fonts` is the fallback.
