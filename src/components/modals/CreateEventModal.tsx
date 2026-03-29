import { useState, useCallback } from 'react'
import { X, Upload, Loader2, ChevronRight, ChevronLeft, FileSpreadsheet } from 'lucide-react'
import { createEventWithData } from '@/api/metadataClient'
import type { ChannelCreateInput, ChannelMeta, TestEvent } from '@/types'

interface Props {
  testId: string
  onClose(): void
  onCreated(event: TestEvent): void
}

const SENSOR_TYPES: ChannelMeta['sensorType'][] = [
  'voltage', 'current', 'pressure', 'strain', 'temperature', 'acceleration',
]

const COMMON_UNITS = ['V', 'mV', 'kN', 'N', 'MPa', 'Pa', '\u00b5\u03b5', 'mm', 'g', '\u00b0C', 'm/s', 'A', 'mA']

interface ChannelRow extends ChannelCreateInput {
  _fromCsv: boolean
}

export function CreateEventModal({ testId, onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2>(1)

  // Step 1: event metadata
  const [eventName, setEventName] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [triggerCondition, setTriggerCondition] = useState('')

  // Step 2: CSV + channels
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvInfo, setCsvInfo] = useState<{ nSamples: number; sampleRate: string } | null>(null)
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)
    setError(null)

    // Parse header to auto-detect channels
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) {
        setError('CSV must have a header row and at least one data row')
        return
      }

      const header = lines[0].split(',').map(h => h.trim())
      if (header[0]?.toLowerCase() !== 'time') {
        setError("First column must be 'time'")
        return
      }

      const channelIds = header.slice(1)
      if (channelIds.length === 0) {
        setError('CSV must have at least one channel column after time')
        return
      }

      // Estimate sample rate from first two data rows
      const row1 = lines[1].split(',')
      const row2 = lines.length > 2 ? lines[2].split(',') : null
      let srDisplay = 'unknown'
      if (row2) {
        const dt = parseFloat(row2[0]) - parseFloat(row1[0])
        if (dt > 0) {
          const sr = Math.round(1 / dt)
          srDisplay = sr >= 1_000_000 ? `${(sr / 1_000_000).toFixed(1)} MHz`
            : sr >= 1_000 ? `${(sr / 1_000).toFixed(0)} kHz`
            : `${sr} Hz`
        }
      }

      setCsvInfo({ nSamples: lines.length - 1, sampleRate: srDisplay })

      setChannels(channelIds.map(id => ({
        id,
        name: id,
        unit: 'V',
        sensor_type: 'voltage' as const,
        range_min: -1,
        range_max: 1,
        _fromCsv: true,
      })))
    }
    reader.readAsText(file)
  }, [])

  function updateChannel(idx: number, patch: Partial<ChannelRow>) {
    setChannels(prev => prev.map((ch, i) => i === idx ? { ...ch, ...patch } : ch))
  }

  async function handleSubmit() {
    if (!csvFile || channels.length === 0) return
    setError(null)
    setSubmitting(true)

    try {
      const event = await createEventWithData(
        testId,
        {
          event: {
            name: eventName,
            description: eventDescription || undefined,
            trigger_condition: triggerCondition || undefined,
          },
          channels: channels.map(({ _fromCsv, ...ch }) => ch),
        },
        csvFile,
      )
      onCreated(event)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1117cc]" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] shrink-0">
          <h2 className="text-base font-semibold text-[#e6edf3]">
            Create Event {step === 1 ? '— Metadata' : '— Upload Data'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-[#6e7681]">
              <span className={step === 1 ? 'text-[#58a6ff] font-medium' : ''}>1. Info</span>
              <ChevronRight size={12} />
              <span className={step === 2 ? 'text-[#58a6ff] font-medium' : ''}>2. Data</span>
            </div>
            <button onClick={onClose} className="p-1 rounded text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <Field label="Event Name" required>
                <input
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  required
                  placeholder="e.g. Pre-crack baseline"
                  className="input-field"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={eventDescription}
                  onChange={e => setEventDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional description..."
                  className="input-field resize-none"
                />
              </Field>

              <Field label="Trigger Condition">
                <input
                  value={triggerCondition}
                  onChange={e => setTriggerCondition(e.target.value)}
                  placeholder="e.g. threshold > 2.5 V"
                  className="input-field"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* File upload */}
              <Field label="CSV Waveform File" required hint="time column + channel columns">
                <label className="flex items-center justify-center gap-2 w-full p-6 border-2 border-dashed border-[#30363d] rounded-lg cursor-pointer hover:border-[#58a6ff44] transition-colors">
                  {csvFile ? (
                    <div className="text-center">
                      <FileSpreadsheet size={20} className="mx-auto mb-1 text-[#58a6ff]" />
                      <p className="text-sm text-[#e6edf3]">{csvFile.name}</p>
                      {csvInfo && (
                        <p className="text-xs text-[#6e7681] mt-1">
                          {csvInfo.nSamples.toLocaleString()} samples &middot; {channels.length} channels &middot; ~{csvInfo.sampleRate}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload size={20} className="mx-auto mb-1 text-[#6e7681]" />
                      <p className="text-sm text-[#8b949e]">Click to select CSV file</p>
                      <p className="text-xs text-[#6e7681] mt-0.5">Format: time, CH1, CH2, ...</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </Field>

              {/* Channel metadata table */}
              {channels.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[#8b949e] mb-2">Channel Configuration</p>
                  <div className="border border-[#30363d] rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[60px_1fr_80px_100px_70px_70px] gap-px bg-[#30363d] text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider">
                      <div className="bg-[#161b22] px-2 py-1.5">ID</div>
                      <div className="bg-[#161b22] px-2 py-1.5">Name</div>
                      <div className="bg-[#161b22] px-2 py-1.5">Unit</div>
                      <div className="bg-[#161b22] px-2 py-1.5">Sensor</div>
                      <div className="bg-[#161b22] px-2 py-1.5">Min</div>
                      <div className="bg-[#161b22] px-2 py-1.5">Max</div>
                    </div>
                    {channels.map((ch, idx) => (
                      <div key={ch.id} className="grid grid-cols-[60px_1fr_80px_100px_70px_70px] gap-px bg-[#30363d]">
                        <div className="bg-[#0d1117] px-2 py-1 flex items-center">
                          <span className="text-xs font-mono text-[#6e7681]">{ch.id}</span>
                        </div>
                        <div className="bg-[#0d1117] px-1 py-0.5">
                          <input value={ch.name} onChange={e => updateChannel(idx, { name: e.target.value })} className="ch-input" />
                        </div>
                        <div className="bg-[#0d1117] px-1 py-0.5">
                          <select value={ch.unit} onChange={e => updateChannel(idx, { unit: e.target.value })} className="ch-input">
                            {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="bg-[#0d1117] px-1 py-0.5">
                          <select value={ch.sensor_type} onChange={e => updateChannel(idx, { sensor_type: e.target.value as ChannelMeta['sensorType'] })} className="ch-input">
                            {SENSOR_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="bg-[#0d1117] px-1 py-0.5">
                          <input type="number" value={ch.range_min} onChange={e => updateChannel(idx, { range_min: parseFloat(e.target.value) || 0 })} className="ch-input" />
                        </div>
                        <div className="bg-[#0d1117] px-1 py-0.5">
                          <input type="number" value={ch.range_max} onChange={e => updateChannel(idx, { range_max: parseFloat(e.target.value) || 0 })} className="ch-input" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 text-sm text-[#f85149] bg-[#f8514922] border border-[#f8514944] rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-5 py-4 border-t border-[#30363d] shrink-0">
          <div>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-[#8b949e] border border-[#30363d] hover:border-[#8b949e] transition-colors"
            >
              Cancel
            </button>
            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                disabled={!eventName}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#58a6ff] text-[#0d1117] hover:bg-[#79c0ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            )}
            {step === 2 && (
              <button
                onClick={handleSubmit}
                disabled={submitting || !csvFile || channels.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#3fb950] text-[#0d1117] hover:bg-[#56d364] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload &amp; Create
              </button>
            )}
          </div>
        </div>

        <style>{`
          .input-field {
            width: 100%;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 0.5rem;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            color: #e6edf3;
            outline: none;
            transition: border-color 0.15s;
          }
          .input-field::placeholder { color: #6e7681; }
          .input-field:focus { border-color: #58a6ff; }
          .ch-input {
            width: 100%;
            background: transparent;
            border: none;
            font-size: 0.75rem;
            color: #e6edf3;
            padding: 0.25rem 0.125rem;
            outline: none;
          }
          .ch-input:focus { background: #161b22; }
        `}</style>
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[#8b949e] mb-1 block">
        {label}
        {required && <span className="text-[#f85149] ml-0.5">*</span>}
        {hint && <span className="text-[#6e7681] ml-1.5 font-normal">({hint})</span>}
      </span>
      {children}
    </label>
  )
}
