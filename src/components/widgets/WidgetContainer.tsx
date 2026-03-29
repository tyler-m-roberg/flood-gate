import { useRef, useState } from 'react'
import {
  GripVertical, Maximize2, Minimize2, X, Settings,
  Activity, BarChart3, Edit3, Lock, Unlock, Waves,
} from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { WidgetConfig } from '@/types'
import { cn } from '@/lib/utils'

const WIDGET_ICON: Record<string, React.ReactNode> = {
  waveform:    <Activity size={12} className="text-[#58a6ff]" />,
  stats:       <BarChart3 size={12} className="text-[#3fb950]" />,
  fft:         <Waves size={12} className="text-[#d29922]" />,
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
  const selectedWidgetId = useWorkspaceStore(s => s.selectedWidgetId)
  const setSelectedWidget = useWorkspaceStore(s => s.setSelectedWidget)

  const isSelected = selectedWidgetId === widget.id
  const isLocked = widget.locked ?? false

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(widget.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  function handleTitleSubmit() {
    if (titleDraft.trim()) updateWidget(widget.id, { title: titleDraft.trim() })
    setIsEditingTitle(false)
  }

  function handleSelect(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedWidget(isSelected ? null : widget.id)
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-[#161b22] border rounded-lg overflow-hidden group/widget',
        isSelected ? 'border-[#58a6ff]' : 'border-[#30363d]'
      )}
      onClick={handleSelect}
    >
      {/* Header / drag handle */}
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 border-b border-[#30363d] bg-[#1c2128] shrink-0 select-none',
          isLocked ? 'cursor-default' : 'widget-drag-handle cursor-grab active:cursor-grabbing'
        )}
        onMouseDown={isLocked ? undefined : onDragStart}
      >
        <GripVertical size={13} className={cn(
          'shrink-0 transition-colors',
          isLocked ? 'text-[#21262d]' : 'text-[#30363d] group-hover/widget:text-[#6e7681]'
        )} />
        {WIDGET_ICON[widget.type]}

        {isEditingTitle && !isLocked ? (
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
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 text-xs font-medium text-[#8b949e] truncate min-w-0 cursor-text"
            onDoubleClick={() => { if (!isLocked) { setIsEditingTitle(true); setTitleDraft(widget.title) } }}
          >
            {widget.title}
          </span>
        )}

        {/* Action buttons — always visible for key actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!isLocked && (
            <>
              <HeaderBtn
                icon={<Edit3 size={11} />}
                title="Rename"
                onClick={() => { setIsEditingTitle(true); setTitleDraft(widget.title) }}
                className="opacity-0 group-hover/widget:opacity-100"
              />
              <HeaderBtn
                icon={<Settings size={11} />}
                title="Widget settings"
                onClick={() => {}}
                className="opacity-0 group-hover/widget:opacity-100"
              />
            </>
          )}
          <HeaderBtn
            icon={isLocked ? <Lock size={11} /> : <Unlock size={11} />}
            title={isLocked ? 'Unlock widget' : 'Lock widget'}
            onClick={() => updateWidget(widget.id, { locked: !isLocked })}
          />
          {!isLocked && (
            <HeaderBtn
              icon={widget.poppedOut ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              title={widget.poppedOut ? 'Return to dashboard' : 'Pop out to window'}
              onClick={() => widget.poppedOut ? undefined : popOutWidget(widget.id)}
              className="opacity-0 group-hover/widget:opacity-100"
            />
          )}
          {!isLocked && (
            <HeaderBtn
              icon={<X size={11} />}
              title="Remove widget"
              onClick={() => removeWidget(widget.id)}
              danger
            />
          )}
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
  icon, title, onClick, danger, className,
}: { icon: React.ReactNode; title: string; onClick(): void; danger?: boolean; className?: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={title}
      className={cn(
        'p-1 rounded transition-colors',
        danger
          ? 'text-[#6e7681] hover:text-[#f85149] hover:bg-[#f8514922]'
          : 'text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#30363d]',
        className
      )}
    >
      {icon}
    </button>
  )
}
