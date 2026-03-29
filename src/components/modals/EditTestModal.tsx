import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { updateTest } from '@/api/metadataClient'
import type { Test } from '@/types'

interface Props {
  test: Test
  onClose(): void
  onUpdated(test: Test): void
}

export function EditTestModal({ test, onClose, onUpdated }: Props) {
  const [name, setName] = useState(test.name)
  const [description, setDescription] = useState(test.description)
  const [facility, setFacility] = useState(test.facility)
  const [operator, setOperator] = useState(test.operator)
  const [tagsInput, setTagsInput] = useState(test.tags.join(', '))
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
      const updated = await updateTest(test.id, { name, description, facility, operator, tags })
      onUpdated(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update test')
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-base font-semibold text-[#e6edf3]">Edit Test Campaign</h2>
          <button onClick={onClose} className="p-1 rounded text-[#6e7681] hover:text-[#e6edf3] hover:bg-[#1c2128] transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <Field label="Name" required>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="input-field"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="input-field resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Facility" required>
              <input
                value={facility}
                onChange={e => setFacility(e.target.value)}
                required
                className="input-field"
              />
            </Field>
            <Field label="Operator" required>
              <input
                value={operator}
                onChange={e => setOperator(e.target.value)}
                required
                className="input-field"
              />
            </Field>
          </div>

          <Field label="Tags" hint="Comma-separated">
            <input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
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
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
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
