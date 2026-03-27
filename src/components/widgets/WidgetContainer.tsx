import { useRef, useState } from 'react'
import {
  GripVertical, Maximize2, Minimize2, X, Settings,
  Activity, BarChart3, Layers, Edit3,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { WidgetConfig } from '@/types'
import { cn } from '@/lib/utils'

const WIDGET_ICON: Record<string, React.ReactNode> = {
  waveform:    <Activity size={12} className="text-[#58a6ff]" />,
  stats:       <BarChart3 size={12} className="text-[#3fb950]" />,
  comparative: <Layers size={12} className="text-[#bc8cff]" />,
  fft:         <Activity size={12} className="text-[#d29922]" />,
  correlation: <Activity size={12} className="text-[#f85149]" />,
}

interface WidgetContainerProps {
  widget: WidgetConfig
  children: React.ReactNode
  onDragStart?: () => void
}

export function WidgetContainer({ widget, children, onDragStart }: WidgetContainerProps) {
  const removeWidget = useWorkspaceStore(s => s.removeWidget)
  const updateWidget = useWorkspaceStore(s => s.updateWidget)
  const popOutWidget = useWorkspaceStore(s => s.popOutWidget)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(widget.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  function handleTitleSubmit() {
    if (titleDraft.trim()) updateWidget(widget.id, { title: titleDraft.trim() })
    setIsEditingTitle(false)
  }

  return (
    <div className="flex flex-col h-full bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden group/widget">
      {/* Header / drag handle */}
      <div
        className="widget-drag-handle flex items-center gap-2 px-2 py-1.5 border-b border-[#30363d] bg-[#1c2128] cursor-grab active:cursor-grabbing shrink-0 select-none"
        onMouseDown={onDragStart}
      >
        <GripVertical size={13} className="text-[#30363d] group-hover/widget:text-[#6e7681] transition-colors shrink-0" />
        {WIDGET_ICON[widget.type]}

        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTitleSubmit()
              if (e.key === 'Escape') { setTitleDraft(widget.title); setIsEditingTitle(false) }
            }}
            className="flex-1 bg-[#0d1117] border border-[#58a6ff] rounded px-1.5 py-0.5 text-xs text-[#e6edf3] focus:outline-none min-w-0"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-xs font-medium text-[#8b949e] truncate min-w-0 cursor-text"
            onDoubleClick={() => { setIsEditingTitle(true); setTitleDraft(widget.title) }}
          >
            {widget.title}
          </span>
        )}

        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/widget:opacity-100 transition-opacity shrink-0">
          <HeaderBtn
            icon={<Edit3 size={11} />}
            title="Rename"
            onClick={() => { setIsEditingTitle(true); setTitleDraft(widget.title) }}
          />
          <HeaderBtn
            icon={<Settings size={11} />}
            title="Widget settings"
            onClick={() => {}}
          />
          <HeaderBtn
            icon={widget.poppedOut ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            title={widget.poppedOut ? 'Return to dashboard' : 'Pop out to window'}
            onClick={() => widget.poppedOut ? undefined : popOutWidget(widget.id)}
          />
          <HeaderBtn
            icon={<X size={11} />}
            title="Remove widget"
            onClick={() => removeWidget(widget.id)}
            danger
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {children}
      </div>
    </div>
  )
}

function HeaderBtn({
  icon, title, onClick, danger,
}: { icon: React.ReactNode; title: string; onClick(): void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'p-1 rounded transition-colors',
        danger
          ? 'text-[#6e7681] hover:text-[#f85149] hover:bg-[#f8514922]'
          : 'text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#30363d]'
      )}
    >
      {icon}
    </button>
  )
}
