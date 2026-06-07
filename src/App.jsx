import { useState, useRef, useCallback, useEffect } from 'react'
import { getPalette } from 'colorthief'
import './App.css'

// ── Design tokens (mirrored in CSS) ─────────────────────────────────────────
const C = {
  bg:       '#0A0A0B',
  surface:  '#111116',
  border:   '#2E2E34',
  subtle:   '#1C1C22',
  text:     '#E8E8E6',
  muted:    '#9A9AA4',
  inactive: '#62626C',
  pass:     '#5BA65B',
  fail:     '#A65B5B',
}

// ── Color utilities ──────────────────────────────────────────────────────────
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255
  let g = parseInt(hex.slice(3, 5), 16) / 255
  let b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = n => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function getLuminance(hex) {
  const ch = [hex.slice(1,3), hex.slice(3,5), hex.slice(5,7)]
    .map(x => parseInt(x, 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function getContrastRatio(h1, h2) {
  const l1 = getLuminance(h1), l2 = getLuminance(h2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function getColorName(hex) {
  const { h, s, l } = hexToHsl(hex)
  if (s < 8) {
    if (l < 10) return 'Obsidian'
    if (l < 22) return 'Charcoal'
    if (l < 38) return 'Ash'
    if (l < 55) return 'Slate'
    if (l < 72) return 'Silver'
    if (l < 88) return 'Pearl'
    return 'Snow'
  }
  if (s < 22 && h >= 15 && h < 55) {
    if (l < 30) return 'Dark Umber'
    if (l < 50) return 'Warm Taupe'
    if (l < 70) return 'Warm Sand'
    return 'Cream'
  }
  if (s < 20 && h >= 200 && h < 265) {
    if (l < 18) return 'Deep Navy'
    if (l < 35) return 'Dark Slate'
    if (l < 55) return 'Storm'
    return 'Cool Mist'
  }
  const ld = l < 22 ? 'Deep ' : l < 38 ? 'Dark ' : l > 78 ? 'Light ' : l > 90 ? 'Pale ' : ''
  if (h < 15 || h >= 345) return l > 65 ? 'Rose' : s > 65 ? 'Ember' : ld + 'Red'
  if (h < 40) return s > 70 ? 'Amber' : l < 40 ? 'Sienna' : 'Ochre'
  if (h < 65) return l < 45 ? 'Gold' : 'Canary'
  if (h < 80) return 'Lime'
  if (h < 150) return l < 25 ? 'Forest' : l < 45 ? 'Moss' : 'Sage'
  if (h < 185) return l < 32 ? 'Deep Teal' : 'Ocean Mist'
  if (h < 210) return l < 30 ? 'Midnight' : 'Sky'
  if (h < 255) return l < 22 ? 'Midnight' : l < 40 ? 'Denim' : 'Cerulean'
  if (h < 285) return l < 35 ? ld + 'Indigo' : 'Iris'
  if (h < 315) return l < 35 ? 'Plum' : 'Lavender'
  return l < 50 ? 'Berry' : 'Blush'
}

// ── A11y helpers ─────────────────────────────────────────────────────────────
const LIGHT_BG = '#FFFFFF'
const DARK_BG  = '#0A0A0B'

function badgeLevel(ratio) {
  if (ratio >= 7)   return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3)   return 'AA Lg'
  return '✗'
}

function passesAA(ratio) { return ratio >= 4.5 }

// Returns text color (#000 or #fff) that is most readable on `bgHex`
function readableText(bgHex) {
  return getLuminance(bgHex) > 0.179 ? '#000000' : '#ffffff'
}

// Nudge a color's lightness (minimum step) until it reaches `targetRatio` vs `bgHex`
function autoFixContrast(hex, bgHex, targetRatio = 4.5) {
  if (getContrastRatio(hex, bgHex) >= targetRatio) return hex
  const { h, s, l: startL } = hexToHsl(hex)
  let lightFix = null, darkFix = null
  for (let delta = 1; delta <= 100; delta++) {
    if (!lightFix) {
      const c = hslToHex(h, s, Math.min(100, startL + delta))
      if (getContrastRatio(c, bgHex) >= targetRatio) lightFix = { color: c, delta }
    }
    if (!darkFix) {
      const c = hslToHex(h, s, Math.max(0, startL - delta))
      if (getContrastRatio(c, bgHex) >= targetRatio) darkFix = { color: c, delta }
    }
    if (lightFix && darkFix) break
  }
  if (lightFix && darkFix) return lightFix.delta <= darkFix.delta ? lightFix.color : darkFix.color
  return (lightFix || darkFix)?.color ?? hex
}

// ── OKLCH conversion (Björn Ottosson's exact OKLab matrices) ─────────────────
function linearizeC(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function delinearizeC(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
function hexToOklch(hex) {
  const r = linearizeC(parseInt(hex.slice(1,3),16)/255)
  const g = linearizeC(parseInt(hex.slice(3,5),16)/255)
  const b = linearizeC(parseInt(hex.slice(5,7),16)/255)
  // Linear sRGB → LMS (Ottosson M1)
  const lms_l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
  const lms_m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
  const lms_s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
  const l_ = Math.cbrt(lms_l), m_ = Math.cbrt(lms_m), s_ = Math.cbrt(lms_s)
  // LMS → OKLab (Ottosson M2)
  const L  =  0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
  const a  =  1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
  const bv =  0.0259040371*l_ + 0.4072354613*m_ - 0.4321353280*s_
  const C  = Math.sqrt(a*a + bv*bv)
  let H    = Math.atan2(bv, a) * 180 / Math.PI
  if (H < 0) H += 360
  return { L, C, H }
}
function oklchToHex(L, C, H) {
  const hRad = H * Math.PI / 180
  const a = C * Math.cos(hRad), b = C * Math.sin(hRad)
  // OKLab → LMS_ (inverse M2)
  const l_ = L + 0.3963377774*a + 0.2158037573*b
  const m_ = L - 0.1055613458*a - 0.0638541728*b
  const s_ = L - 0.0894841775*a - 1.2914855480*b
  const l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_
  // LMS → linear sRGB (inverse M1)
  const r  = delinearizeC(Math.max(0,Math.min(1,  4.0767416621*l - 3.3077115913*m + 0.2309699292*s)))
  const g  = delinearizeC(Math.max(0,Math.min(1, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s)))
  const bv = delinearizeC(Math.max(0,Math.min(1, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s)))
  return `#${[r,g,bv].map(c => Math.round(c*255).toString(16).padStart(2,'0')).join('')}`
}
function oklchToCss(L, C, H) {
  return `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${H.toFixed(1)})`
}

// ── Shade scale generation ────────────────────────────────────────────────────
const SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
function lerpVal(a, b, t) { return a + (b - a) * t }
function stepToT(step) {
  // 50→0, 100→0.1 … 500→0.5 … 900→0.9, 950→0.95
  return step === 50 ? 0 : step === 950 ? 0.95 : step / 1000
}
function generateScale(hex) {
  const { L: L500, C: C500, H } = hexToOklch(hex)
  const L_light = 0.98, C_light = Math.min(0.025, C500 * 0.15)
  const L_dark  = 0.15, C_dark  = C500 * 0.55
  const scale = {}
  for (const step of SHADE_STEPS) {
    const t = stepToT(step)
    let L, C
    if (t <= 0.5) {
      const u = t / 0.5
      L = lerpVal(L_light, L500, u); C = lerpVal(C_light, C500, u)
    } else {
      const u = (t - 0.5) / 0.45
      L = lerpVal(L500, L_dark, u); C = lerpVal(C500, C_dark, u)
    }
    scale[step] = { hex: oklchToHex(L, C, H), oklch: oklchToCss(L, C, H) }
  }
  return scale
}

function toKebab(name) { return name.toLowerCase().replace(/\s+/g, '-') }

// Deduplicate names — if two colors share a name, append -2, -3, etc.
function uniqueKebabNames(names) {
  const count = {}
  names.forEach(n => { count[n] = (count[n] || 0) + 1 })
  const seen = {}
  return names.map(n => {
    const k = toKebab(n)
    if (count[n] === 1) return k
    seen[n] = (seen[n] || 0) + 1
    return `${k}-${seen[n]}`
  })
}

// ── Semantic roles ────────────────────────────────────────────────────────────
const ROLE_ORDER  = [null, 'text', 'bg', 'primary', 'secondary', 'accent']
const ROLE_LABELS = { text: 'Text', bg: 'BG', primary: '1°', secondary: '2°', accent: 'ACC' }
const ROLE_PROP   = { text: 'text', bg: 'background', primary: 'primary', secondary: 'secondary', accent: 'accent' }

function autoAssignRoles(pal) {
  if (!pal.length) return {}
  const items = pal.map((hex, i) => ({ i, lum: getLuminance(hex), sat: hexToHsl(hex).s }))
  const byLum = [...items].sort((a, b) => a.lum - b.lum)
  const result = {}, used = new Set()
  result[byLum[0].i] = 'text'; used.add(byLum[0].i)
  const lightestIdx = byLum[byLum.length - 1].i
  if (!used.has(lightestIdx)) { result[lightestIdx] = 'bg'; used.add(lightestIdx) }
  const remaining = items.filter(x => !used.has(x.i)).sort((a, b) => b.sat - a.sat)
  ;['primary', 'secondary', 'accent'].forEach((role, ri) => {
    if (remaining[ri]) result[remaining[ri].i] = role
  })
  return result
}

// Custom export template engine — variables: {name} {hex} {rgb} {hsl} {oklch} {role} {index}
const CUSTOM_PRESET_VALUES = {
  'Sass map':    '  ${name}: {hex},',
  'JS object':   "  '{name}': '{hex}',",
  'Swift':       'let {name} = UIColor(hex: "{hex}")',
  'Android XML': '<color name="{name}">{hex}</color>',
}

function applyTemplate(tpl, hex, i, rolesMap) {
  const name = toKebab(getColorName(hex))
  const { h, s, l } = hexToHsl(hex)
  const rv = parseInt(hex.slice(1,3),16), gv = parseInt(hex.slice(3,5),16), bv2 = parseInt(hex.slice(5,7),16)
  const { L, C, H } = hexToOklch(hex)
  const role = rolesMap[i] ?? ''
  return tpl
    .replace(/{name}/g, name)
    .replace(/{hex}/g, hex)
    .replace(/{rgb}/g, `${rv}, ${gv}, ${bv2}`)
    .replace(/{hsl}/g, `${h}, ${s}%, ${l}%`)
    .replace(/{oklch}/g, oklchToCss(L, C, H))
    .replace(/{role}/g, role)
    .replace(/{index}/g, String(i + 1))
}

const SCALE_EXPORT_TABS = ['tw4', 'tw3', 'css', 'json']
const SCALE_EXPORT_FORMATS = {
  tw4: (palette, scales, names) => {
    const keys = uniqueKebabNames(names)
    return `@theme {\n${palette.map((_, i) =>
      SHADE_STEPS.map(step => `  --color-${keys[i]}-${step}: ${scales[i][step].oklch};`).join('\n')
    ).join('\n')}\n}`
  },
  tw3: (palette, scales, names) => {
    const keys = uniqueKebabNames(names)
    const obj = {}
    palette.forEach((_, i) => {
      obj[keys[i]] = Object.fromEntries(SHADE_STEPS.map(step => [step, scales[i][step].hex]))
    })
    return `colors: ${JSON.stringify(obj, null, 2)}`
  },
  css: (palette, scales, names) => {
    const keys = uniqueKebabNames(names)
    return `:root {\n${palette.map((_, i) =>
      SHADE_STEPS.map(step => `  --color-${keys[i]}-${step}: ${scales[i][step].hex};`).join('\n')
    ).join('\n')}\n}`
  },
  json: (palette, scales, names) => {
    const keys = uniqueKebabNames(names)
    const obj = {}
    palette.forEach((_, i) => {
      obj[keys[i]] = Object.fromEntries(SHADE_STEPS.map(step => [step, { hex: scales[i][step].hex, oklch: scales[i][step].oklch }]))
    })
    return JSON.stringify(obj, null, 2)
  },
}

// ── Export formats ───────────────────────────────────────────────────────────
const EXPORT_FORMATS = {
  css:      (p) => `:root {\n${p.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`,
  tailwind: (p) => `colors: {\n${p.map((h, i) => `  'color-${i + 1}': '${h}',`).join('\n')}\n}`,
  json:     (p) => JSON.stringify(p, null, 2),
  scss:     (p) => p.map((h, i) => `$color-${i + 1}: ${h};`).join('\n'),
}
const EXPORT_TABS = ['css', 'tailwind', 'json', 'scss', 'custom']

function buildExportCode(tab, palette, rolesMap, customTpl) {
  if (tab === 'custom') {
    return palette.map((hex, i) => applyTemplate(customTpl, hex, i, rolesMap)).join('\n')
  }
  let code = EXPORT_FORMATS[tab](palette)
  // Append role variables for CSS / SCSS when roles exist
  const roleEntries = Object.entries(rolesMap).filter(([idx]) => palette[+idx])
  if (roleEntries.length > 0 && (tab === 'css' || tab === 'scss')) {
    const vars = roleEntries.map(([idx, role]) => {
      const hex = palette[+idx]
      const prop = ROLE_PROP[role]
      return tab === 'css' ? `  --color-${prop}: ${hex};` : `$color-${prop}: ${hex};`
    })
    if (tab === 'css') code = code.replace('\n}', '\n  /* roles */\n' + vars.join('\n') + '\n}')
    else code = code + '\n/* roles */\n' + vars.join('\n')
  }
  return code
}

function renderCodeHTML(code, tab) {
  let html = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  html = html.replace(/(#[0-9a-fA-F]{6})/g, '<span class="code-hex">$1</span>')
  if (tab === 'css') {
    html = html
      .replace(/(--color-\d+)/g, '<span class="code-prop">$1</span>')
      .replace(/(:root)/g, '<span class="code-sel">$1</span>')
  } else if (tab === 'tailwind') {
    html = html.replace(/('color-\d+')/g, '<span class="code-prop">$1</span>')
  } else if (tab === 'scss') {
    html = html.replace(/(\$color-\d+)/g, '<span class="code-prop">$1</span>')
  }
  return html
}

// ── Vision filter matrices ───────────────────────────────────────────────────
// IDs use `filter-*` prefix so they never clash with other element IDs
const VISION_FILTERS = {
  normal:       { id: null,                  matrix: null },
  protanopia:   { id: 'filter-protanopia',   matrix: '0.567,0.433,0,0,0, 0.558,0.442,0,0,0, 0,0.242,0.758,0,0, 0,0,0,1,0' },
  deuteranopia: { id: 'filter-deuteranopia', matrix: '0.625,0.375,0,0,0, 0.7,0.3,0,0,0, 0,0.3,0.7,0,0, 0,0,0,1,0' },
  tritanopia:   { id: 'filter-tritanopia',   matrix: '0.95,0.05,0,0,0, 0,0.433,0.567,0,0, 0,0.475,0.525,0,0, 0,0,0,1,0' },
}

// ── Icons ────────────────────────────────────────────────────────────────────
function LockIcon({ locked }) {
  return locked ? (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="6" rx="1.5" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="6" rx="1.5" opacity="0.5" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0V2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <path d="M8 4V2.5A1.5 1.5 0 0 0 6.5 1h-4A1.5 1.5 0 0 0 1 2.5v4A1.5 1.5 0 0 0 2.5 8H4" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M6 1 L1.5 3v3c0 2.8 2 4.5 4.5 5 2.5-.5 4.5-2.2 4.5-5V3Z" />
    </svg>
  )
}

// ── Landing page preview ──────────────────────────────────────────────────────
// 8-digit hex: append alpha byte (00–ff) to a 6-char #rrggbb
function ha(hex, alpha) {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

function LandingPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (!palette.length) return (
    <div className="lp-empty">Load an image to see a preview</div>
  )
  const byRole = (role, fallbackIdx) => {
    const entry = Object.entries(roles).find(([, r]) => r === role)
    return entry ? (palette[+entry[0]] ?? palette[fallbackIdx ?? 0]) : palette[fallbackIdx ?? 0]
  }
  const bgColor   = byRole('bg',        palette.length - 1)
  const textCol   = byRole('text',      0)
  const primary   = byRole('primary',   Math.min(1, palette.length - 1))
  const secondary = byRole('secondary', Math.min(2, palette.length - 1))
  const accent    = byRole('accent',    Math.min(3, palette.length - 1))
  const pageBg    = uiBg === 'dark' ? textCol  : bgColor
  const pageText  = uiBg === 'dark' ? bgColor  : textCol
  const primaryFg = readableText(primary)

  // Darkest and lightest raw colors for footer
  const sortedByLum = [...palette].sort((a, b) => getLuminance(a) - getLuminance(b))
  const darkest  = sortedByLum[0]
  const lightest = sortedByLum[sortedByLum.length - 1]

  return (
    <div className="lp" style={{ background: pageBg }}>
      {/* Navbar */}
      <nav className="lp-nav" style={{ borderBottom: `0.5px solid ${ha(secondary, 0.35)}` }}>
        <div className="lp-nav-logo">
          <span className="lp-logo-dot" style={{ background: primary }} />
          <span className="lp-logo-text" style={{ color: pageText }}>Brand</span>
        </div>
        <div className="lp-nav-links">
          {['Features', 'Pricing', 'Docs'].map(l => (
            <span key={l} className="lp-nav-link" style={{ color: ha(pageText, 0.52) }}>{l}</span>
          ))}
        </div>
        <button className="lp-nav-cta" style={{ background: primary, color: primaryFg }}>
          Get Started
        </button>
      </nav>

      {/* Hero */}
      <section className="lp-hero" style={{ background: pageBg }}>
        <h1 className="lp-heading" style={{ color: pageText }}>
          Build something beautiful
        </h1>
        <p className="lp-subtext" style={{ color: ha(pageText, 0.65) }}>
          Your palette applied to a real interface. Every color, in context.
        </p>
        <div className="lp-hero-btns">
          <button className="lp-btn-primary" style={{ background: primary, color: primaryFg }}>
            Get Started Free
          </button>
          <button className="lp-btn-ghost" style={{ border: `1.5px solid ${primary}`, color: primary }}>
            See how it works
          </button>
        </div>
      </section>

      {/* Feature cards */}
      <section className="lp-features" style={{ background: ha(secondary, 0.08) }}>
        {[
          { dot: primary,   title: 'Smart Extraction', desc: 'Pull the best colors from any image automatically.' },
          { dot: accent,    title: 'Accessibility',     desc: 'WCAG contrast checks built right in.' },
          { dot: secondary, title: 'Export Ready',      desc: 'CSS, Tailwind, JSON, SCSS — one click.' },
        ].map(({ dot, title, desc }) => (
          <div key={title} className="lp-card"
            style={{ background: pageBg, border: `1px solid ${ha(secondary, 0.30)}` }}>
            <span className="lp-card-icon" style={{ background: dot }} />
            <span className="lp-card-title" style={{ color: pageText }}>{title}</span>
            <span className="lp-card-desc" style={{ color: ha(pageText, 0.55) }}>{desc}</span>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="lp-footer" style={{ background: darkest }}>
        <span className="lp-footer-dot" style={{ background: primary }} />
        <span className="lp-footer-text" style={{ color: ha(lightest, 0.72) }}>Made with PaletteSnap</span>
      </footer>

      {/* Scroll hint */}
      <div className="lp-scroll-hint" style={{ color: ha(pageText, 0.30) }}>scroll to see more ↓</div>
    </div>
  )
}

// ── UI Preview mockup (kept for reference, no longer rendered) ────────────────
function UIPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (palette.length < 2) return (
    <div className="uip-empty">Load an image to see a preview</div>
  )
  const byRole = (role, fallback) => {
    const entry = Object.entries(roles).find(([, r]) => r === role)
    return entry ? (palette[+entry[0]] ?? fallback) : fallback
  }
  const nav   = byRole('bg',        palette[1] || palette[0])
  const cta   = byRole('primary',   palette[3] || palette[0])
  const card1 = byRole('secondary', palette[0])
  const card2 = byRole('accent',    palette[2] || palette[1])
  const navFg = readableText(nav)
  const ctaFg = readableText(cta)
  const cardBg = uiBg === 'dark' ? '#1A1A1C' : '#F5F5F3'
  const cardInner = uiBg === 'dark' ? '#2A2A2E' : '#fff'
  const cardLbl   = uiBg === 'dark' ? '#888' : '#555'
  return (
    <div className="uip" style={{ background: cardBg }}>
      <div className="uip-nav" style={{ background: nav }}>
        <span className="uip-dot" style={{ background: cta }} />
        <span className="uip-brand" style={{ color: navFg }}>Brand</span>
        <span className="uip-cta" style={{ background: cta, color: ctaFg }}>CTA</span>
      </div>
      <div className="uip-hero" style={{ background: nav }}>
        <div className="uip-heading" style={{ color: navFg }}>Hello World</div>
        <div className="uip-sub" style={{ color: navFg, opacity: 0.6 }}>Your palette on a real UI</div>
      </div>
      <div className="uip-cards" style={{ background: cardBg }}>
        <div className="uip-card" style={{ background: cardInner }}>
          <span className="uip-card-dot" style={{ background: card1 }} />
          <span className="uip-card-lbl" style={{ color: cardLbl }}>Card</span>
        </div>
        <div className="uip-card" style={{ background: cardInner }}>
          <span className="uip-card-dot" style={{ background: card2 }} />
          <span className="uip-card-lbl" style={{ color: cardLbl }}>Card</span>
        </div>
      </div>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Core palette state ───────────────────────────────────────────────────
  const [colorCount, setColorCount] = useState(6)
  const [palette, setPalette]       = useState([])
  const [locks, setLocks]           = useState(new Set())
  const [openSlider, setOpenSlider] = useState(null)
  const [sliderHsl, setSliderHsl]   = useState(null)
  const [history, setHistory]       = useState([])

  // ── Image / input state ──────────────────────────────────────────────────
  const [preview, setPreview]       = useState(null)
  const [inputMode, setInputMode]   = useState('upload')
  const [urlInput, setUrlInput]     = useState('')
  const [urlError, setUrlError]     = useState(null)
  const [dragging, setDragging]     = useState(false)
  const [samplingMode, setSamplingMode] = useState('global')
  const [regionPos, setRegionPos]   = useState({ x: 0.5, y: 0.5 })

  // ── UI / panel state ─────────────────────────────────────────────────────
  const [copied, setCopied]         = useState(null)
  const [visionMode, setVisionMode] = useState('normal')
  const [exportTab, setExportTab]       = useState('css')
  const [scaleExportTab, setScaleExportTab] = useState('tw4')
  const [currentView, setCurrentView] = useState('extract')

  // ── Sprint 2.3 state ─────────────────────────────────────────────────────
  const [redoHistory, setRedoHistory]       = useState([])
  const [uiBg, setUiBg]                     = useState('light')
  const [roles, setRoles]                   = useState({})
  const [customTemplate, setCustomTemplate] = useState('{name}: {hex};')

  // ── Sprint 2.5 state ─────────────────────────────────────────────────────
  const [leftTab, setLeftTab]           = useState('swatches') // 'swatches' | 'scales'
  const [showContrast, setShowContrast] = useState(false)
  const [a11yOpen, setA11yOpen]         = useState(false)
  const [exportOpen, setExportOpen]     = useState(true)

  // ── Panel resize state ───────────────────────────────────────────────────
  const [panelWidths, setPanelWidthsState] = useState({ left: 340, right: 280 })
  const panelWidthsRef = useRef({ left: 340, right: 280 })
  const dividerDragRef = useRef(null)

  const setPanelWidths = (v) => {
    panelWidthsRef.current = v
    setPanelWidthsState(v)
  }

  // ── Refs ─────────────────────────────────────────────────────────────────
  const imgRef          = useRef(null)
  const uploadInputRef  = useRef(null)
  const cameraInputRef  = useRef(null)
  const imageWrapRef    = useRef(null)
  const cropCanvasRef   = useRef(null)
  const colorCountRef   = useRef(6)
  const locksRef        = useRef(locks)
  const paletteRef      = useRef(palette)
  const isDraggingRegion    = useRef(false)
  const customTemplateRef   = useRef(null)
  const customSelRef        = useRef({ start: 0, end: 0 })

  colorCountRef.current = colorCount
  locksRef.current = locks
  paletteRef.current = palette

  // ── History ──────────────────────────────────────────────────────────────
  const pushToHistory = useCallback((p, l, c) => {
    setHistory(h => [
      ...h.slice(-9),
      { palette: [...p], locks: [...l], colorCount: c, at: Date.now() },
    ])
    setRedoHistory([])
  }, [])

  const restoreFromHistory = (entry) => {
    setPalette(entry.palette)
    setLocks(new Set(entry.locks))
    setColorCount(entry.colorCount)
    setOpenSlider(null)
    setCurrentView('extract')
  }

  const undo = () => {
    if (!history.length) return
    const prev = history[history.length - 1]
    setRedoHistory(r => [...r.slice(-9), { palette: [...palette], locks: [...locks], colorCount, at: Date.now() }])
    setPalette(prev.palette)
    setLocks(new Set(prev.locks))
    setColorCount(prev.colorCount)
    setOpenSlider(null)
    setHistory(h => h.slice(0, -1))
  }

  const redo = () => {
    if (!redoHistory.length) return
    const next = redoHistory[redoHistory.length - 1]
    setHistory(h => [...h.slice(-9), { palette: [...palette], locks: [...locks], colorCount, at: Date.now() }])
    setPalette(next.palette)
    setLocks(new Set(next.locks))
    setColorCount(next.colorCount)
    setOpenSlider(null)
    setRedoHistory(r => r.slice(0, -1))
  }

  // ── Panel divider drag ────────────────────────────────────────────────────
  useEffect(() => {
    const onMouseMove = (e) => {
      const d = dividerDragRef.current
      if (!d) return
      const delta = e.clientX - d.startX
      const totalWidth = window.innerWidth
      const { left, right } = panelWidthsRef.current

      if (d.side === 'left') {
        let newLeft = Math.min(440, Math.max(220, d.startLeft + delta))
        const center = totalWidth - newLeft - right - 8
        if (center < 300) newLeft = totalWidth - right - 308
        setPanelWidths({ left: newLeft, right })
      } else {
        let newRight = Math.min(380, Math.max(200, d.startRight - delta))
        const center = totalWidth - left - newRight - 8
        if (center < 300) newRight = totalWidth - left - 308
        setPanelWidths({ left, right: newRight })
      }
    }
    const onMouseUp = () => { dividerDragRef.current = null }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleDividerMouseDown = (side, e) => {
    e.preventDefault()
    dividerDragRef.current = {
      side,
      startX: e.clientX,
      startLeft:  panelWidthsRef.current.left,
      startRight: panelWidthsRef.current.right,
    }
  }

  // ── Global extraction ────────────────────────────────────────────────────
  const runExtraction = useCallback(async (count, currentPalette, currentLocks) => {
    if (!imgRef.current) return null
    const colors = await getPalette(imgRef.current, { colorCount: count })
    const extracted = colors.map(c => c.hex())
    return Array.from({ length: count }, (_, i) =>
      currentLocks.has(i) && currentPalette[i]
        ? currentPalette[i]
        : (extracted[i] ?? extracted[extracted.length - 1])
    )
  }, [])

  // ── Region extraction ────────────────────────────────────────────────────
  const runRegionExtraction = useCallback(async (pos) => {
    if (!imgRef.current || !cropCanvasRef.current) return
    const img = imgRef.current
    if (!img.naturalWidth) return
    const size = Math.min(img.naturalWidth, img.naturalHeight) * 0.5
    const sx = Math.max(0, Math.round(img.naturalWidth * pos.x - size / 2))
    const sy = Math.max(0, Math.round(img.naturalHeight * pos.y - size / 2))
    const sw = Math.min(Math.round(size), img.naturalWidth - sx)
    const sh = Math.min(Math.round(size), img.naturalHeight - sy)
    const canvas = cropCanvasRef.current
    canvas.width = sw; canvas.height = sh
    canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const count = colorCountRef.current
    const cl = locksRef.current
    const cp = paletteRef.current
    const colors = await getPalette(canvas, { colorCount: count })
    const extracted = colors.map(c => c.hex())
    const newPalette = Array.from({ length: count }, (_, i) =>
      cl.has(i) && cp[i] ? cp[i] : (extracted[i] ?? extracted[extracted.length - 1])
    )
    setPalette(newPalette)
  }, [])

  const onImageLoad = async () => {
    const count = colorCountRef.current
    const colors = await getPalette(imgRef.current, { colorCount: count })
    const pal = colors.map(c => c.hex())
    setPalette(pal)
    setRoles(autoAssignRoles(pal))
    setLocks(new Set())
    setOpenSlider(null)
    setHistory([])
    setRedoHistory([])
    setUrlError(null)
    setSamplingMode('global')
    setRegionPos({ x: 0.5, y: 0.5 })
  }

  const onImageError = () => {
    setPreview(null)
    setUrlError("Couldn't load that image — try downloading it and uploading directly.")
  }

  // ── File / drop ──────────────────────────────────────────────────────────
  const extractFromFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPreview(URL.createObjectURL(file))
    setPalette([])
    setLocks(new Set())
    setOpenSlider(null)
    setUrlError(null)
  }, [])

  const onFileChange = (e) => extractFromFile(e.target.files[0])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    extractFromFile(e.dataTransfer.files[0])
  }

  // ── URL ──────────────────────────────────────────────────────────────────
  const handleUrlLoad = () => {
    const url = urlInput.trim()
    if (!url) return
    setUrlError(null)
    setPreview(url)
    setPalette([])
    setLocks(new Set())
    setOpenSlider(null)
  }

  const resetToInput = () => {
    setPreview(null)
    setUrlError(null)
  }

  // ── Color count ──────────────────────────────────────────────────────────
  const activeLocksCount = [...locks].filter(i => i < colorCount).length
  const canDecrement = colorCount > 3 && (colorCount - 1) >= activeLocksCount
  const canIncrement = colorCount < 10

  const handleCountChange = async (delta) => {
    const newCount = colorCount + delta
    if (newCount < 3 || newCount > 10) return
    if (newCount < activeLocksCount) return
    pushToHistory(palette, locks, colorCount)
    const newLocks = new Set([...locks].filter(i => i < newCount))
    setLocks(newLocks)
    setColorCount(newCount)
    setOpenSlider(null)
    if (imgRef.current && palette.length > 0) {
      const np = samplingMode === 'region'
        ? await (async () => {
            await runRegionExtraction(regionPos)
            return null
          })()
        : await runExtraction(newCount, palette, newLocks)
      if (np) setPalette(np)
    }
  }

  // ── Sampling toggle ──────────────────────────────────────────────────────
  const toggleSampling = () => {
    const next = samplingMode === 'global' ? 'region' : 'global'
    setSamplingMode(next)
    if (next === 'global' && palette.length > 0) {
      runExtraction(colorCountRef.current, paletteRef.current, locksRef.current)
        .then(np => { if (np) setPalette(np) })
    } else if (next === 'region' && preview) {
      runRegionExtraction(regionPos)
    }
  }

  // ── Region drag ──────────────────────────────────────────────────────────
  const getPosFromEvent = (e) => {
    const rect = imageWrapRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  const handleImageMouseDown = (e) => {
    if (samplingMode !== 'region') return
    isDraggingRegion.current = true
    setRegionPos(getPosFromEvent(e))
  }

  const handleImageMouseMove = (e) => {
    if (!isDraggingRegion.current) return
    setRegionPos(getPosFromEvent(e))
  }

  const handleImageMouseUp = (e) => {
    if (!isDraggingRegion.current) return
    isDraggingRegion.current = false
    const pos = getPosFromEvent(e)
    setRegionPos(pos)
    runRegionExtraction(pos)
  }

  // ── Lock ─────────────────────────────────────────────────────────────────
  const toggleLock = (i, e) => {
    e.stopPropagation()
    setLocks(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
    if (openSlider === i) setOpenSlider(null)
  }

  // ── HSL ──────────────────────────────────────────────────────────────────
  const handleSwatchClick = (i) => {
    if (locks.has(i)) { handleCopy(palette[i], i); return }
    if (openSlider === i) { setOpenSlider(null); return }
    pushToHistory(palette, locks, colorCount)
    setOpenSlider(i)
    setSliderHsl(hexToHsl(palette[i]))
  }

  const onHslChange = (key, val) => {
    const updated = { ...sliderHsl, [key]: +val }
    setSliderHsl(updated)
    const newHex = hslToHex(updated.h, updated.s, updated.l)
    setPalette(p => p.map((h, idx) => idx === openSlider ? newHex : h))
  }

  // ── Copy / export ────────────────────────────────────────────────────────
  const handleCopy = (hex, i) => {
    navigator.clipboard.writeText(hex)
    setCopied(i)
    setTimeout(() => setCopied(null), 1000)
  }

  const handleExport = () => {
    let text
    if (leftTab === 'scales') {
      const scalesData = palette.map(hex => generateScale(hex))
      const names = palette.map(hex => getColorName(hex))
      text = SCALE_EXPORT_FORMATS[scaleExportTab](palette, scalesData, names)
    } else {
      text = buildExportCode(exportTab, palette, roles, customTemplate)
    }
    navigator.clipboard.writeText(text)
    setCopied('export')
    setTimeout(() => setCopied(null), 1000)
  }

  const downloadPNG = () => {
    if (!palette.length) return
    const SW = 120, SH = 90, PAD = 8, LABEL_H = 14
    const canvas = document.createElement('canvas')
    canvas.width  = palette.length * SW
    canvas.height = SH + LABEL_H + PAD * 2
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0A0A0B'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    palette.forEach((hex, i) => {
      const x = i * SW + PAD / 2
      ctx.fillStyle = hex
      ctx.beginPath()
      ctx.roundRect?.(x, PAD, SW - PAD, SH, 6)
      ctx.fill()
      ctx.fillStyle = readableText(hex)
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(hex, x + (SW - PAD) / 2, PAD + SH - PAD)
    })
    const a = document.createElement('a')
    a.download = `palette-${Date.now()}.png`
    a.href = canvas.toDataURL()
    a.click()
  }

  const downloadTXT = () => {
    if (!palette.length) return
    const lines = palette.map(hex => {
      const name = getColorName(hex)
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
      return `${name}: ${hex} (RGB: ${r}, ${g}, ${b})`
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.download = `palette-${Date.now()}.txt`
    a.href = URL.createObjectURL(blob)
    a.click()
  }

  // ── HSL gradient tracks ──────────────────────────────────────────────────
  const hueGrad   = 'linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))'
  const satGrad   = sliderHsl ? `linear-gradient(to right,hsl(${sliderHsl.h},0%,${sliderHsl.l}%),hsl(${sliderHsl.h},100%,${sliderHsl.l}%))` : ''
  const lightGrad = sliderHsl ? `linear-gradient(to right,hsl(${sliderHsl.h},${sliderHsl.s}%,5%),hsl(${sliderHsl.h},${sliderHsl.s}%,50%),hsl(${sliderHsl.h},${sliderHsl.s}%,95%))` : ''

  // ── Auto-fix contrast ────────────────────────────────────────────────────
  const handleAutoFix = (i, bgHex) => {
    const fixed = autoFixContrast(palette[i], bgHex)
    if (fixed !== palette[i]) {
      pushToHistory(palette, locks, colorCount)
      setPalette(p => p.map((h, idx) => idx === i ? fixed : h))
    }
  }

  // ── Accessibility score ──────────────────────────────────────────────────
  // A color passes if it achieves AA (≥4.5:1) against either light or dark bg
  const passCount = palette.filter(hex =>
    getContrastRatio(hex, LIGHT_BG) >= 4.5 || getContrastRatio(hex, DARK_BG) >= 4.5
  ).length
  const scoreColor = palette.length === 0 ? C.muted
    : passCount === palette.length ? C.pass          // all pass: green
    : passCount >= Math.ceil(palette.length / 2) ? '#C49A2A'  // some fail: amber
    : C.fail                                         // most fail: red

  // ── Vision filter style — applied to whole center panel ──────────────────
  const activePanelFilter = VISION_FILTERS[visionMode]?.id
    ? { filter: `url(#${VISION_FILTERS[visionMode].id})` }
    : {}

  // ── Export code ──────────────────────────────────────────────────────────
  const exportCode = palette.length > 0 && leftTab !== 'scales'
    ? buildExportCode(exportTab, palette, roles, customTemplate)
    : ''
  const exportCodeHTML = exportCode && exportTab !== 'custom'
    ? renderCodeHTML(exportCode, exportTab)
    : exportCode.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const scaleExportCodeHTML = (() => {
    if (leftTab !== 'scales' || palette.length === 0) return ''
    const scalesData = palette.map(hex => generateScale(hex))
    const names = palette.map(hex => getColorName(hex))
    const code = SCALE_EXPORT_FORMATS[scaleExportTab](palette, scalesData, names)
    let html = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    html = html.replace(/(#[0-9a-fA-F]{6})/g, '<span class="code-hex">$1</span>')
    html = html.replace(/(oklch\([^)]+\))/g, '<span class="code-hex">$1</span>')
    html = html.replace(/(--color-[\w-]+-\d+)/g, '<span class="code-prop">$1</span>')
    if (scaleExportTab === 'tw4') html = html.replace(/(@theme)/g, '<span class="code-sel">$1</span>')
    if (scaleExportTab === 'css') html = html.replace(/(:root)/g, '<span class="code-sel">$1</span>')
    return html
  })()

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* Hidden SVG color-vision filters */}
      <svg className="vision-defs" aria-hidden="true">
        <defs>
          {Object.entries(VISION_FILTERS)
            .filter(([, v]) => v.id)
            .map(([, { id, matrix }]) => (
              <filter key={id} id={id} colorInterpolationFilters="sRGB">
                <feColorMatrix type="matrix" values={matrix} />
              </filter>
            ))}
        </defs>
      </svg>

      {/* Hidden canvas for region sampling */}
      <canvas ref={cropCanvasRef} style={{ display: 'none' }} />

      {/* ── Titlebar ── */}
      <header className="titlebar">
        <div className="titlebar-left">
          <span className="titlebar-dot" />
          <span className="titlebar-name">PaletteSnap</span>
        </div>
        <div className="titlebar-center">
          <ShieldIcon />
          <span className="titlebar-privacy">100% local · no upload · no account</span>
        </div>
        <div className="titlebar-right">
          {[['Extract', 'extract'], ['History', 'history']].map(([label, view]) => (
            <button
              key={view}
              className={`titlebar-tab ${currentView === view ? 'titlebar-tab--active' : ''}`}
              onClick={() => setCurrentView(view)}
            >{label}</button>
          ))}
        </div>
      </header>

      {/* ── Workspace ── */}
      <div className="workspace">

        {/* ═══════════ PANEL 1: IMAGE + WORKSPACE ═══════════ */}
        <aside className="panel panel--image" style={{ width: panelWidths.left }}>

          {/* Panel header */}
          <div className="panel-header">
            <span className="panel-label">IMAGE</span>
            {preview && (
              <button className="panel-action" onClick={resetToInput} title="Change image">↺</button>
            )}
          </div>

          {/* Sampling toggle */}
          {preview && (
            <div className="sampling-toggle">
              {['global', 'region'].map(m => (
                <button
                  key={m}
                  className={`sampling-btn ${samplingMode === m ? 'sampling-btn--active' : ''}`}
                  onClick={toggleSampling}
                >{m}</button>
              ))}
            </div>
          )}

          {/* Image preview / drop zone */}
          <div className="image-container-wrap">
            {preview ? (
              <div
                className={`image-container ${samplingMode === 'region' ? 'image-container--region' : ''}`}
                ref={imageWrapRef}
                onMouseDown={handleImageMouseDown}
                onMouseMove={handleImageMouseMove}
                onMouseUp={handleImageMouseUp}
                onMouseLeave={handleImageMouseUp}
              >
                <img
                  ref={imgRef}
                  src={preview}
                  alt="uploaded"
                  className="preview-img"
                  crossOrigin="anonymous"
                  onLoad={onImageLoad}
                  onError={onImageError}
                  draggable={false}
                />
                {samplingMode === 'region' && (
                  <div
                    className="region-cursor"
                    style={{ left: `${regionPos.x * 100}%`, top: `${regionPos.y * 100}%` }}
                  />
                )}
              </div>
            ) : (
              <div className="image-placeholder">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.inactive} strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span>No image loaded</span>
              </div>
            )}
          </div>

          {/* Input mode switcher */}
          <div className="input-modes">
            {['upload', 'url', 'camera'].map(m => (
              <button
                key={m}
                className={`input-mode-btn ${inputMode === m ? 'input-mode-btn--active' : ''}`}
                onClick={() => { setInputMode(m); setUrlError(null) }}
              >{m}</button>
            ))}
          </div>

          {/* Mode panels */}
          {inputMode === 'upload' && (
            <label
              className={`dropzone-sm ${dragging ? 'dropzone-sm--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="dz-hint">drop image or click</span>
              <input ref={uploadInputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
            </label>
          )}

          {inputMode === 'url' && (
            <div className="url-mode">
              <div className="url-row-sm">
                <input
                  type="url"
                  className="url-input-sm"
                  placeholder="https://…"
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setUrlError(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleUrlLoad()}
                  autoFocus
                />
                <button className="url-go" onClick={handleUrlLoad} disabled={!urlInput.trim()}>→</button>
              </div>
              {urlError && <p className="url-err">{urlError}</p>}
            </div>
          )}

          {inputMode === 'camera' && (
            <button className="camera-mode-btn" onClick={() => cameraInputRef.current?.click()}>
              open camera
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onFileChange} />
            </button>
          )}

          {/* Controls: undo + redo + stepper */}
          <div className="image-controls">
            <div className="ctrl-undo-redo">
              <button className="ctrl-btn" onClick={undo} disabled={history.length === 0}>←</button>
              <button className="ctrl-btn" onClick={redo} disabled={redoHistory.length === 0}>→</button>
            </div>
            <div className="stepper">
              <button className="stepper-btn" onClick={() => handleCountChange(-1)} disabled={!canDecrement}>−</button>
              <span className="stepper-count">{colorCount}</span>
              <button className="stepper-btn" onClick={() => handleCountChange(1)} disabled={!canIncrement}>+</button>
            </div>
          </div>

          {/* ── Left panel tab switcher ── */}
          <div className="left-tabs">
            <button
              className={`left-tab ${leftTab === 'swatches' ? 'left-tab--active' : ''}`}
              onClick={() => setLeftTab('swatches')}
            >Swatches</button>
            <button
              className={`left-tab ${leftTab === 'scales' ? 'left-tab--active' : ''}`}
              onClick={() => setLeftTab('scales')}
            >Scales</button>
          </div>

          {/* ── Swatches tab ── */}
          {leftTab === 'swatches' && (
            <div className="left-tab-content">
              {palette.length > 0 ? (
                <div className="swatch-list">
                  {palette.map((hex, i) => {
                    const name = getColorName(hex)
                    const contrast = getContrastRatio(hex, '#ffffff')
                    const level = contrast >= 7 ? 'AAA' : contrast >= 4.5 ? 'AA' : null
                    const isOpen = openSlider === i
                    const isLocked = locks.has(i)
                    return (
                      <div key={i} className={`swatch-row ${isOpen ? 'swatch-row--open' : ''}`} style={isOpen ? { flex: 'none' } : undefined}>
                        <div className="swatch-row-main" onClick={() => handleSwatchClick(i)}>
                          <span className="swatch-block" style={{ background: hex }} />
                          <div className="swatch-labels">
                            <span className="swatch-hex">{hex}</span>
                            <span className="swatch-name">{name}</span>
                          </div>
                          <button
                            className={`role-pill ${roles[i] ? 'role-pill--active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setRoles(prev => {
                                const cur = prev[i] ?? null
                                const nextIdx = (ROLE_ORDER.indexOf(cur) + 1) % ROLE_ORDER.length
                                const next = ROLE_ORDER[nextIdx]
                                const r = { ...prev }
                                if (next === null) delete r[i]; else r[i] = next
                                return r
                              })
                            }}
                            title="Cycle semantic role"
                          >
                            {roles[i] ? ROLE_LABELS[roles[i]] : '·'}
                          </button>
                          {showContrast && (
                            <span className={`a11y-badge ${level ? 'a11y-badge--pass' : 'a11y-badge--fail'}`}>
                              {level || '✗'} {contrast.toFixed(1)}
                            </span>
                          )}
                          <div className="swatch-actions">
                            <button
                              className={`swatch-action ${isLocked ? 'swatch-action--locked' : ''}`}
                              onClick={(e) => toggleLock(i, e)}
                              title={isLocked ? 'Unlock' : 'Lock'}
                            ><LockIcon locked={isLocked} /></button>
                            <button
                              className={`swatch-action ${copied === i ? 'swatch-action--copied' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleCopy(hex, i) }}
                              title="Copy hex"
                            >{copied === i ? '✓' : <CopyIcon />}</button>
                          </div>
                        </div>
                        {isOpen && sliderHsl && (
                          <div className="hsl-panel">
                            <div className="hsl-panel-header">
                              <span className="hsl-dot" style={{ background: hex }} />
                              <span className="hsl-title">Adjusting {name}</span>
                              <button className="hsl-close" onClick={() => setOpenSlider(null)}>✕</button>
                            </div>
                            {[
                              { key: 'h', label: 'H', max: 360, unit: '°', grad: hueGrad   },
                              { key: 's', label: 'S', max: 100, unit: '%', grad: satGrad   },
                              { key: 'l', label: 'L', max: 100, unit: '%', grad: lightGrad },
                            ].map(({ key, label, max, unit, grad }) => (
                              <div key={key} className="hsl-row">
                                <span className="hsl-lbl">{label}</span>
                                <div className="hsl-track" style={{ background: grad }}>
                                  <input
                                    type="range" className="hsl-slider"
                                    min={0} max={max} value={sliderHsl[key]}
                                    onChange={e => onHslChange(key, e.target.value)}
                                  />
                                </div>
                                <span className="hsl-val">{sliderHsl[key]}{unit}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="left-empty">Load an image to extract colors</div>
              )}
              {palette.length > 0 && (
                <div className="color-strip">
                  {palette.map((hex, i) => (
                    <span key={i} style={{ flex: 1, background: hex, display: 'block' }} />
                  ))}
                </div>
              )}
              <div className="contrast-toggle-row">
                <label className="contrast-toggle-label">
                  <input
                    type="checkbox"
                    checked={showContrast}
                    onChange={e => setShowContrast(e.target.checked)}
                  />
                  Show contrast
                </label>
              </div>
            </div>
          )}

          {/* ── Scales tab ── */}
          {leftTab === 'scales' && (
            <div className="left-tab-content">
              {palette.length > 0 ? (
                <div className="scales-view">
                  {palette.map((hex, i) => {
                    const scale = generateScale(hex)
                    const name  = getColorName(hex)
                    return (
                      <div key={i} className="scale-row-wrap">
                        <div className="scale-row-label">{name}</div>
                        <div className="scale-steps">
                          {SHADE_STEPS.map(step => {
                            const { hex: sHex } = scale[step]
                            const isAnchor  = step === 500
                            const wContrast = getContrastRatio(sHex, '#ffffff')
                            const bContrast = getContrastRatio(sHex, '#000000')
                            const useWhite  = wContrast >= 4.5
                            const useBlack  = !useWhite && bContrast >= 4.5
                            const labelCol  = readableText(sHex)
                            return (
                              <div
                                key={step}
                                className={`scale-step${isAnchor ? ' scale-step--anchor' : ''}`}
                                style={{ background: sHex }}
                              >
                                <span className="scale-step-num" style={{ color: labelCol }}>{step}</span>
                                <span className="scale-step-hex" style={{ color: labelCol }}>{sHex}</span>
                                {isAnchor && <span className="scale-anchor-dot" style={{ background: labelCol }} />}
                                {useWhite  && <span className="scale-text-dot scale-text-dot--white" />}
                                {useBlack  && <span className="scale-text-dot scale-text-dot--black" />}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="left-empty">Load an image to generate scales</div>
              )}
            </div>
          )}

        </aside>

        {/* ── Divider 1 ── */}
        <div
          className="panel-divider"
          onMouseDown={(e) => handleDividerMouseDown('left', e)}
        >
          <div className="panel-divider-grip" />
        </div>

        {/* ═══════════ PANEL 2: PREVIEW ═══════════ */}
        <main className="panel panel--palette" style={{ flex: 1, minWidth: 300 }}>

          {/* ── History view ── */}
          {currentView === 'history' && (
            <div className="history-view">
              {history.length === 0 ? (
                <div className="history-empty">
                  no history yet — extract a palette to get started
                </div>
              ) : (
                <div className="history-list">
                  {[...history].reverse().map((entry, revIdx) => {
                    const idx = history.length - revIdx
                    return (
                      <button key={idx} className="history-entry" onClick={() => restoreFromHistory(entry)}>
                        <div className="history-swatches">
                          {entry.palette.map((hex, ci) => (
                            <span key={ci} className="history-swatch" style={{ background: hex }} />
                          ))}
                        </div>
                        <span className="history-label">Palette {idx}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Extract view: preview only ── */}
          {currentView === 'extract' && (
            <div className="preview-full">
              {/* Preview toolbar */}
              <div className="preview-toolbar">
                <span className="panel-label">PREVIEW</span>
                <button
                  className={`preview-toolbar-btn ${uiBg === 'dark' ? 'preview-toolbar-btn--active' : ''}`}
                  onClick={() => setUiBg(b => b === 'light' ? 'dark' : 'light')}
                  title={uiBg === 'light' ? 'Switch to dark preview' : 'Switch to light preview'}
                >
                  {uiBg === 'light' ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
                    </svg>
                  )}
                </button>
              </div>
              {/* Preview content with vision filter */}
              <div className="preview-scroll" style={activePanelFilter}>
                {palette.length > 0 ? (
                  <LandingPreview palette={palette} roles={roles} uiBg={uiBg} />
                ) : (
                  <div className="preview-placeholder">
                    <span>Drop an image to see your palette in context</span>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>

        {/* ── Divider 2 ── */}
        <div
          className="panel-divider"
          onMouseDown={(e) => handleDividerMouseDown('right', e)}
        >
          <div className="panel-divider-grip" />
        </div>

        {/* ═══════════ PANEL 3: UTILITIES ═══════════ */}
        <aside className="panel panel--intel" style={{ width: panelWidths.right }}>

          {/* ── Accessibility accordion (collapsed by default) ── */}
          <div className="accord-section">
            <button className="accord-header" onClick={() => setA11yOpen(o => !o)}>
              <span className="panel-label">ACCESSIBILITY</span>
              {palette.length > 0 && (
                <span className="panel-badge" style={{ color: scoreColor }}>
                  {passCount}/{palette.length} pass
                </span>
              )}
              <svg
                className={`accord-chevron ${a11yOpen ? 'accord-chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {a11yOpen && (
              <div className="accord-body">
                {palette.length > 0 ? (
                  <>
                    <div className="contrast-matrix-header">
                      <span className="cm-col-label">on light</span>
                      <span className="cm-col-label">on dark</span>
                    </div>
                    <div className="contrast-matrix">
                      {palette.map((hex, i) => {
                        const ratioLight = getContrastRatio(hex, LIGHT_BG)
                        const ratioDark  = getContrastRatio(hex, DARK_BG)
                        const lvLight    = badgeLevel(ratioLight)
                        const lvDark     = badgeLevel(ratioDark)
                        const passLight  = passesAA(ratioLight)
                        const passDark   = passesAA(ratioDark)
                        const fg         = readableText(hex)
                        const isWhiteFg  = fg === '#ffffff'
                        const passBg  = isWhiteFg ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.7)'
                        const failBg  = isWhiteFg ? 'rgba(0,0,0,0.38)'       : 'rgba(255,255,255,0.55)'
                        return (
                          <div key={i} className="contrast-row">
                            <div className="contrast-cell" style={{ background: hex, color: fg }}>
                              <span className="contrast-ratio">{ratioLight.toFixed(1)}:1</span>
                              <span className="contrast-badge" style={{ background: passLight ? passBg : failBg }}>{lvLight}</span>
                              {!passLight && (
                                <button className="contrast-fix" style={{ color: fg, borderColor: fg + '44' }} onClick={() => handleAutoFix(i, LIGHT_BG)} title="Auto-fix contrast">fix</button>
                              )}
                            </div>
                            <div className="contrast-cell" style={{ background: hex, color: fg }}>
                              <span className="contrast-ratio">{ratioDark.toFixed(1)}:1</span>
                              <span className="contrast-badge" style={{ background: passDark ? passBg : failBg }}>{lvDark}</span>
                              {!passDark && (
                                <button className="contrast-fix" style={{ color: fg, borderColor: fg + '44' }} onClick={() => handleAutoFix(i, DARK_BG)} title="Auto-fix contrast">fix</button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="vision-section">
                      <div className="vision-section-label">VISION · SIMULATE</div>
                      <div className="vision-pills">
                        {Object.keys(VISION_FILTERS).map(m => (
                          <button
                            key={m}
                            className={`vision-pill ${visionMode === m ? 'vision-pill--active' : ''}`}
                            onClick={() => setVisionMode(m)}
                          >{m}</button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="intel-empty">Load an image first</div>
                )}
              </div>
            )}
          </div>

          {/* ── Export accordion (open by default) ── */}
          <div className="accord-section">
            <button className="accord-header" onClick={() => setExportOpen(o => !o)}>
              <span className="panel-label">EXPORT</span>
              <svg
                className={`accord-chevron ${exportOpen ? 'accord-chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {exportOpen && (
              <div className="accord-body accord-body--export">
                {palette.length > 0 ? (
                  <>
                    {/* Scales export tabs */}
                    {leftTab === 'scales' && (<>
                      <div className="export-tabs">
                        {SCALE_EXPORT_TABS.map(tab => (
                          <button
                            key={tab}
                            className={`export-tab ${scaleExportTab === tab ? 'export-tab--active' : ''}`}
                            onClick={() => setScaleExportTab(tab)}
                          >{tab}</button>
                        ))}
                      </div>
                      <pre className="code-block" dangerouslySetInnerHTML={{ __html: scaleExportCodeHTML }} />
                    </>)}

                    {/* Swatches export tabs */}
                    {leftTab === 'swatches' && (<>
                      <div className="export-tabs">
                        {EXPORT_TABS.map(tab => (
                          <button
                            key={tab}
                            className={`export-tab ${exportTab === tab ? 'export-tab--active' : ''}`}
                            onClick={() => setExportTab(tab)}
                          >{tab}</button>
                        ))}
                      </div>
                      {exportTab === 'custom' ? (
                        <div className="custom-template-section">
                          <div className="custom-template-presets">
                            {Object.entries(CUSTOM_PRESET_VALUES).map(([label, tpl]) => (
                              <button
                                key={label}
                                className={`custom-preset-btn ${customTemplate === tpl ? 'custom-preset-btn--active' : ''}`}
                                onClick={() => {
                                  setCustomTemplate(tpl)
                                  customSelRef.current = { start: tpl.length, end: tpl.length }
                                }}
                              >{label}</button>
                            ))}
                          </div>
                          <div className="custom-vars-hint">
                            {['{name}', '{hex}', '{rgb}', '{hsl}', '{oklch}', '{role}', '{index}'].map(v => (
                              <span
                                key={v}
                                className="custom-var-chip"
                                onClick={() => {
                                  const { start, end } = customSelRef.current
                                  setCustomTemplate(t => t.slice(0, start) + v + t.slice(end))
                                  const newPos = start + v.length
                                  customSelRef.current = { start: newPos, end: newPos }
                                  requestAnimationFrame(() => {
                                    customTemplateRef.current?.focus()
                                    customTemplateRef.current?.setSelectionRange(newPos, newPos)
                                  })
                                }}
                              >{v}</span>
                            ))}
                          </div>
                          <textarea
                            ref={customTemplateRef}
                            className="custom-template-input"
                            value={customTemplate}
                            onChange={e => setCustomTemplate(e.target.value)}
                            onSelect={e => { customSelRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd } }}
                            onKeyUp={e =>  { customSelRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd } }}
                            onClick={e =>  { customSelRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd } }}
                            rows={2}
                            spellCheck={false}
                            placeholder="type a template or click a preset above"
                          />
                          <pre className="code-block" dangerouslySetInnerHTML={{ __html: exportCodeHTML }} />
                        </div>
                      ) : (
                        <pre className="code-block" dangerouslySetInnerHTML={{ __html: exportCodeHTML }} />
                      )}
                    </>)}

                    {/* Download + copy row */}
                    <div className="export-download-row">
                      <button className="export-dl-btn" onClick={downloadPNG}>PNG</button>
                      <button className="export-dl-btn" onClick={downloadTXT}>TXT</button>
                      <button
                        className={`export-copy-btn ${copied === 'export' ? 'export-copy-btn--copied' : ''}`}
                        onClick={handleExport}
                      >{copied === 'export' ? '✓ copied' : 'copy ↓'}</button>
                    </div>
                  </>
                ) : (
                  <div className="intel-empty">Load an image to export</div>
                )}
              </div>
            )}
          </div>

        </aside>
      </div>
    </div>
  )
}
