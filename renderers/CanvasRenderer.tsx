// CanvasRenderer.tsx — Plugin renderer for jarvis-plugin-canvas
// Two modes: Mermaid diagrams + freehand Draw with perfect-freehand
// React provided via window.__JARVIS_REACT (NO import React)

import mermaid from 'mermaid'
import { getStroke } from 'perfect-freehand'

// ─── Types ───

interface CanvasTab {
  id: string
  type: 'mermaid' | 'draw'
  title: string
  content: string
  replyTo: string
}

interface CanvasData {
  tabs: CanvasTab[]
  historyCount: number
}

interface DrawStroke {
  id: string
  points: number[][]
  color: string
  size: number
}

interface TextLabel {
  id: string
  x: number
  y: number
  text: string
  color: string
  fontSize: number
}

interface DrawState {
  strokes: DrawStroke[]
  texts: TextLabel[]
  viewBox: { x: number; y: number; w: number; h: number }
  tool: 'pencil' | 'eraser' | 'pan' | 'text'
  color: string
  size: number
}

// ─── Helpers ───

let strokeIdCounter = 0

function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) return ''
  const d = points.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...points[0], 'Q']
  )
  d.push('Z')
  return d.join(' ')
}

// ─── Mermaid init ───

let mermaidReady = false
function ensureMermaid() {
  if (mermaidReady) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    themeVariables: {
      darkMode: true,
      background: '#0a0e14',
      primaryColor: '#1e3a5f',
      primaryTextColor: '#c8d0d8',
      primaryBorderColor: '#4fc3f7',
      lineColor: '#4a5a6a',
      secondaryColor: '#1a2a3a',
      tertiaryColor: '#0e1420',
    },
  })
  mermaidReady = true
}

// ─── Styles ───

const S = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    height: '100%',
    background: '#0a0e14',
    color: '#c8d0d8',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: '12px',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    gap: '2px',
    padding: '4px 6px',
    background: '#080c12',
    borderBottom: '1px solid #1e2a38',
    overflowX: 'auto' as const,
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: active ? '#0e1420' : 'transparent',
    borderBottom: active ? '2px solid #4fc3f7' : '2px solid transparent',
    color: active ? '#c8d0d8' : '#4a5a6a',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    fontSize: '11px',
    userSelect: 'none' as const,
  }),
  tabClose: {
    cursor: 'pointer',
    color: '#4a5a6a',
    fontSize: '10px',
    lineHeight: 1,
    padding: '2px',
    borderRadius: '2px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    background: '#0b1018',
    borderBottom: '1px solid #1e2a38',
    flexShrink: 0,
  },
  toolBtn: (active: boolean) => ({
    padding: '3px 8px',
    background: active ? 'rgba(79,195,247,0.15)' : 'transparent',
    border: active ? '1px solid rgba(79,195,247,0.4)' : '1px solid #1e2a38',
    borderRadius: '3px',
    color: active ? '#4fc3f7' : '#6a7a8a',
    cursor: 'pointer',
    fontSize: '12px',
  }),
  sendBtn: {
    padding: '3px 12px',
    background: 'rgba(79,195,247,0.2)',
    border: '1px solid rgba(79,195,247,0.5)',
    borderRadius: '3px',
    color: '#4fc3f7',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    marginLeft: 'auto',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  mermaidWrap: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '16px',
  },
  errorBox: {
    padding: '12px 16px',
    margin: '16px',
    background: 'rgba(255,80,80,0.1)',
    border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: '4px',
    color: '#f8a0a0',
    fontFamily: 'monospace',
    fontSize: '11px',
    whiteSpace: 'pre-wrap' as const,
  },
  drawSvg: {
    width: '100%',
    height: '100%',
    cursor: 'crosshair',
    touchAction: 'none' as const,
  },
  sentFeedback: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(79,195,247,0.2)',
    border: '1px solid rgba(79,195,247,0.5)',
    borderRadius: '8px',
    padding: '12px 24px',
    color: '#4fc3f7',
    fontSize: '16px',
    fontWeight: 'bold' as const,
    pointerEvents: 'none' as const,
  },
}

// ─── MermaidView ───

function MermaidView({ syntax, tabId }: { syntax: string; tabId: string }) {
  const [svgHtml, setSvgHtml] = useState('')
  const [error, setError] = useState('')
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ensureMermaid()
    let cancelled = false
    const renderIt = async () => {
      try {
        const { svg } = await mermaid.render(`mermaid-${tabId}-${Date.now()}`, syntax)
        if (!cancelled) {
          setSvgHtml(svg)
          setError('')
          // Reset view on new diagram
          setScale(1)
          setTranslate({ x: 0, y: 0 })
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(String(err?.message ?? err))
          setSvgHtml('')
        }
      }
    }
    renderIt()
    return () => { cancelled = true }
  }, [syntax, tabId])

  // Zoom with scroll wheel (around cursor position)
  const onWheel = useCallback((e: any) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cursorX = e.clientX - rect.left
    const cursorY = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(10, scale * factor))
    // Adjust translate so zoom is centered on cursor
    const dx = cursorX - translate.x
    const dy = cursorY - translate.y
    setTranslate({
      x: cursorX - dx * (newScale / scale),
      y: cursorY - dy * (newScale / scale),
    })
    setScale(newScale)
  }, [scale, translate])

  // Pan with mouse drag
  const onPointerDown = useCallback((e: any) => {
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y }
    containerRef.current?.setPointerCapture(e.pointerId)
  }, [translate])

  const onPointerMove = useCallback((e: any) => {
    if (!isPanning.current) return
    setTranslate({
      x: panStart.current.tx + (e.clientX - panStart.current.x),
      y: panStart.current.ty + (e.clientY - panStart.current.y),
    })
  }, [])

  const onPointerUp = useCallback(() => {
    isPanning.current = false
  }, [])

  // Fit to container
  const fitToView = useCallback(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  if (error) {
    return <div style={S.errorBox}>Mermaid error: {error}</div>
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' as const }}>
      {/* Zoom toolbar */}
      <div style={S.toolbar}>
        <button style={S.toolBtn(false)} onClick={() => {
          const newScale = Math.min(10, scale * 1.25)
          setScale(newScale)
        }}>🔍+</button>
        <button style={S.toolBtn(false)} onClick={() => {
          const newScale = Math.max(0.1, scale * 0.8)
          setScale(newScale)
        }}>🔍−</button>
        <button style={S.toolBtn(false)} onClick={fitToView}>⊡ Fit</button>
        <span style={{ color: '#4a5a6a', fontSize: '11px' }}>{Math.round(scale * 100)}%</span>
      </div>
      {/* Diagram area */}
      <div
        ref={containerRef}
        style={{
          ...S.mermaidWrap,
          cursor: isPanning.current ? 'grabbing' : 'grab',
          overflow: 'hidden',
          userSelect: 'none' as const,
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }} dangerouslySetInnerHTML={{ __html: svgHtml }} />
      </div>
    </div>
  )
}

// ─── DrawView ───

function DrawView({ tab, drawStates, replyTo }: {
  tab: CanvasTab
  drawStates: { current: Map<string, DrawState> }
  replyTo: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Initialize draw state for this tab if needed
  if (!drawStates.current.has(tab.id)) {
    drawStates.current.set(tab.id, {
      strokes: [],
      texts: [],
      viewBox: { x: 0, y: 0, w: 1000, h: 700 },
      tool: 'pencil',
      color: '#4fc3f7',
      size: 4,
    })
  }

  const ds = drawStates.current.get(tab.id)!
  const [, forceRender] = useState(0)
  const rerender = useCallback(() => forceRender(n => n + 1), [])

  const currentStroke = useRef<DrawStroke | null>(null)
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const spaceDown = useRef(false)
  const [sentMsg, setSentMsg] = useState(false)
  const [textInput, setTextInput] = useState<{ x: number; y: number; svgX: number; svgY: number } | null>(null)
  const [textValue, setTextValue] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)

  // Convert screen coords to SVG coords
  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const vb = ds.viewBox
    const sx = vb.w / rect.width
    const sy = vb.h / rect.height
    return {
      x: vb.x + (clientX - rect.left) * sx,
      y: vb.y + (clientY - rect.top) * sy,
    }
  }, [ds.viewBox])

  // Space key for pan mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) { spaceDown.current = true }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') { spaceDown.current = false }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Pointer events
  const onPointerDown = useCallback((e: any) => {
    const svg = svgRef.current
    if (!svg) return
    svg.setPointerCapture(e.pointerId)

    if (spaceDown.current || ds.tool === 'pan' || e.button === 1) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, vx: ds.viewBox.x, vy: ds.viewBox.y }
      return
    }

    if (ds.tool === 'text') {
      const p = screenToSvg(e.clientX, e.clientY)
      const rect = svg.getBoundingClientRect()
      const vb = ds.viewBox
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top
      setTextInput({ x: screenX, y: screenY, svgX: p.x, svgY: p.y })
      setTextValue('')
      setTimeout(() => textInputRef.current?.focus(), 50)
      return
    }

    if (ds.tool === 'eraser') {
      const p = screenToSvg(e.clientX, e.clientY)
      const threshold = 15 * (ds.viewBox.w / (svgRef.current?.getBoundingClientRect().width || 1))
      ds.strokes = ds.strokes.filter(s => {
        return !s.points.some(([sx, sy]) =>
          Math.abs(sx - p.x) < threshold && Math.abs(sy - p.y) < threshold
        )
      })
      rerender()
      return
    }

    // Pencil
    const p = screenToSvg(e.clientX, e.clientY)
    currentStroke.current = {
      id: `stroke-${++strokeIdCounter}`,
      points: [[p.x, p.y, e.pressure ?? 0.5]],
      color: ds.color,
      size: ds.size,
    }
    rerender()
  }, [ds, screenToSvg, rerender])

  const onPointerMove = useCallback((e: any) => {
    if (isPanning.current) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const sx = ds.viewBox.w / rect.width
      const sy = ds.viewBox.h / rect.height
      ds.viewBox.x = panStart.current.vx - (e.clientX - panStart.current.x) * sx
      ds.viewBox.y = panStart.current.vy - (e.clientY - panStart.current.y) * sy
      rerender()
      return
    }

    if (ds.tool === 'eraser') {
      if (e.buttons !== 1) return
      const p = screenToSvg(e.clientX, e.clientY)
      const threshold = 15 * (ds.viewBox.w / (svgRef.current?.getBoundingClientRect().width || 1))
      const before = ds.strokes.length
      ds.strokes = ds.strokes.filter(s => {
        return !s.points.some(([sx, sy]) =>
          Math.abs(sx - p.x) < threshold && Math.abs(sy - p.y) < threshold
        )
      })
      if (ds.strokes.length !== before) rerender()
      return
    }

    if (!currentStroke.current) return
    const p = screenToSvg(e.clientX, e.clientY)
    currentStroke.current.points.push([p.x, p.y, e.pressure ?? 0.5])
    rerender()
  }, [ds, screenToSvg, rerender])

  const onPointerUp = useCallback(() => {
    if (isPanning.current) {
      isPanning.current = false
      return
    }
    if (currentStroke.current && currentStroke.current.points.length > 1) {
      ds.strokes.push(currentStroke.current)
    }
    currentStroke.current = null
    rerender()
  }, [ds, rerender])

  // Zoom
  const onWheel = useCallback((e: any) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vb = ds.viewBox
    const factor = e.deltaY > 0 ? 1.1 : 0.9
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top) / rect.height
    const newW = vb.w * factor
    const newH = vb.h * factor
    vb.x += (vb.w - newW) * mx
    vb.y += (vb.h - newH) * my
    vb.w = newW
    vb.h = newH
    rerender()
  }, [ds, rerender])

  // Render strokes
  const allStrokes = currentStroke.current
    ? [...ds.strokes, currentStroke.current]
    : ds.strokes

  const commitText = useCallback(() => {
    if (!textInput || !textValue.trim()) {
      setTextInput(null)
      setTextValue('')
      return
    }
    ds.texts.push({
      id: `text-${++strokeIdCounter}`,
      x: textInput.svgX,
      y: textInput.svgY,
      text: textValue.trim(),
      color: ds.color,
      fontSize: 16,
    })
    setTextInput(null)
    setTextValue('')
    rerender()
  }, [textInput, textValue, ds, rerender])

  const vb = ds.viewBox
  const cursor = ds.tool === 'text' ? 'text'
    : ds.tool === 'pan' || spaceDown.current ? 'grab'
    : ds.tool === 'eraser' ? 'cell' : 'crosshair'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Toolbar */}
      <div style={S.toolbar}>
        <button style={S.toolBtn(ds.tool === 'pencil')}
          onClick={() => { ds.tool = 'pencil'; rerender() }}>✏️ Pencil</button>
        <button style={S.toolBtn(ds.tool === 'text')}
          onClick={() => { ds.tool = 'text'; rerender() }}>🔤 Text</button>
        <button style={S.toolBtn(ds.tool === 'eraser')}
          onClick={() => { ds.tool = 'eraser'; rerender() }}>🧹 Eraser</button>
        <button style={S.toolBtn(ds.tool === 'pan')}
          onClick={() => { ds.tool = 'pan'; rerender() }}>🤚 Pan</button>

        <span style={{ color: '#4a5a6a' }}>│</span>

        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6a7a8a' }}>
          <input type="color" value={ds.color}
            style={{ width: '20px', height: '20px', border: 'none', background: 'none', cursor: 'pointer' }}
            onChange={(e: any) => { ds.color = e.target.value; rerender() }} />
        </label>

        <span style={{ color: '#4a5a6a' }}>│</span>

        <button style={{ ...S.toolBtn(false), color: '#f8a0a0' }}
          onClick={() => { ds.strokes = []; ds.texts = []; rerender() }}>🗑️ Clear</button>

        <button style={S.sendBtn}
          onClick={() => {
            const svg = svgRef.current
            if (!svg) return
            try {
              const serializer = new XMLSerializer()
              const svgString = serializer.serializeToString(svg)
              const img = new Image()
              img.onload = () => {
                const c = document.createElement('canvas')
                c.width = 1400; c.height = 900
                const ctx2d = c.getContext('2d')
                if (!ctx2d) return
                ctx2d.fillStyle = '#0a0e14'
                ctx2d.fillRect(0, 0, 1400, 900)
                ctx2d.drawImage(img, 0, 0, 1400, 900)
                const dataUrl = c.toDataURL('image/png')
                const pngBase64 = dataUrl.replace(/^data:image\/png;base64,/, '')
                fetch('/plugins/canvas/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tabId: tab.id, pngBase64, replyTo }),
                }).then(() => {
                  setSentMsg(true)
                  setTimeout(() => setSentMsg(false), 2000)
                })
              }
              img.onerror = (err) => console.error('SVG to image error:', err)
              img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))
            } catch (err) { console.error('Send error:', err) }
          }}>{replyTo && replyTo !== 'main' ? `📤 Send to ${replyTo}` : '📤 Send to JARVIS'}</button>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        style={{ ...S.drawSvg, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        {/* Grid */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(79,195,247,0.05)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={vb.x - 5000} y={vb.y - 5000} width={vb.w + 10000} height={vb.h + 10000} fill="url(#grid)" />

        {/* AI layer */}
        <g dangerouslySetInnerHTML={{ __html: tab.content || '' }} />

        {/* User strokes */}
        {allStrokes.map(s => {
          const outlinePoints = getStroke(s.points, {
            size: s.size,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
          })
          const pathData = getSvgPathFromStroke(outlinePoints)
          return <path key={s.id} d={pathData} fill={s.color} strokeLinejoin="round" strokeLinecap="round" />
        })}

        {/* User text labels */}
        {ds.texts.map(t => (
          <text
            key={t.id}
            x={t.x}
            y={t.y}
            fill={t.color}
            fontSize={t.fontSize}
            fontFamily="'JetBrains Mono', monospace"
            dominantBaseline="hanging"
          >{t.text}</text>
        ))}
      </svg>

      {/* Floating text input */}
      {textInput && (
        <input
          ref={textInputRef}
          type="text"
          value={textValue}
          onChange={(e: any) => setTextValue(e.target.value)}
          onKeyDown={(e: any) => {
            if (e.key === 'Enter') commitText()
            if (e.key === 'Escape') { setTextInput(null); setTextValue('') }
          }}
          onBlur={() => commitText()}
          style={{
            position: 'absolute',
            left: textInput.x,
            top: textInput.y + 38,
            background: 'rgba(10,14,20,0.9)',
            border: '1px solid #4fc3f7',
            borderRadius: '3px',
            color: ds.color,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '14px',
            padding: '2px 6px',
            outline: 'none',
            minWidth: '120px',
            zIndex: 50,
          }}
          placeholder="Type text..."
        />
      )}

      {/* Sent feedback */}
      {sentMsg && <div style={S.sentFeedback}>Sent ✓</div>}
    </div>
  )
}

// ─── Main Renderer ───

export function CanvasRenderer({ state }: { state: any }) {
  const data = state.data as CanvasData | undefined
  const lastHistoryCount = useRef(0)

  const [tabs, setTabs] = useState<CanvasTab[]>([])
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const drawStatesRef = useRef(new Map<string, DrawState>())

  // Sync tabs from backend data
  useEffect(() => {
    if (!data) return
    if (data.historyCount === lastHistoryCount.current) return
    lastHistoryCount.current = data.historyCount

    setTabs(data.tabs)
    // Auto-activate last tab if new tabs were added
    if (data.tabs.length > tabs.length) {
      setActiveTabIdx(data.tabs.length - 1)
    }
    // Clean up draw states for removed tabs
    const ids = new Set(data.tabs.map(t => t.id))
    for (const key of drawStatesRef.current.keys()) {
      if (!ids.has(key)) drawStatesRef.current.delete(key)
    }
  }, [data])

  // Close tab locally (just removes from view — backend still has it)
  const closeTab = useCallback((idx: number) => {
    setTabs(prev => {
      const next = prev.filter((_, i) => i !== idx)
      return next
    })
    setActiveTabIdx(prev => {
      const newLen = tabs.length - 1
      if (newLen <= 0) return 0
      if (prev >= newLen) return newLen - 1
      if (prev > idx) return prev - 1
      return prev
    })
  }, [tabs])

  // Send is handled inside DrawView (has direct svgRef access)

  // Empty state
  if (tabs.length === 0) return null

  const activeTab = tabs[activeTabIdx] ?? tabs[0]

  return (
    <div style={S.container}>
      {/* Tab bar */}
      <div style={S.tabBar}>
        {tabs.map((tab, i) => (
          <div key={tab.id} style={S.tab(i === activeTabIdx)} onClick={() => setActiveTabIdx(i)}>
            <span>{tab.type === 'mermaid' ? '📊' : '✏️'}</span>
            <span>{tab.title}</span>
            <span
              style={S.tabClose}
              onClick={(e: any) => { e.stopPropagation(); closeTab(i) }}
              onMouseEnter={(e: any) => { e.target.style.color = '#f88'; e.target.style.background = 'rgba(255,80,80,0.15)' }}
              onMouseLeave={(e: any) => { e.target.style.color = '#4a5a6a'; e.target.style.background = 'transparent' }}
            >✕</span>
          </div>
        ))}
      </div>

      {/* Content area */}
      <div style={S.content}>
        {activeTab.type === 'mermaid' ? (
          <MermaidView syntax={activeTab.content} tabId={activeTab.id} />
        ) : (
          <DrawView tab={activeTab} drawStates={drawStatesRef} replyTo={activeTab.replyTo || 'main'} />
        )}
      </div>
    </div>
  )
}

export default CanvasRenderer
