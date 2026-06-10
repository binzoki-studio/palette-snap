# PaletteSnap

**Image to production-ready, accessible color system.**

Drop any image into PaletteSnap and get back a complete color system: named swatches with semantic roles, OKLCH shade scales, WCAG contrast validation, and export-ready code. Built for designers and frontend developers who want accurate, accessible palettes without leaving the browser.

**Live:** [palette-snap-ten.vercel.app](https://palette-snap-ten.vercel.app/)

---

## Features

- **OKLCH shade scales** — perceptually uniform 50–950 scales for each color, generated in OKLab space
- **WCAG AA/AAA validation** — whole-palette contrast check against text and background roles
- **Export formats** — Tailwind v4, Tailwind v3, CSS custom properties, SCSS variables, JSON
- **Semantic role system** — 8 roles (text, background, primary, secondary, accent, surface, muted, border) assigned per color
- **Live preview templates** — Social, Dashboard, Poster, Brand, and Cards mockups update in real time
- **Colorblindness simulation** — Protanopia, Deuteranopia, Tritanopia via SVG filters
- **100% client-side** — no server, no upload, no account required

## Privacy

Your image never leaves your device. All processing happens in the browser — no server receives your data, no analytics, no tracking.

## Local Development

```bash
npm install
npm run dev
```

Requires Node 18+. Built with Vite + React.

## Built With

- [Vite](https://vitejs.dev/) + [React](https://react.dev/)
- [colorthief](https://lokeshdhakar.com/projects/color-thief/) — dominant color extraction
- [Björn Ottosson's OKLab math](https://bottosson.github.io/posts/oklab/) — perceptual color space
- [Name That Color](https://chir.ag/projects/name-that-color/) — human-readable color names
