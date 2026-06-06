import { useState, useRef, useCallback, useEffect } from 'react'
import { getPalette } from 'colorthief'
import './App.css'

// ── Design tokens (mirrored in CSS) ─────────────────────────────────────────
const C = {
  bg:       '#0A0A0B',
  surface:  '#0D0D0F',
  border:   '#1A1A1C',
  subtle:   '#141416',
  text:     '#E8E8E6',
  muted:    '#888888',
  inactive: '#3A3A40',
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

// ── Export formats ───────────────────────────────────────────────────────────
const EXPORT_FORMATS = {
  css:      (p) => `:root {\n${p.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}`,
  tailwind: (p) => `colors: {\n${p.map((h, i) => `  'color-${i + 1}': '${h}',`).join('\n')}\n}`,
  json:     (p) => JSON.stringify(p, null, 2),
  scss:     (p) => p.map((h, i) => `$color-${i + 1}: ${h};`).join('\n'),
}
const EXPORT_TABS = ['css', 'tailwind', 'json', 'scss']

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
const VISION_FILTERS = {
  normal:       null,
  protanopia:   '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  tritanopia:   '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
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

// ── UI Preview mockup ────────────────────────────────────────────────────────
function UIPreview({ palette }) {
  if (palette.length < 2) return (
    <div className="uip-empty">Load an image to see a preview</div>
  )
  const nav   = palette[1] || palette[0]
  const cta   = palette[3] || palette[0]
  const card1 = palette[0]
  const card2 = palette[2] || palette[1]
  return (
    <div className="uip">
      <div className="uip-nav" style={{ background: nav }}>
        <span className="uip-dot" style={{ background: cta }} />
        <span className="uip-brand">Brand</span>
        <span className="uip-cta" style={{ background: cta }}>CTA</span>
      </div>
      <div className="uip-hero" style={{ background: nav }}>
        <div className="uip-heading">Hello World</div>
        <div className="uip-sub">Your palette on a real UI</div>
      </div>
      <div className="uip-cards">
        <div className="uip-card">
          <span className="uip-card-dot" style={{ background: card1 }} />
          <span className="uip-card-lbl">Card</span>
        </div>
        <div className="uip-card">
          <span className="uip-card-dot" style={{ background: card2 }} />
          <span className="uip-card-lbl">Card</span>
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
  const [paletteMode, setPaletteMode] = useState('normal')
  const [exportTab, setExportTab]   = useState('css')
  const [currentView, setCurrentView] = useState('extract')

  // ── Panel resize state ───────────────────────────────────────────────────
  const [panelWidths, setPanelWidthsState] = useState({ left: 260, right: 280 })
  const panelWidthsRef = useRef({ left: 260, right: 280 })
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
  const isDraggingRegion = useRef(false)

  colorCountRef.current = colorCount
  locksRef.current = locks
  paletteRef.current = palette

  // ── History ──────────────────────────────────────────────────────────────
  const pushToHistory = useCallback((p, l, c) => {
    setHistory(h => [
      ...h.slice(-9),
      { palette: [...p], locks: [...l], colorCount: c, at: Date.now() },
    ])
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
    setPalette(prev.palette)
    setLocks(new Set(prev.locks))
    setColorCount(prev.colorCount)
    setOpenSlider(null)
    setHistory(h => h.slice(0, -1))
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
        let newLeft = Math.min(380, Math.max(180, d.startLeft + delta))
        const center = totalWidth - newLeft - right - 8
        if (center < 300) newLeft = totalWidth - right - 308
        setPanelWidths({ left: newLeft, right })
      } else {
        let newRight = Math.min(400, Math.max(200, d.startRight - delta))
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
    setPalette(colors.map(c => c.hex()))
    setLocks(new Set())
    setOpenSlider(null)
    setHistory([])
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
    navigator.clipboard.writeText(EXPORT_FORMATS[exportTab](palette))
    setCopied('export')
    setTimeout(() => setCopied(null), 1000)
  }

  // ── HSL gradient tracks ──────────────────────────────────────────────────
  const hueGrad   = 'linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%))'
  const satGrad   = sliderHsl ? `linear-gradient(to right,hsl(${sliderHsl.h},0%,${sliderHsl.l}%),hsl(${sliderHsl.h},100%,${sliderHsl.l}%))` : ''
  const lightGrad = sliderHsl ? `linear-gradient(to right,hsl(${sliderHsl.h},${sliderHsl.s}%,5%),hsl(${sliderHsl.h},${sliderHsl.s}%,50%),hsl(${sliderHsl.h},${sliderHsl.s}%,95%))` : ''

  // ── Accessibility ────────────────────────────────────────────────────────
  const passCount = palette.filter(h => getContrastRatio(h, '#ffffff') >= 4.5).length

  // ── Vision filter style ──────────────────────────────────────────────────
  const visionFilterStyle = visionMode !== 'normal'
    ? { filter: `url(#${visionMode})` }
    : {}

  // ── Export code ──────────────────────────────────────────────────────────
  const exportCode = palette.length > 0 ? EXPORT_FORMATS[exportTab](palette) : ''
  const exportCodeHTML = palette.length > 0 ? renderCodeHTML(exportCode, exportTab) : ''

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* Hidden SVG color-vision filters */}
      <svg className="vision-defs" aria-hidden="true">
        <defs>
          {Object.entries(VISION_FILTERS).filter(([k]) => k !== 'normal').map(([id, vals]) => (
            <filter key={id} id={id}>
              <feColorMatrix type="matrix" values={vals} />
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
          <span className="titlebar-name">PaletteSnap 1</span>
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

        {/* ═══════════ PANEL 1: IMAGE ═══════════ */}
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

          {/* Controls: undo + stepper */}
          <div className="image-controls">
            <button
              className="ctrl-btn"
              onClick={undo}
              disabled={history.length === 0}
            >← undo</button>
            <div className="stepper">
              <button className="stepper-btn" onClick={() => handleCountChange(-1)} disabled={!canDecrement}>−</button>
              <span className="stepper-count">{colorCount}</span>
              <button className="stepper-btn" onClick={() => handleCountChange(1)} disabled={!canIncrement}>+</button>
            </div>
          </div>

        </aside>

        {/* ── Divider 1 ── */}
        <div
          className="panel-divider"
          onMouseDown={(e) => handleDividerMouseDown('left', e)}
        >
          <div className="panel-divider-grip" />
        </div>

        {/* ═══════════ PANEL 2: PALETTE ═══════════ */}
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
                      <button
                        key={idx}
                        className="history-entry"
                        onClick={() => restoreFromHistory(entry)}
                      >
                        <div className="history-swatches">
                          {entry.palette.map((hex, ci) => (
                            <span
                              key={ci}
                              className="history-swatch"
                              style={{ background: hex }}
                            />
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

          {/* ── Extract view ── */}
          {currentView === 'extract' && (<>

          {/* Toolbar */}
          <div className="palette-toolbar">
            <div className="palette-modes">
              {['normal', 'a11y', 'preview'].map(m => (
                <button
                  key={m}
                  className={`palette-mode-btn ${paletteMode === m ? 'palette-mode-btn--active' : ''}`}
                  onClick={() => setPaletteMode(m)}
                >{m}</button>
              ))}
            </div>
            <button
              className={`export-btn ${copied === 'export' ? 'export-btn--copied' : ''}`}
              onClick={handleExport}
              disabled={!palette.length}
            >
              {copied === 'export' ? '✓ copied' : `export ↓`}
            </button>
          </div>

          {/* Swatch list — normal / a11y modes */}
          {paletteMode !== 'preview' && palette.length > 0 && (
            <div className="swatch-list" style={visionFilterStyle}>
              {palette.map((hex, i) => {
                const name = getColorName(hex)
                const contrast = getContrastRatio(hex, '#ffffff')
                const level = contrast >= 7 ? 'AAA' : contrast >= 4.5 ? 'AA' : null
                const isOpen = openSlider === i
                const isLocked = locks.has(i)
                return (
                  <div key={i} className={`swatch-row ${isOpen ? 'swatch-row--open' : ''}`}>
                    <div
                      className="swatch-row-main"
                      onClick={() => handleSwatchClick(i)}
                    >
                      {/* Color block */}
                      <span className="swatch-block" style={{ background: hex }} />

                      {/* Labels */}
                      <div className="swatch-labels">
                        <span className="swatch-hex">{hex}</span>
                        <span className="swatch-name">{name}</span>
                      </div>

                      {/* A11y badge in a11y mode */}
                      {paletteMode === 'a11y' && (
                        <span className={`a11y-badge ${level ? 'a11y-badge--pass' : 'a11y-badge--fail'}`}>
                          {level || '✗'} {contrast.toFixed(1)}
                        </span>
                      )}

                      {/* Actions */}
                      <div className="swatch-actions">
                        <button
                          className={`swatch-action ${isLocked ? 'swatch-action--locked' : ''}`}
                          onClick={(e) => toggleLock(i, e)}
                          title={isLocked ? 'Unlock' : 'Lock'}
                        >
                          <LockIcon locked={isLocked} />
                        </button>
                        <button
                          className={`swatch-action ${copied === i ? 'swatch-action--copied' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleCopy(hex, i) }}
                          title="Copy hex"
                        >
                          {copied === i ? '✓' : <CopyIcon />}
                        </button>
                      </div>
                    </div>

                    {/* Inline HSL panel */}
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
                                type="range"
                                className="hsl-slider"
                                min={0} max={max}
                                value={sliderHsl[key]}
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

              {/* Color strip */}
              <div className="color-strip">
                {palette.map((hex, i) => (
                  <span key={i} style={{ flex: 1, background: hex, display: 'block' }} />
                ))}
              </div>
            </div>
          )}

          {/* Preview mode */}
          {paletteMode === 'preview' && (
            <div className="preview-mode">
              <UIPreview palette={palette} />
            </div>
          )}

          {/* Empty state */}
          {palette.length === 0 && (
            <div className="palette-empty">
              <span>Load an image to extract colors</span>
            </div>
          )}

          {/* Export code block */}
          {palette.length > 0 && (
            <div className="export-section">
              <div className="export-tabs">
                {EXPORT_TABS.map(tab => (
                  <button
                    key={tab}
                    className={`export-tab ${exportTab === tab ? 'export-tab--active' : ''}`}
                    onClick={() => setExportTab(tab)}
                  >{tab}</button>
                ))}
              </div>
              <pre
                className="code-block"
                dangerouslySetInnerHTML={{ __html: exportCodeHTML }}
              />
            </div>
          )}

          </>)}

        </main>

        {/* ── Divider 2 ── */}
        <div
          className="panel-divider"
          onMouseDown={(e) => handleDividerMouseDown('right', e)}
        >
          <div className="panel-divider-grip" />
        </div>

        {/* ═══════════ PANEL 3: INTELLIGENCE ═══════════ */}
        <aside className="panel panel--intel" style={{ width: panelWidths.right }}>

          {/* Accessibility */}
          <div className="panel-header">
            <span className="panel-label">ACCESSIBILITY</span>
            {palette.length > 0 && (
              <span className="panel-badge" style={{ color: C.pass }}>
                {passCount}/{palette.length} pass
              </span>
            )}
          </div>

          {palette.length > 0 ? (
            <>
              <div className="intel-section-label">CONTRAST · WHITE BG</div>
              <div className="contrast-grid">
                {palette.map((hex, i) => {
                  const ratio = getContrastRatio(hex, '#ffffff')
                  const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : null
                  return (
                    <div key={i} className="contrast-cell" style={{ background: hex }}>
                      <span className="contrast-ratio">{ratio.toFixed(1)}:1</span>
                      <span className={`contrast-badge ${level ? 'contrast-badge--pass' : 'contrast-badge--fail'}`}>
                        {level || '✗'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="intel-empty">—</div>
          )}

          {/* Vision simulation */}
          <div className="panel-header" style={{ marginTop: '1rem' }}>
            <span className="panel-label">VISION · SIMULATE</span>
          </div>
          <div className="vision-pills">
            {Object.keys(VISION_FILTERS).map(m => (
              <button
                key={m}
                className={`vision-pill ${visionMode === m ? 'vision-pill--active' : ''}`}
                onClick={() => setVisionMode(m)}
              >{m}</button>
            ))}
          </div>

          {/* UI Preview */}
          <div className="panel-header" style={{ marginTop: '1rem' }}>
            <span className="panel-label">UI PREVIEW</span>
          </div>
          <UIPreview palette={palette} />

        </aside>
      </div>
    </div>
  )
}
