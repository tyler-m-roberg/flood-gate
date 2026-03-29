import { useState } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import { createTest } from '@/api/metadataClient'
import type { Test } from '@/types'

interface Props {
  onClose(): void
  onCreated(test: Test): void
}

export function CreateTestModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [facility, setFacility] = useState('')
  const [operator, setOperator] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    try {
      const test = await createTest({ name, description, facility, operator, tags })
      onCreated(test)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create test')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1117cc]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-base font-semibold text-[#e6edf3]">Create Test Campaign</h2>
          <button onClick={onClose} className="p-1 rounded text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <Field label="Name" required>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. Structural Fatigue Campaign B"
              className="input-field"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the test campaign..."
              className="input-field resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Facility" required>
              <input
                value={facility}
                onChange={e => setFacility(e.target.value)}
                required
                placeholder="e.g. Lab Bay 2"
                className="input-field"
              />
            </Field>
            <Field label="Operator" required>
              <input
                value={operator}
                onChange={e => setOperator(e.target.value)}
                required
                placeholder="e.g. J. Smith"
                className="input-field"
              />
            </Field>
          </div>

          <Field label="Tags" hint="Comma-separated">
            <input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="e.g. fatigue, aluminum, axial"
              className="input-field"
            />
          </Field>

          {error && (
            <div className="text-sm text-[#f85149] bg-[#f8514922] border border-[#f8514944] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-[#8b949e] border border-[#30363d] hover:border-[#8b949e] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name || !facility || !operator}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#58a6ff] text-[#0d1117] hover:bg-[#79c0ff] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Test
            </button>
          </div>
        </form>
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
      `}</style>
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
