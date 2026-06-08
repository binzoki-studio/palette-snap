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

// ── Design-system extraction engine ──────────────────────────────────────────

// Perceptual distance in OKLCH (weighted: L×2, C×1.5, H×1)
function oklchDistance(a, b) {
  const dL = (a.L - b.L) * 2
  const dC = (a.C - b.C) * 1.5
  // Hue is circular — take the shorter arc
  let dH = Math.abs(a.H - b.H)
  if (dH > 180) dH = 360 - dH
  return Math.sqrt(dL * dL + dC * dC + dH * dH)
}

// Deduplicate: keep the one with higher chroma when two are too similar
function deduplicateCandidates(candidates, threshold = 12) {
  const kept = []
  for (const c of candidates) {
    let absorbed = false
    for (let i = 0; i < kept.length; i++) {
      if (oklchDistance(c.oklch, kept[i].oklch) < threshold) {
        if (c.oklch.C > kept[i].oklch.C) kept[i] = c
        absorbed = true
        break
      }
    }
    if (!absorbed) kept.push(c)
  }
  return kept
}

// Hue difference (0-180)
function hueDiff(h1, h2) {
  const d = Math.abs(h1 - h2)
  return d > 180 ? 360 - d : d
}

// Clamp L to valid OKLCH range and return hex
function deriveOklch(L, C, H) {
  return oklchToHex(Math.max(0, Math.min(1, L)), Math.max(0, C), ((H % 360) + 360) % 360)
}

// Role priority order for count-aware selection
const ROLE_PRIORITY = ['text', 'background', 'primary', 'secondary', 'accent', 'surface', 'muted', 'border']

/**
 * Main extraction engine.
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {number} count – requested palette size (3-8)
 * @param {Set} locks – locked indices
 * @param {string[]} currentPalette – existing palette (for locked slots)
 * @returns {{ palette: string[], candidateCount: number }}
 */
async function designSystemExtract(source, count, locks, currentPalette) {
  // ── Step 1: Extract 24 raw candidates ───────────────────────────────────
  const rawColors = await getPalette(source, { colorCount: 24 })
  const rawHexes = rawColors.map(c => c.hex())
  const rawCandidates = rawHexes.map(hex => ({ hex, oklch: hexToOklch(hex) }))

  // ── Step 2: Perceptual deduplication ────────────────────────────────────
  const deduplicated = deduplicateCandidates(rawCandidates, 12)

  // ── Step 3: Role-aware candidate selection ──────────────────────────────
  const pool = [...deduplicated]
  const used = new Set()

  // Text: darkest with L < 0.35, else darken darkest to L=0.20
  const sortedByL    = [...pool].sort((a, b) => a.oklch.L - b.oklch.L)
  const sortedByLDesc = [...pool].sort((a, b) => b.oklch.L - a.oklch.L)
  let textCandidate = pool.find((c, i) => !used.has(i) && c.oklch.L < 0.35)
  if (textCandidate) {
    used.add(pool.indexOf(textCandidate))
  } else {
    const darkest = sortedByL[0]
    const hex = deriveOklch(0.20, darkest.oklch.C, darkest.oklch.H)
    textCandidate = { hex, oklch: hexToOklch(hex) }
  }

  // Background: lightest with L > 0.80, else lighten lightest to L=0.95, C≤0.03
  let bgIdx = pool.findIndex((c, i) => !used.has(i) && c.oklch.L > 0.80)
  let bgCandidate
  if (bgIdx !== -1) {
    used.add(bgIdx)
    bgCandidate = pool[bgIdx]
  } else {
    const lightest = sortedByLDesc[0]
    const hex = deriveOklch(0.95, Math.min(0.03, lightest.oklch.C), lightest.oklch.H)
    bgCandidate = { hex, oklch: hexToOklch(hex) }
  }

  // Primary: highest chroma (C > 0.08 preferred)
  let primaryCandidate = null
  {
    const remaining = pool.filter((_, i) => !used.has(i)).sort((a, b) => b.oklch.C - a.oklch.C)
    const preferred = remaining.find(c => c.oklch.C > 0.08)
    primaryCandidate = preferred ?? remaining[0] ?? textCandidate
    const pi = pool.indexOf(primaryCandidate); if (pi !== -1) used.add(pi)
  }

  // Secondary: second highest chroma, hue diff ≥ 30° from primary (fallback: second highest chroma)
  let secondaryCandidate = null
  {
    const remaining = pool.filter((_, i) => !used.has(i)).sort((a, b) => b.oklch.C - a.oklch.C)
    secondaryCandidate = remaining.find(c => hueDiff(c.oklch.H, primaryCandidate.oklch.H) >= 30)
      ?? remaining[0]
    if (secondaryCandidate) { const si = pool.indexOf(secondaryCandidate); if (si !== -1) used.add(si) }
    else secondaryCandidate = primaryCandidate
  }

  // Accent: highest chroma with hue diff ≥ 60° from primary, else highest chroma remaining
  let accentCandidate = null
  {
    const remaining = pool.filter((_, i) => !used.has(i)).sort((a, b) => b.oklch.C - a.oklch.C)
    accentCandidate = remaining.find(c => hueDiff(c.oklch.H, primaryCandidate.oklch.H) >= 60)
      ?? remaining[0]
    if (accentCandidate) { const ai = pool.indexOf(accentCandidate); if (ai !== -1) used.add(ai) }
    else accentCandidate = secondaryCandidate
  }

  // Surface: L 0.25-0.60, C < 0.08 — else derive from bg
  let surfaceCandidate = null
  {
    const match = pool.find((c, i) => !used.has(i) && c.oklch.L >= 0.25 && c.oklch.L <= 0.60 && c.oklch.C < 0.08)
    if (match) { used.add(pool.indexOf(match)); surfaceCandidate = match }
    else {
      const hex = deriveOklch(bgCandidate.oklch.L - 0.08, Math.min(bgCandidate.oklch.C + 0.02, 0.07), bgCandidate.oklch.H)
      surfaceCandidate = { hex, oklch: hexToOklch(hex) }
    }
  }

  // Muted: L 0.35-0.65, C < 0.05 — else derive from text
  let mutedCandidate = null
  {
    const match = pool.find((c, i) => !used.has(i) && c.oklch.L >= 0.35 && c.oklch.L <= 0.65 && c.oklch.C < 0.05)
    if (match) { used.add(pool.indexOf(match)); mutedCandidate = match }
    else {
      const hex = deriveOklch(0.55, 0.03, textCandidate.oklch.H)
      mutedCandidate = { hex, oklch: hexToOklch(hex) }
    }
  }

  // Border: L 0.20-0.45, C < 0.06 — else derive from bg
  let borderCandidate = null
  {
    const match = pool.find((c, i) => !used.has(i) && c.oklch.L >= 0.20 && c.oklch.L <= 0.45 && c.oklch.C < 0.06)
    if (match) { used.add(pool.indexOf(match)); borderCandidate = match }
    else {
      const hex = deriveOklch(bgCandidate.oklch.L - 0.15, Math.min(bgCandidate.oklch.C, 0.04), bgCandidate.oklch.H)
      borderCandidate = { hex, oklch: hexToOklch(hex) }
    }
  }

  // ── Step 4: Count-aware output ───────────────────────────────────────────
  const roleMap = {
    text: textCandidate, background: bgCandidate, primary: primaryCandidate,
    secondary: secondaryCandidate, accent: accentCandidate,
    surface: surfaceCandidate, muted: mutedCandidate, border: borderCandidate,
  }
  const selectedRoles = ROLE_PRIORITY.slice(0, count)
  let selected = selectedRoles.map(r => roleMap[r])

  // ── Step 5: Post-processing quality checks ───────────────────────────────
  // 1. Text vs Background ≥ 7:1 (AAA)
  {
    let textHex = selected[0].hex
    let bgHex   = selected[1].hex
    if (getContrastRatio(textHex, bgHex) < 7) {
      const { L: tL, C: tC, H: tH } = hexToOklch(textHex)
      const { L: bL, C: bC, H: bH } = hexToOklch(bgHex)
      // Try darkening text and lightening bg together
      let fixed = false
      for (let step = 0.01; step <= 0.5 && !fixed; step += 0.01) {
        const t2 = deriveOklch(tL - step, tC, tH)
        const b2 = deriveOklch(bL + step * 0.5, Math.min(bC, 0.03), bH)
        if (getContrastRatio(t2, b2) >= 7) {
          selected[0] = { hex: t2, oklch: hexToOklch(t2) }
          selected[1] = { hex: b2, oklch: hexToOklch(b2) }
          fixed = true
        }
      }
    }
  }

  // 2. Primary vs Background ≥ 3:1
  if (selected.length >= 3) {
    const bgHex  = selected[1].hex
    const prHex  = selected[2].hex
    if (getContrastRatio(prHex, bgHex) < 3) {
      const { L, C, H } = hexToOklch(prHex)
      for (let step = 0.01; step <= 0.6; step += 0.01) {
        const darker  = deriveOklch(L - step, C, H)
        if (getContrastRatio(darker, bgHex) >= 3) {
          selected[2] = { hex: darker, oklch: hexToOklch(darker) }
          break
        }
        const lighter = deriveOklch(L + step, C, H)
        if (getContrastRatio(lighter, bgHex) >= 3) {
          selected[2] = { hex: lighter, oklch: hexToOklch(lighter) }
          break
        }
      }
    }
  }

  // 3. No near-duplicates in final set (threshold 15)
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      if (oklchDistance(selected[i].oklch, selected[j].oklch) < 15) {
        // Replace the less-useful one (j) with next best unused pool candidate
        const nextBestIdx = pool.findIndex((_, pi) => !used.has(pi))
        if (nextBestIdx !== -1) {
          selected[j] = pool[nextBestIdx]
          used.add(nextBestIdx)
        }
      }
    }
  }

  // 4. Hue diversity: if all hues within 60°, inject outlier if available
  if (selected.length >= 3) {
    const hues = selected.slice(2).map(c => c.oklch.H) // skip text/bg
    const minH = Math.min(...hues), maxH = Math.max(...hues)
    const spread = Math.min(maxH - minH, 360 - (maxH - minH))
    if (spread < 60) {
      const outlier = pool.find((c, pi) => !used.has(pi) && hues.every(h => hueDiff(c.oklch.H, h) > 90))
      if (outlier) {
        // Replace the last color (least important role)
        selected[selected.length - 1] = outlier
      }
    }
  }

  // ── Apply locks ──────────────────────────────────────────────────────────
  const finalPalette = selected.map((c, i) =>
    locks.has(i) && currentPalette[i] ? currentPalette[i] : c.hex
  )

  return { palette: finalPalette, candidateCount: deduplicated.length }
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
const ROLE_ALL    = ['text', 'background', 'primary', 'secondary', 'accent', 'surface', 'muted', 'border']
const ROLE_ORDER  = [null, ...ROLE_ALL]
const ROLE_LABELS = {
  text: 'TXT', background: 'BG', primary: '1°', secondary: '2°',
  accent: 'ACC', surface: 'SRF', muted: 'MUT', border: 'BDR',
}
const ROLE_PROP   = {
  text: 'text', background: 'background', primary: 'primary', secondary: 'secondary',
  accent: 'accent', surface: 'surface', muted: 'muted', border: 'border',
}

function autoAssignRoles(pal) {
  if (!pal.length) return {}
  const items = pal.map((hex, i) => {
    const { l: lightness, s: sat } = hexToHsl(hex)
    return { i, lum: getLuminance(hex), lightness, sat }
  })
  const byLum = [...items].sort((a, b) => a.lum - b.lum)
  const result = {}, used = new Set()

  // 1. text = darkest overall
  result[byLum[0].i] = 'text'; used.add(byLum[0].i)

  // 2. background = lightest overall (skip if same as text)
  const bgIdx = byLum[byLum.length - 1].i
  if (!used.has(bgIdx)) { result[bgIdx] = 'background'; used.add(bgIdx) }

  // remaining sorted by saturation desc
  const rem = items.filter(x => !used.has(x.i)).sort((a, b) => b.sat - a.sat)

  // 3. primary = highest saturation remaining
  if (rem[0]) { result[rem[0].i] = 'primary'; used.add(rem[0].i) }

  // 4. secondary = second highest saturation
  if (rem[1]) { result[rem[1].i] = 'secondary'; used.add(rem[1].i) }

  // 5. accent = third highest saturation
  if (rem[2]) { result[rem[2].i] = 'accent'; used.add(rem[2].i) }

  // Remaining sorted by lightness desc
  const rem2 = items.filter(x => !used.has(x.i)).sort((a, b) => b.lightness - a.lightness)

  // 6. surface = lightest of remaining (near-bg, light neutral)
  if (rem2[0]) { result[rem2[0].i] = 'surface'; used.add(rem2[0].i) }

  // 7. muted = next lightest (washed-out supporting color)
  if (rem2[1]) { result[rem2[1].i] = 'muted'; used.add(rem2[1].i) }

  // 8. border = darkest of remaining (subtle dividers)
  const rem3 = items.filter(x => !used.has(x.i)).sort((a, b) => a.lum - b.lum)
  if (rem3[0]) { result[rem3[0].i] = 'border'; used.add(rem3[0].i) }

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
// Builds role-named entries; falls back to --color-N for unassigned colors
function buildRoleEntries(palette, rolesMap) {
  return palette.map((hex, i) => ({ hex, role: rolesMap[i] ?? null, num: i + 1 }))
}

const EXPORT_FORMATS = {
  css: (palette, rolesMap) => {
    const entries = buildRoleEntries(palette, rolesMap)
    const lines = entries.map(({ hex, role, num }) =>
      role ? `  --color-${role}: ${hex};` : `  --color-${num}: ${hex};`
    )
    // Also add numbered aliases for assigned roles
    const aliases = entries
      .filter(e => e.role)
      .map(({ hex, num }) => `  --color-${num}: ${hex};`)
    return `:root {\n${lines.join('\n')}${aliases.length ? '\n  /* numbered aliases */\n' + aliases.join('\n') : ''}\n}`
  },
  tw4: (palette, rolesMap) => {
    const entries = buildRoleEntries(palette, rolesMap)
    const lines = entries.map(({ hex, role, num }) =>
      role ? `  --color-${role}: ${hex};` : `  --color-${num}: ${hex};`
    )
    return `@theme {\n${lines.join('\n')}\n}`
  },
  tw3: (palette, rolesMap) => {
    const entries = buildRoleEntries(palette, rolesMap)
    const obj = Object.fromEntries(
      entries.map(({ hex, role, num }) => [role ?? `color-${num}`, hex])
    )
    return `colors: ${JSON.stringify(obj, null, 2)}`
  },
  json: (palette, rolesMap) => {
    const entries = buildRoleEntries(palette, rolesMap)
    const obj = Object.fromEntries(
      entries.map(({ hex, role, num }) => {
        const { L, C, H } = hexToOklch(hex)
        return [role ?? `color-${num}`, { hex, oklch: oklchToCss(L, C, H) }]
      })
    )
    return JSON.stringify(obj, null, 2)
  },
  scss: (palette, rolesMap) => {
    const entries = buildRoleEntries(palette, rolesMap)
    return entries.map(({ hex, role, num }) =>
      role ? `$color-${role}: ${hex};` : `$color-${num}: ${hex};`
    ).join('\n')
  },
}
const EXPORT_TABS = ['css', 'tw4', 'tw3', 'json', 'scss', 'custom']

function buildExportCode(tab, palette, rolesMap, customTpl) {
  if (tab === 'custom') {
    return palette.map((hex, i) => applyTemplate(customTpl, hex, i, rolesMap)).join('\n')
  }
  return EXPORT_FORMATS[tab](palette, rolesMap)
}

function renderCodeHTML(code, tab) {
  let html = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  html = html.replace(/(#[0-9a-fA-F]{6})/g, '<span class="code-hex">$1</span>')
  if (tab === 'css' || tab === 'tw4') {
    html = html
      .replace(/(--color-[\w-]+)/g, '<span class="code-prop">$1</span>')
      .replace(/(:root|@theme)/g, '<span class="code-sel">$1</span>')
  } else if (tab === 'tw3') {
    html = html.replace(/("[\w-]+"(?=:))/g, '<span class="code-prop">$1</span>')
  } else if (tab === 'scss') {
    html = html.replace(/(\$color-[\w-]+)/g, '<span class="code-prop">$1</span>')
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

// ── ha: 8-digit hex helper ─────────────────────────────────────────────────────
// Appends an alpha byte (00–ff) to a 6-char #rrggbb
function ha(hex, alpha) {
  return hex + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

// ── Shared byRole helper factory ─────────────────────────────────────────────
function makeByRole(palette, roles) {
  return (role, fallbackIdx = 0) => {
    const entry = Object.entries(roles).find(([, r]) => r === role)
    return entry ? (palette[+entry[0]] ?? palette[fallbackIdx]) : palette[Math.min(fallbackIdx, palette.length - 1)]
  }
}

// ── Social card preview (default template) ────────────────────────────────────
function SocialPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (!palette.length) return <div className="lp-empty">Load an image to see a preview</div>

  const byRole = makeByRole(palette, roles)
  const bgColor  = byRole('background', palette.length - 1)
  const textCol  = byRole('text',       0)
  const primary  = byRole('primary',    Math.min(1, palette.length - 1))
  const secondary= byRole('secondary',  Math.min(2, palette.length - 1))
  const accent   = byRole('accent',     Math.min(3, palette.length - 1))
  const surface  = byRole('surface',    Math.min(4, palette.length - 1))
  const muted    = byRole('muted',      Math.min(5, palette.length - 1))
  const border   = byRole('border',     Math.min(6, palette.length - 1))

  // Dark mode: card 1 & 3 invert bg/text for drama
  const c1Bg   = uiBg === 'dark' ? textCol  : bgColor
  const c1Text = uiBg === 'dark' ? bgColor  : textCol
  const c3Bg   = uiBg === 'dark' ? textCol  : secondary
  const c3Text = uiBg === 'dark' ? bgColor  : textCol

  const primaryFg  = readableText(primary)
  const secondaryFg= readableText(secondary)

  // Swipe footer component
  const SwipeHint = ({ color }) => (
    <div className="sc-swipe">
      <span style={{ color }}>∧</span>
      <span className="sc-swipe-label" style={{ color }}>SWIPE TO READ MORE</span>
    </div>
  )

  // Logo row component
  const LogoRow = ({ dotBg, dotFg, textColor, mutedColor }) => (
    <div className="sc-logo-row">
      <div className="sc-logo-left">
        <div className="sc-logo-circle" style={{ background: dotBg }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill={dotFg}>
            <circle cx="5" cy="5" r="3.5"/>
          </svg>
        </div>
        <div className="sc-logo-meta">
          <span className="sc-logo-handle" style={{ color: textColor }}>@brand</span>
          <span className="sc-logo-time"   style={{ color: mutedColor }}>5m ago</span>
        </div>
      </div>
      <div className="sc-three-dots" style={{ color: mutedColor }}>···</div>
    </div>
  )

  // Swatch rotations for card 3
  const swatchData = [
    { rot: -4,  top: '8%',  left: '10%', w: 72, h: 44, z: 1 },
    { rot:  3,  top: '12%', left: '42%', w: 64, h: 48, z: 2 },
    { rot: -2,  top: '30%', left: '22%', w: 80, h: 40, z: 3 },
    { rot:  5,  top: '28%', left: '55%', w: 60, h: 46, z: 2 },
    { rot: -3,  top: '48%', left: '8%',  w: 68, h: 38, z: 1 },
    { rot:  2,  top: '44%', left: '50%', w: 76, h: 42, z: 3 },
  ]

  // Outer tray background
  const trayBg = uiBg === 'dark'
    ? `linear-gradient(135deg, ${ha(textCol, 0.08)} 0%, ${ha(surface, 0.12)} 100%)`
    : `linear-gradient(135deg, ${ha(surface, 0.35)} 0%, ${ha(muted, 0.10)} 100%)`

  return (
    <div className="sc-tray" style={{ background: trayBg }}>

      {/* ── Card 1: Content card ─────────────────────────── */}
      <div className="sc-card" style={{ background: c1Bg, border: `1px solid ${ha(border, 0.45)}` }}>
        <LogoRow
          dotBg={primary} dotFg={primaryFg}
          textColor={ha(c1Text, 0.85)} mutedColor={ha(muted, 0.75)}
        />

        {/* Heading */}
        <h2 className="sc-serif-heading" style={{ color: c1Text, marginTop: 18 }}>
          Crafted with intention, built for impact.
        </h2>

        {/* Body */}
        <p className="sc-body" style={{ color: ha(muted, 0.80) }}>
          Every color tells a story. Extract yours from any image and build a system that works.
        </p>

        {/* Spacer pushes blob + footer down */}
        <div style={{ flex: 1 }} />

        {/* Organic blob — bottom right */}
        <div className="sc-blob-wrap">
          <svg viewBox="0 0 120 120" className="sc-blob" aria-hidden="true">
            <path
              d="M60,10 C80,8 100,22 110,42 C122,65 115,90 96,104 C76,118 48,115 30,100 C10,84 5,58 14,38 C24,16 40,12 60,10Z"
              fill={ha(accent, 0.38)}
            />
          </svg>
        </div>

        <SwipeHint color={ha(muted, 0.55)} />
      </div>

      {/* ── Card 2: Typography card ──────────────────────── */}
      <div className="sc-card sc-card--primary" style={{ background: primary }}>
        {/* Decorative circles — behind everything */}
        {[380, 280, 200, 140, 90].map((size, i) => (
          <div key={i} className="sc-deco-circle" style={{
            width: size, height: size,
            borderRadius: '50%',
            border: `1px solid ${ha(bgColor, 0.14)}`,
            top: `${[-30, 10, 40, 55, 65][i]}%`,
            left: `${[-40, -20, 15, 35, 50][i]}%`,
          }} />
        ))}

        <LogoRow
          dotBg={ha(bgColor, 0.90)} dotFg={primary}
          textColor={ha(bgColor, 0.80)} mutedColor={ha(bgColor, 0.55)}
        />

        {/* Hashtags */}
        <div className="sc-tags" style={{ color: ha(bgColor, 0.65) }}>
          {['#design', '#color', '#system'].map(t => (
            <span key={t} className="sc-tag">{t}</span>
          ))}
        </div>

        {/* Centered heading */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 2 }}>
          <h2 className="sc-serif-heading sc-serif-heading--lg" style={{ color: bgColor }}>
            From image to design system in seconds.
          </h2>
        </div>

        <SwipeHint color={ha(bgColor, 0.55)} />
      </div>

      {/* ── Card 3: Swatch composition card ─────────────── */}
      <div className="sc-card" style={{ background: c3Bg, border: `1px solid ${ha(border, 0.30)}` }}>
        <LogoRow
          dotBg={ha(c3Text, 0.20)} dotFg={c3Text}
          textColor={ha(c3Text, 0.80)} mutedColor={ha(c3Text, 0.50)}
        />

        {/* Swatch composition */}
        <div className="sc-swatches">
          {swatchData.map(({ rot, top, left, w, h, z }, i) => (
            <div key={i} className="sc-swatch-pill" style={{
              background: palette[i % palette.length],
              width: w, height: h,
              top, left,
              transform: `rotate(${rot}deg)`,
              zIndex: z,
              boxShadow: `0 4px 14px ${ha(textCol, 0.18)}`,
            }} />
          ))}
        </div>

        {/* Text below swatches */}
        <h3 className="sc-serif-heading sc-serif-heading--md" style={{ color: c3Text, marginTop: 8 }}>
          The right palette, in the right context, changes everything.
        </h3>
        <p className="sc-body sc-body--sm" style={{ color: ha(c3Text, 0.60) }}>
          Extract, refine, and export production-ready color systems.
        </p>

        <div style={{ flex: 1 }} />
        <SwipeHint color={ha(c3Text, 0.45)} />
      </div>

    </div>
  )
}

// ── Dashboard preview (bento-grid) ───────────────────────────────────────────
function DashboardPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (!palette.length) return <div className="lp-empty">Load an image to see a preview</div>
  const byRole    = makeByRole(palette, roles)
  const bgColor   = byRole('background', palette.length - 1)
  const textCol   = byRole('text',       0)
  const primary   = byRole('primary',    Math.min(1, palette.length - 1))
  const secondary = byRole('secondary',  Math.min(2, palette.length - 1))
  const accent    = byRole('accent',     Math.min(3, palette.length - 1))
  const surface   = byRole('surface',    Math.min(4, palette.length - 1))
  const muted     = byRole('muted',      Math.min(5, palette.length - 1))
  const border    = byRole('border',     Math.min(6, palette.length - 1))
  const pageBg    = uiBg === 'dark' ? textCol : bgColor
  const pageText  = uiBg === 'dark' ? bgColor : textCol
  const cardBg    = uiBg === 'dark' ? ha(bgColor, 0.10) : bgColor
  const accentFg  = readableText(accent)

  const lollipopH = [28, 34, 42, 50, 38, 60, 48, 55, 68, 80, 88, 95]
  const earningsH = [30,45,38,55,35,60,42,70,52,64,58,72,80,48,62,74,58,68,46,74,52,64,57,42]
  const calDays   = ['M','T','W','T','F','S','S']
  const calRows   = [
    ['03',null,null,null,null,null,'1.2'],
    [null,null,'14',null,'16',null, null],
    ['08','9s','10',null, null,null,'8.'],
  ]

  return (
    <div className="db2" style={{ background: pageBg }}>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="db2-sidebar" style={{ background: ha(pageText, 0.06), borderRadius: 20 }}>
        <div className="db2-sb-avatar" style={{ background: primary }}>
          <span style={{ color: readableText(primary), fontSize: 9, fontWeight: 700 }}>PS</span>
        </div>
        {[
          { icon: '⌂', active: false },
          { icon: '◎', active: false },
          { icon: '⊞', active: false },
          { icon: '◇', active: false },
          { icon: '⬡', active: true  },
          { icon: '≡', active: false },
          { icon: '$', active: false },
        ].map(({ icon, active }, i) => (
          <div key={i} className="db2-sb-icon" style={{
            color:      active ? pageText       : ha(pageText, 0.32),
            background: active ? ha(pageText, 0.10) : 'transparent',
          }}>{icon}</div>
        ))}
        <div style={{ flex: 1 }} />
        {['⚙','◉','✉'].map((icon, i) => (
          <div key={i} className="db2-sb-icon" style={{ color: ha(pageText, 0.28) }}>{icon}</div>
        ))}
      </aside>

      {/* ── Col 1: date tiles + indicators ───────────────────── */}
      <div className="db2-col">

        {/* Date tiles */}
        <div className="db2-date-row">
          {[
            { num: '19', bg: pageText,            fg: pageBg,   dot: accent    },
            { num: '23', bg: surface,              fg: pageText, dot: secondary },
          ].map(({ num, bg, fg, dot }) => (
            <div key={num} className="db2-date-tile"
              style={{ background: bg, border: `1px solid ${ha(border, 0.2)}` }}>
              <span className="db2-date-num" style={{ color: fg }}>{num}</span>
              <span className="db2-date-dot" style={{ background: dot }} />
            </div>
          ))}
        </div>

        {/* Indicators card */}
        <div className="db2-indicators" style={{ background: cardBg, border: `1px solid ${ha(border, 0.22)}` }}>
          <div className="db2-card-hd">
            <div>
              <div className="db2-card-title" style={{ color: pageText }}>Indicators</div>
              <div className="db2-card-sub"   style={{ color: ha(muted, 0.65) }}>vs Last Month</div>
            </div>
            <span className="db2-badge" style={{ background: ha(accent, 0.18), color: accent }}>+19%</span>
          </div>
          <div className="db2-ind-value" style={{ color: pageText }}>$7,860</div>

          {/* Lollipop chart */}
          <div className="db2-lollipop">
            {lollipopH.map((h, i) => {
              const isLast = i === lollipopH.length - 1
              return (
                <div key={i} className="db2-lollipop-col">
                  <div style={{
                    width:        isLast ? 11 : 7,
                    height:       isLast ? 11 : 7,
                    borderRadius: '50%',
                    background:   isLast ? pageText : ha(muted, 0.28),
                    flexShrink:   0,
                  }} />
                  <div style={{
                    width:      isLast ? 2 : 1.5,
                    height:     `${h}%`,
                    minHeight:  4,
                    background: isLast ? ha(pageText, 0.55) : ha(muted, 0.20),
                    borderRadius: 1,
                    flexShrink: 0,
                  }} />
                </div>
              )
            })}
          </div>
          <div className="db2-month-row" style={{ color: ha(muted, 0.45) }}>
            {['J','F','M','A','M','J','J','A','S','O','N','D'].map((m, i) => <span key={i}>{m}</span>)}
          </div>

          {/* Footer */}
          <div className="db2-ind-footer" style={{ background: ha(primary, 0.09) }}>
            <div style={{ color: ha(pageText, 0.50), fontSize: 9 }}>Total Spend</div>
            <div style={{ color: pageText, fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>$59,638</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span className="db2-badge" style={{ background: ha(accent, 0.18), color: accent }}>+15%</span>
              <span style={{ color: ha(muted, 0.45), fontSize: 8 }}>vs $8,496 last year</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Col 2: calendar + savings ─────────────────────────── */}
      <div className="db2-col">

        {/* Calendar */}
        <div className="db2-calendar" style={{ background: accent }}>
          <div className="db2-cal-days">
            {calDays.map((d, i) => (
              <div key={i} className="db2-cal-dh" style={{ color: ha(accentFg, 0.50) }}>{d}</div>
            ))}
          </div>
          {calRows.map((row, ri) => (
            <div key={ri} className="db2-cal-row">
              {row.map((cell, ci) => (
                <div key={ci} className="db2-cal-cell" style={{
                  background: cell ? ha(accentFg, 0.17) : ha(accentFg, 0.06),
                  color:      cell ? accentFg           : 'transparent',
                }}>{cell ?? '·'}</div>
              ))}
            </div>
          ))}
          <div className="db2-cal-scale" style={{ borderTop: `1px solid ${ha(accentFg, 0.15)}` }}>
            {['0.0','0.1','0.2','1.0','1.5','2.0'].map(s => (
              <span key={s} style={{ color: ha(accentFg, 0.42), fontFamily: 'DM Mono, monospace', fontSize: 7 }}>{s}</span>
            ))}
          </div>
          <div className="db2-cal-tickers" style={{ borderTop: `1px solid ${ha(accentFg, 0.15)}` }}>
            {['0.34 BNB','1.9 SOL','0.09 BTC','0.8 ETH'].map(t => (
              <span key={t} style={{ color: ha(accentFg, 0.68), fontFamily: 'DM Mono, monospace', fontSize: 7 }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Savings card */}
        <div className="db2-savings" style={{ background: cardBg, border: `1px solid ${ha(border, 0.22)}` }}>
          <div className="db2-card-hd">
            <div>
              <div className="db2-card-title" style={{ color: pageText }}>Wow, Great!</div>
              <div style={{ color: ha(muted, 0.55), fontSize: 9 }}>Saved $990 this month</div>
            </div>
            <div className="db2-select-pill" style={{ border: `1px solid ${ha(border, 0.45)}`, color: ha(pageText, 0.75) }}>
              Saving ▾
            </div>
          </div>
          <div className="db2-line-wrap">
            <svg viewBox="0 0 220 68" preserveAspectRatio="none" width="100%" height="100%">
              <defs>
                <linearGradient id="db2-savlg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primary} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={primary} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,52 C22,50 33,42 54,36 C74,30 84,48 108,42 C128,37 138,22 158,26 C173,29 183,17 220,15 L220,68 L0,68Z"
                fill="url(#db2-savlg)" />
              <path d="M0,52 C22,50 33,42 54,36 C74,30 84,48 108,42 C128,37 138,22 158,26 C173,29 183,17 220,15"
                stroke={primary} strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="158" cy="26" r="3" fill={accent} />
              <rect x="145" y="11" width="28" height="13" rx="3" fill={accent} />
              <text x="159" y="21" textAnchor="middle" fontSize="6.5" fill={accentFg}
                fontFamily="DM Mono, monospace" fontWeight="600">$990</text>
            </svg>
          </div>
          <div className="db2-chart-months" style={{ color: ha(muted, 0.40) }}>
            {['Jan','Feb','Mar','Apr','May','Jun'].map(m => <span key={m}>{m}</span>)}
          </div>
        </div>
      </div>

      {/* ── Col 3: earnings + micro grid ──────────────────────── */}
      <div className="db2-col">

        {/* Earnings card */}
        <div className="db2-earnings" style={{ background: cardBg, border: `1px solid ${ha(border, 0.22)}` }}>
          <div style={{ color: ha(muted, 0.55), fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Earnings</div>
          <div style={{ color: pageText, fontSize: 23, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, marginTop: 2 }}>$8,498</div>
          <span className="db2-badge" style={{ background: ha(accent, 0.16), color: accent, alignSelf: 'flex-start', marginTop: 3 }}>+1.6%</span>
          <div style={{ color: ha(muted, 0.42), fontSize: 9, marginTop: 3 }}>Compared to Last Month, 28 Sep</div>

          {/* 3-metric row */}
          <div className="db2-metrics-row" style={{ borderTop: `1px solid ${ha(border, 0.18)}`, borderBottom: `1px solid ${ha(border, 0.18)}` }}>
            {[
              { v: '$2,268', sub: 'USD Target', c: pageText   },
              { v: '-0,260', sub: 'Difference', c: secondary  },
              { v: '+0,99',  sub: 'Goals',      c: accent     },
            ].map(({ v, sub, c }) => (
              <div key={sub} className="db2-metric-cell">
                <span style={{ color: c, fontSize: 10, fontWeight: 700 }}>{v}</span>
                <span style={{ color: ha(muted, 0.42), fontSize: 8 }}>{sub}</span>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="db2-earnings-bars">
            {earningsH.map((h, i) => (
              <div key={i} style={{ width: 4, height: `${h}%`, background: ha(muted, 0.26), borderRadius: 2, flexShrink: 0 }} />
            ))}
          </div>
          <div className="db2-date-labels" style={{ color: ha(muted, 0.38) }}>
            {['12 Aug','19 Sep','26 Oct'].map(d => <span key={d}>{d}</span>)}
          </div>

          {/* Stat pills */}
          <div className="db2-stat-pills">
            {[
              { v: '23°',    label: 'Success Rate',    c: accent    },
              { v: '19 m/s', label: 'Goes Up %',       c: secondary },
              { v: '64%',    label: 'Positive',        c: primary   },
            ].map(({ v, label, c }) => (
              <div key={label} className="db2-stat-pill" style={{ border: `1px solid ${ha(border, 0.28)}` }}>
                <span style={{ color: pageText, fontSize: 10, fontWeight: 700 }}>{v}</span>
                <span style={{ color: c, fontSize: 8 }}>⊕</span>
                <span style={{ color: ha(muted, 0.42), fontSize: 7 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Micro cards 2×2 */}
        <div className="db2-micro-grid">
          {[
            { label: 'Business\nCosts',  value: '4.9k', sub: '28.3%', bars: [40,65,30,55,45,70], bg: surface                  },
            { label: 'Travel\nCosts',    value: '2.5k', sub: '42.7%', bars: [35,50,80,45,60,40], bg: ha(primary,   0.12)      },
            { label: 'Saving\nMonthly',  value: null,   sub: null,    bars: [55,70,45,85,60,75], bg: ha(secondary, 0.12)      },
            { label: '$0.8',             value: null,   sub: '7.9%',  bars: [40,55,65,50,70,45], bg: ha(muted,     0.10)      },
          ].map(({ label, value, sub, bars, bg }) => (
            <div key={label} className="db2-micro-card"
              style={{ background: bg, border: `1px solid ${ha(border, 0.20)}` }}>
              <div style={{ color: ha(pageText, 0.72), fontSize: 8.5, fontWeight: 600, whiteSpace: 'pre-line', lineHeight: 1.35 }}>
                {label}
              </div>
              <div className="db2-micro-bars">
                {bars.map((h, i) => (
                  <div key={i} style={{ width: 3, height: `${h}%`, background: ha(primary, 0.42), borderRadius: 1, flexShrink: 0 }} />
                ))}
              </div>
              {(value || sub) && (
                <div style={{ color: pageText, fontSize: value ? 14 : 10, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {value ?? sub}
                </div>
              )}
              {value && sub && (
                <div style={{ color: ha(muted, 0.45), fontSize: 7.5 }}>{sub}</div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Poster preview ────────────────────────────────────────────────────────────
function PosterPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (!palette.length) return <div className="lp-empty">Load an image to see a preview</div>
  const byRole = makeByRole(palette, roles)
  const bgColor  = byRole('background', palette.length - 1)
  const primary  = byRole('primary',    Math.min(1, palette.length - 1))
  const secondary= byRole('secondary',  Math.min(2, palette.length - 1))
  const accent   = byRole('accent',     Math.min(3, palette.length - 1))
  const muted    = byRole('muted',      Math.min(5, palette.length - 1))

  const posterBg   = uiBg === 'dark' ? primary  : primary
  const posterText = uiBg === 'dark' ? primary  : bgColor
  const headingCol = uiBg === 'dark' ? bgColor  : bgColor

  // Grab a color name from the palette for the second line
  const accentName = getColorName(accent).toUpperCase()

  return (
    <div className="poster" style={{ background: posterBg, position: 'relative', overflow: 'hidden' }}>
      {/* Geometric shapes */}
      <div className="poster-circle-large" style={{ background: ha(secondary, 0.70) }} />
      <div className="poster-rect"         style={{ background: ha(accent,    0.80) }} />
      <div className="poster-circle-small" style={{ background: ha(muted,     0.60) }} />

      {/* Top label */}
      <div className="poster-brand" style={{ color: ha(headingCol, 0.65) }}>PaletteSnap</div>

      {/* Main text */}
      <div className="poster-content">
        <div className="poster-heading" style={{ color: headingCol }}>DESIGN<br/>SYSTEM</div>
        <div className="poster-subheading" style={{ color: accent }}>{accentName}</div>
      </div>

      {/* Bottom color strip */}
      <div className="poster-strip" style={{ background: bgColor }}>
        {palette.map((hex, i) => (
          <div key={i} className="poster-strip-block" style={{ background: hex, flex: 1 }}>
            <span className="poster-strip-hex" style={{ color: readableText(hex) }}>{hex}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Brand preview ─────────────────────────────────────────────────────────────
function BrandPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (!palette.length) return <div className="lp-empty">Load an image to see a preview</div>
  const byRole = makeByRole(palette, roles)
  const bgColor  = byRole('background', palette.length - 1)
  const textCol  = byRole('text',       0)
  const primary  = byRole('primary',    Math.min(1, palette.length - 1))
  const secondary= byRole('secondary',  Math.min(2, palette.length - 1))
  const accent   = byRole('accent',     Math.min(3, palette.length - 1))
  const muted    = byRole('muted',      Math.min(5, palette.length - 1))

  const pageBg   = uiBg === 'dark' ? textCol  : bgColor
  const pageText = uiBg === 'dark' ? bgColor  : textCol
  const cardBg   = uiBg === 'dark' ? ha(bgColor, 0.12) : bgColor

  return (
    <div className="brand-sheet" style={{ background: pageBg }}>
      {/* Top 60% — logo + color chips */}
      <div className="brand-top">
        {/* Logo lockup */}
        <div className="brand-logo-section">
          <div className="brand-logo-mark" style={{ background: primary, borderRadius: 14 }} />
          <div className="brand-logo-text-wrap">
            <span className="brand-name" style={{ color: pageText }}>Brand</span>
            <span className="brand-tagline" style={{ color: ha(muted, 0.85) }}>Design meets purpose</span>
          </div>
        </div>
        {/* Color chips */}
        <div className="brand-chips">
          {palette.map((hex, i) => (
            <div key={i} className="brand-chip">
              <div className="brand-chip-circle" style={{ background: hex }} />
              <span className="brand-chip-name" style={{ color: pageText }}>{getColorName(hex)}</span>
              <span className="brand-chip-hex"  style={{ color: ha(muted, 0.7) }}>{hex}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom 40% — primary bg */}
      <div className="brand-bottom" style={{ background: primary }}>
        {/* Business card mockup */}
        <div className="brand-card" style={{ background: cardBg }}>
          <div className="brand-card-logo">
            <span className="brand-card-dot" style={{ background: primary }} />
            <span className="brand-card-co" style={{ color: pageText }}>Brand Name</span>
          </div>
          <span className="brand-card-email" style={{ color: ha(muted, 0.8) }}>hello@brand.co</span>
        </div>
        {/* Watermark */}
        <div className="brand-watermark">
          <span style={{ color: ha(bgColor, 0.22), fontFamily: 'DM Mono', fontWeight: 700 }}>
            PALETTE
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Cards preview ─────────────────────────────────────────────────────────────
function CardsPreview({ palette, roles = {}, uiBg = 'light' }) {
  if (!palette.length) return <div className="lp-empty">Load an image to see a preview</div>
  const byRole = makeByRole(palette, roles)
  const bgColor  = byRole('background', palette.length - 1)
  const textCol  = byRole('text',       0)
  const primary  = byRole('primary',    Math.min(1, palette.length - 1))
  const secondary= byRole('secondary',  Math.min(2, palette.length - 1))
  const accent   = byRole('accent',     Math.min(3, palette.length - 1))
  const surface  = byRole('surface',    Math.min(4, palette.length - 1))
  const muted    = byRole('muted',      Math.min(5, palette.length - 1))
  const border   = byRole('border',     Math.min(6, palette.length - 1))

  const pageBg   = uiBg === 'dark' ? textCol  : bgColor
  const pageText = uiBg === 'dark' ? bgColor  : textCol
  const primaryFg = readableText(primary)
  const secondaryFg = readableText(secondary)
  const accentFg = readableText(accent)

  // Derive a warning-ish color from secondary and error-ish from a warm hue
  const { L: sL, C: sC, H: sH } = hexToOklch(secondary)
  const warnCol  = oklchToHex(sL, sC * 0.9, ((sH + 30) % 360))
  const errorCol = oklchToHex(Math.max(0.35, sL * 0.9), Math.max(sC, 0.12), 25) // red-ish

  return (
    <div className="cv" style={{ background: pageBg }}>
      <div className="cv-grid">

        {/* Buttons row */}
        <div className="cv-section-label" style={{ color: ha(muted, 0.7) }}>Buttons</div>
        <div className="cv-row">
          <button className="cv-btn" style={{ background: primary,   color: primaryFg,   border: 'none' }}>Primary</button>
          <button className="cv-btn cv-btn--outline" style={{ border: `1.5px solid ${secondary}`, color: secondary, background: 'transparent' }}>Secondary</button>
          <button className="cv-btn" style={{ background: ha(pageText, 0.10), color: ha(pageText, 0.35), border: 'none' }}>Disabled</button>
          <button className="cv-btn cv-btn--icon" style={{ background: accent, color: accentFg, border: 'none' }}>✦</button>
        </div>

        {/* Inputs row */}
        <div className="cv-section-label" style={{ color: ha(muted, 0.7) }}>Inputs</div>
        <div className="cv-row">
          <input readOnly className="cv-input" placeholder="Default input"
            style={{ border: `1px solid ${ha(border, 0.6)}`, color: pageText, background: surface }} />
          <input readOnly className="cv-input cv-input--focused" placeholder="Focused"
            style={{ border: `1.5px solid ${primary}`, color: pageText, background: surface,
              boxShadow: `0 0 0 3px ${ha(primary, 0.18)}` }} />
          <input readOnly className="cv-input" placeholder="Error state"
            style={{ border: `1.5px solid ${errorCol}`, color: pageText, background: surface }} />
        </div>

        {/* Badges row */}
        <div className="cv-section-label" style={{ color: ha(muted, 0.7) }}>Badges</div>
        <div className="cv-row">
          {[
            { label: 'Primary',   bg: primary,   fg: primaryFg   },
            { label: 'Secondary', bg: secondary,  fg: secondaryFg },
            { label: 'Accent',    bg: accent,     fg: accentFg    },
            { label: 'Outlined',  bg: 'transparent', fg: border, outline: border },
          ].map(({ label, bg, fg, outline }) => (
            <span key={label} className="cv-badge"
              style={{ background: bg, color: fg,
                border: outline ? `1px solid ${outline}` : 'none' }}>
              {label}
            </span>
          ))}
        </div>

        {/* Alerts row */}
        <div className="cv-section-label" style={{ color: ha(muted, 0.7) }}>Alerts</div>
        <div className="cv-alerts">
          {[
            { label: 'Success — Operation completed',  color: accent    },
            { label: 'Warning — Review required',      color: warnCol   },
            { label: 'Error — Something went wrong',   color: errorCol  },
            { label: 'Info — Update available',        color: primary   },
          ].map(({ label, color }) => (
            <div key={label} className="cv-alert"
              style={{ background: surface, borderLeft: `3px solid ${color}`,
                border: `1px solid ${ha(border, 0.35)}`, borderLeftWidth: 3 }}>
              <span className="cv-alert-dot" style={{ background: color }} />
              <span className="cv-alert-text" style={{ color: pageText }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Cards row */}
        <div className="cv-section-label" style={{ color: ha(muted, 0.7) }}>Cards</div>
        <div className="cv-row">
          {[
            { strip: primary,   title: 'Primary Card',   body: 'This card uses the primary role for its accent strip and CTA.' },
            { strip: secondary, title: 'Secondary Card',  body: 'Secondary color provides contrast while staying harmonious.' },
          ].map(({ strip, title, body }) => (
            <div key={title} className="cv-card"
              style={{ background: surface, border: `1px solid ${ha(border, 0.4)}` }}>
              <div className="cv-card-strip" style={{ background: strip }} />
              <div className="cv-card-body">
                <span className="cv-card-title" style={{ color: pageText }}>{title}</span>
                <span className="cv-card-desc"  style={{ color: ha(muted, 0.8) }}>{body}</span>
                <button className="cv-card-btn" style={{ background: strip, color: readableText(strip), border: 'none' }}>
                  Learn more
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
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

  // ── Sprint 2.6 state ─────────────────────────────────────────────────────
  const [openRoleDropdown, setOpenRoleDropdown] = useState(null) // index of swatch with open dropdown

  // ── Sprint 2.7 state ─────────────────────────────────────────────────────
  const [extractionInfo, setExtractionInfo] = useState(null) // { candidates, selected }

  // ── Sprint 2.8 state ─────────────────────────────────────────────────────
  const [previewTemplate, setPreviewTemplate] = useState('social')

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

  // ── Global extraction (design-system engine) ────────────────────────────
  const runExtraction = useCallback(async (count, currentPalette, currentLocks) => {
    if (!imgRef.current) return null
    const { palette: extracted, candidateCount } = await designSystemExtract(
      imgRef.current, count, currentLocks, currentPalette
    )
    setExtractionInfo({ candidates: candidateCount, selected: count })
    return extracted
  }, [])

  // ── Region extraction (design-system engine) ─────────────────────────────
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
    const { palette: newPalette, candidateCount } = await designSystemExtract(canvas, count, cl, cp)
    setExtractionInfo({ candidates: candidateCount, selected: count })
    setPalette(newPalette)
  }, [])

  const onImageLoad = async () => {
    const count = colorCountRef.current
    const { palette: pal, candidateCount } = await designSystemExtract(
      imgRef.current, count, new Set(), []
    )
    setPalette(pal)
    setRoles(autoAssignRoles(pal))
    setExtractionInfo({ candidates: candidateCount, selected: count })
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
  const canIncrement = colorCount < 8

  const handleCountChange = async (delta) => {
    const newCount = colorCount + delta
    if (newCount < 3 || newCount > 8) return
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

  // ── Role assignment ──────────────────────────────────────────────────────
  const assignRole = (idx, newRole) => {
    setRoles(prev => {
      const next = { ...prev }
      // Remove the old role from this index
      delete next[idx]
      if (!newRole) return next
      // If newRole is already taken by another index, swap
      const existingIdx = Object.keys(next).find(k => next[+k] === newRole)
      if (existingIdx !== undefined) {
        // Swap: give the previous role of `idx` to the existing holder
        const prevRole = prev[idx]
        if (prevRole) next[+existingIdx] = prevRole
        else delete next[+existingIdx]
      }
      next[idx] = newRole
      return next
    })
    setOpenRoleDropdown(null)
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
              <span className="stepper-hint">5–6 recommended</span>
            </div>
          </div>
          {extractionInfo && (
            <div className="extraction-info">
              {extractionInfo.candidates} candidates → {extractionInfo.selected} selected
            </div>
          )}

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
                          <div className="role-wrapper">
                            <button
                              className={`role-pill ${roles[i] ? 'role-pill--active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenRoleDropdown(prev => prev === i ? null : i)
                              }}
                              title="Set semantic role"
                            >
                              {roles[i] ? ROLE_LABELS[roles[i]] : '·'}
                            </button>
                            {openRoleDropdown === i && (
                              <>
                                <div className="role-dropdown-backdrop" onClick={() => setOpenRoleDropdown(null)} />
                                <div className="role-dropdown">
                                  <button className="role-dropdown-item role-dropdown-item--none"
                                    onClick={(e) => { e.stopPropagation(); assignRole(i, null) }}>
                                    — none
                                  </button>
                                  {ROLE_ALL.map(role => {
                                    const takenBy = Object.keys(roles).find(k => +k !== i && roles[+k] === role)
                                    return (
                                      <button key={role}
                                        className={`role-dropdown-item ${roles[i] === role ? 'role-dropdown-item--active' : ''} ${takenBy !== undefined ? 'role-dropdown-item--taken' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); assignRole(i, role) }}>
                                        <span className="role-dropdown-label">{ROLE_LABELS[role]}</span>
                                        <span className="role-dropdown-name">{role}</span>
                                        {takenBy !== undefined && <span className="role-dropdown-swap">↔</span>}
                                      </button>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </div>
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
                {/* Template switcher pills */}
                <div className="preview-tpl-switcher">
                  {[
                    { id: 'social',    label: 'social'    },
                    { id: 'dashboard', label: 'dashboard' },
                    { id: 'poster',    label: 'poster'    },
                    { id: 'brand',     label: 'brand'     },
                    { id: 'cards',     label: 'cards'     },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      className={`preview-tpl-pill ${previewTemplate === id ? 'preview-tpl-pill--active' : ''}`}
                      onClick={() => setPreviewTemplate(id)}
                    >{label}</button>
                  ))}
                </div>
                {/* Light/dark toggle */}
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
                  <>
                    {previewTemplate === 'social'    && <SocialPreview    palette={palette} roles={roles} uiBg={uiBg} />}
                    {previewTemplate === 'dashboard' && <DashboardPreview palette={palette} roles={roles} uiBg={uiBg} />}
                    {previewTemplate === 'poster'    && <PosterPreview    palette={palette} roles={roles} uiBg={uiBg} />}
                    {previewTemplate === 'brand'     && <BrandPreview     palette={palette} roles={roles} uiBg={uiBg} />}
                    {previewTemplate === 'cards'     && <CardsPreview     palette={palette} roles={roles} uiBg={uiBg} />}
                  </>
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
