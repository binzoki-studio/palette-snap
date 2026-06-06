import { useState, useRef, useCallback } from 'react'
import ColorThief from 'colorthief'
import './App.css'

const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')

export default function App() {
  const [palette, setPalette] = useState([])
  const [preview, setPreview] = useState(null)
  const [dragging, setDragging] = useState(false)
  const imgRef = useRef(null)

  const extractPalette = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    setPalette([])
  }, [])

  const onImageLoad = () => {
    const ct = new ColorThief()
    const colors = ct.getPalette(imgRef.current, 6)
    setPalette(colors)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    extractPalette(e.dataTransfer.files[0])
  }

  const onFileChange = (e) => extractPalette(e.target.files[0])

  return (
    <main className="app">
      <h1 className="title">PaletteSnap</h1>
      <p className="subtitle">Drop an image to extract its dominant colors</p>

      <label
        className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {preview ? (
          <img
            ref={imgRef}
            src={preview}
            alt="uploaded"
            className="preview-img"
            crossOrigin="anonymous"
            onLoad={onImageLoad}
          />
        ) : (
          <span className="dropzone__hint">
            Drag &amp; drop an image<br />or click to browse
          </span>
        )}
        <input type="file" accept="image/*" hidden onChange={onFileChange} />
      </label>

      {palette.length > 0 && (
        <div className="swatches">
          {palette.map((color, i) => {
            const hex = toHex(color)
            return (
              <button
                key={i}
                className="swatch"
                style={{ background: hex }}
                title={hex}
                onClick={() => navigator.clipboard.writeText(hex)}
              >
                <span className="swatch__hex">{hex}</span>
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}
