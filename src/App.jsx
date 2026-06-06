import { useState, useRef, useCallback } from 'react'
import { getPalette } from 'colorthief'
import './App.css'

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

function hexToRgbStr(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

// ── Export formats ───────────────────────────────────────────────────────────
const EXPORT_FORMATS = {
  css:      (p) => `:root {\n${p.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`,
  tailwind: (p) => `colors: {\n${p.map((h, i) => `  'color-${i + 1}': '${h}',`).join('\n')}\n}`,
  json:     (p) => JSON.stringify(p, null, 2),
  hex:      (p) => p.join('\n'),
}
const EXPORT_LABELS = { css: 'CSS vars', tailwind: 'Tailwind', json: 'JSON', hex: 'Hex list' }

// ── Icons ────────────────────────────────────────────────────────────────────
function LockIcon({ locked }) {
  return locked ? (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="6" rx="1.5" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5.5" width="8" height="6" rx="1.5" opacity="0.6" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0V2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [colorCount, setColorCount] = useState(6)
  const [palette, setPalette]       = useState([])
  const [locks, setLocks]           = useState(new Set())
  const [openSlider, setOpenSlider] = useState(null)   // index or null
  const [sliderHsl, setSliderHsl]   = useState(null)   // {h,s,l}
  const [history, setHistory]       = useState([])     // [{palette, locks}]
  const [preview, setPreview]       = useState(null)
  const [dragging, setDragging]     = useState(false)
  const [copied, setCopied]         = useState(null)

  const imgRef        = useRef(null)
  const fileInputRef  = useRef(null)
  const colorCountRef = useRef(6)
  colorCountRef.current = colorCount

  // ── History helpers ────────────────────────────────────────────────────────
  const pushToHistory = useCallback((currentPalette, currentLocks, currentCount) => {
    setHistory(h => [
      ...h.slice(-9),
      { palette: [...currentPalette], locks: [...currentLocks], colorCount: currentCount },
    ])
  }, [])

  const undo = () => {
    if (!history.length) return
    const prev = history[history.length - 1]
    setPalette(prev.palette)
    setLocks(new Set(prev.locks))
    setColorCount(prev.colorCount)
    setOpenSlider(null)
    setHistory(h => h.slice(0, -1))
  }

  // ── Extraction ─────────────────────────────────────────────────────────────
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

  // Called when a fresh image finishes loading
  const onImageLoad = async () => {
    const count = colorCountRef.current
    const colors = await getPalette(imgRef.current, { colorCount: count })
    setPalette(colors.map(c => c.hex()))
    setLocks(new Set())
    setOpenSlider(null)
    setHistory([])
  }

  const extractPalette = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPreview(URL.createObjectURL(file))
    setPalette([])
    setLocks(new Set())
    setOpenSlider(null)
  }, [])

  // ── Color count stepper ────────────────────────────────────────────────────
  const activeLocksCount = [...locks].filter(i => i < colorCount).length

  const handleCountChange = async (delta) => {
    const newCount = colorCount + delta
    if (newCount < 3 || newCount > 10) return
    if (newCount < activeLocksCount) return  // can't go below locked count

    pushToHistory(palette, locks, colorCount)
    // Drop locks that would fall outside the new range
    const newLocks = new Set([...locks].filter(i => i < newCount))
    setLocks(newLocks)
    setColorCount(newCount)
    setOpenSlider(null)

    if (imgRef.current && palette.length > 0) {
      const newPalette = await runExtraction(newCount, palette, newLocks)
      if (newPalette) setPalette(newPalette)
    }
  }

  // ── Lock ───────────────────────────────────────────────────────────────────
  const toggleLock = (i, e) => {
    e.stopPropagation()
    setLocks(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
    if (openSlider === i) setOpenSlider(null)
  }

  // ── HSL sliders ────────────────────────────────────────────────────────────
  const handleSwatchClick = (i) => {
    if (locks.has(i)) {
      // Locked: just copy
      handleCopy(palette[i], i)
      return
    }
    if (openSlider === i) {
      setOpenSlider(null)
      return
    }
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

  // ── Copy / export ──────────────────────────────────────────────────────────
  const handleCopy = (hex, i) => {
    navigator.clipboard.writeText(hex)
    setCopied(i)
    setTimeout(() => setCopied(null), 1000)
  }

  const handleExport = (key) => {
    navigator.clipboard.writeText(EXPORT_FORMATS[key](palette))
    setCopied(key)
    setTimeout(() => setCopied(null), 1000)
  }

  // ── Drag / file input ──────────────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    extractPalette(e.dataTransfer.files[0])
  }

  const onFileChange = (e) => extractPalette(e.target.files[0])

  const canDecrement = colorCount > 3 && (colorCount - 1) >= activeLocksCount
  const canIncrement = colorCount < 10

  // ── HSL slider track gradients ─────────────────────────────────────────────
  const hueGrad = 'linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))'
  const satGrad  = sliderHsl ? `linear-gradient(to right,hsl(${sliderHsl.h},0%,${sliderHsl.l}%),hsl(${sliderHsl.h},100%,${sliderHsl.l}%))` : ''
  const lightGrad = sliderHsl ? `linear-gradient(to right,hsl(${sliderHsl.h},${sliderHsl.s}%,5%),hsl(${sliderHsl.h},${sliderHsl.s}%,50%),hsl(${sliderHsl.h},${sliderHsl.s}%,95%))` : ''

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="app">

      <header className="header">
        <h1 className="title">PaletteSnap</h1>
        <p className="privacy">
          <ShieldIcon /> 100% local · no upload · no account
        </p>
        <p className="subtitle">Extract dominant colors from any image</p>
      </header>

      {/* ── Drop zone / thumbnail ── */}
      {!preview ? (
        <label
          className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="dropzone__hint">
            <span className="dropzone__icon">↑</span>
            Drag &amp; drop an image<br />or click to browse
          </span>
          <input type="file" accept="image/*" hidden onChange={onFileChange} />
        </label>
      ) : (
        <div className="preview-area">
          <img
            ref={imgRef}
            src={preview}
            alt="uploaded"
            className="preview-img"
            onLoad={onImageLoad}
          />
          <button className="swap-btn" onClick={() => fileInputRef.current?.click()}>
            ↺ Try another image
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
        </div>
      )}

      {/* ── Palette section ── */}
      {palette.length > 0 && (
        <section className="palette-section">

          {/* Controls row */}
          <div className="palette-controls">
            <button
              className="undo-btn"
              onClick={undo}
              disabled={history.length === 0}
              title="Undo last change"
            >
              ← Undo
            </button>

            <div className="stepper" aria-label="Color count">
              <button
                className="stepper__btn"
                onClick={() => handleCountChange(-1)}
                disabled={!canDecrement}
                aria-label="Fewer colors"
              >−</button>
              <span className="stepper__count">{colorCount}</span>
              <button
                className="stepper__btn"
                onClick={() => handleCountChange(1)}
                disabled={!canIncrement}
                aria-label="More colors"
              >+</button>
            </div>
          </div>

          {/* Swatches */}
          <div
            className="swatches"
            style={{ gridTemplateColumns: `repeat(${colorCount}, 1fr)` }}
          >
            {palette.map((hex, i) => (
              <div
                key={i}
                className={[
                  'swatch',
                  openSlider === i ? 'swatch--open' : '',
                  locks.has(i)    ? 'swatch--locked' : '',
                ].join(' ')}
                style={{ '--color': hex }}
              >
                {/* Color square */}
                <div
                  className="swatch__color-wrap"
                  onClick={() => handleSwatchClick(i)}
                  title={locks.has(i) ? 'Locked – click to copy' : 'Click to adjust'}
                >
                  <span className="swatch__color" />

                  {/* Lock button */}
                  <button
                    className={`swatch__lock-btn ${locks.has(i) ? 'swatch__lock-btn--on' : ''}`}
                    onClick={(e) => toggleLock(i, e)}
                    title={locks.has(i) ? 'Unlock color' : 'Lock color'}
                  >
                    <LockIcon locked={locks.has(i)} />
                  </button>

                  {/* Copy toast (centered over the square) */}
                  {copied === i && (
                    <span className="swatch__toast">✓ Copied</span>
                  )}
                </div>

                {/* Hex + RGB labels */}
                <button
                  className="swatch__hex-btn"
                  onClick={(e) => { e.stopPropagation(); handleCopy(hex, i) }}
                  title="Copy hex"
                >
                  <span className="swatch__hex">{hex}</span>
                  <span className="swatch__rgb">{hexToRgbStr(hex)}</span>
                </button>
              </div>
            ))}
          </div>

          {/* HSL adjustment panel */}
          {openSlider !== null && sliderHsl && (
            <div className="hsl-panel">
              <div className="hsl-panel__header">
                <span
                  className="hsl-panel__dot"
                  style={{ background: palette[openSlider] }}
                />
                <span className="hsl-panel__title">
                  Adjusting color {openSlider + 1}
                </span>
                <button
                  className="hsl-panel__close"
                  onClick={() => setOpenSlider(null)}
                >✕</button>
              </div>

              {[
                { key: 'h', label: 'Hue',   max: 360, unit: '°',  grad: hueGrad   },
                { key: 's', label: 'Sat',   max: 100, unit: '%',  grad: satGrad   },
                { key: 'l', label: 'Light', max: 100, unit: '%',  grad: lightGrad },
              ].map(({ key, label, max, unit, grad }) => (
                <div key={key} className="hsl-row">
                  <span className="hsl-row__label">{label}</span>
                  <div className="hsl-row__track" style={{ background: grad }}>
                    <input
                      type="range"
                      className="hsl-row__slider"
                      min={0}
                      max={max}
                      value={sliderHsl[key]}
                      onChange={e => onHslChange(key, e.target.value)}
                    />
                  </div>
                  <span className="hsl-row__val">{sliderHsl[key]}{unit}</span>
                </div>
              ))}
            </div>
          )}

          {/* Connected strip */}
          <div className="palette-strip">
            {palette.map((hex, i) => (
              <span key={i} className="strip-segment" style={{ background: hex }} />
            ))}
          </div>

          {/* Export */}
          <div className="export">
            <span className="export__label">Export</span>
            <div className="export__buttons">
              {Object.keys(EXPORT_FORMATS).map((key) => (
                <button
                  key={key}
                  className={`export__btn ${copied === key ? 'export__btn--copied' : ''}`}
                  onClick={() => handleExport(key)}
                >
                  {copied === key ? '✓ Copied' : EXPORT_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

        </section>
      )}
    </main>
  )
}
