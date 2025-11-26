'use client'

import { useState } from 'react'
import { Check, ExternalLink, Calendar, User, Loader2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'

interface Preview {
  url: string
  title: string
  author?: string
  date?: string
  summary?: string
  snippet?: string
  content?: string
}

interface PreviewSectionProps {
  previews: Preview[]
  onGenerate: (selected: Preview[]) => Promise<void>
  onBack: () => void
}

export default function PreviewSection({
  previews,
  onGenerate,
  onBack,
}: PreviewSectionProps) {
  const [selectedPreviews, setSelectedPreviews] = useState<Preview[]>([])
  const [generating, setGenerating] = useState(false)

  const toggleSelection = (preview: Preview) => {
    const isSelected = selectedPreviews.some((p) => p.url === preview.url)
    if (isSelected) {
      setSelectedPreviews(selectedPreviews.filter((p) => p.url !== preview.url))
    } else {
      setSelectedPreviews([...selectedPreviews, preview])
    }
  }

  const handleGenerateCards = async () => {
    if (selectedPreviews.length === 0) {
      toast.error('Please select at least one article')
      return
    }

    setGenerating(true)
    const toastId = toast.loading(`Generating ${selectedPreviews.length} debate cards...`)

    try {
      await onGenerate(selectedPreviews)
      toast.success(`Generated ${selectedPreviews.length} cards!`, { id: toastId })
    } catch (error) {
      console.error('Generation error:', error)
      toast.error('Failed to generate cards', { id: toastId })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Back to Search"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold">Article Previews</h2>
            <p className="text-gray-600 mt-1">
              Select articles to generate debate cards from ({selectedPreviews.length} selected)
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerateCards}
          disabled={selectedPreviews.length === 0 || generating}
          className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
              Generating Cards...
            </>
          ) : (
            `Generate ${selectedPreviews.length} Card${selectedPreviews.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {previews.map((preview) => {
          const isSelected = selectedPreviews.some((p) => p.url === preview.url)

          return (
            <div
              key={preview.url}
              onClick={() => toggleSelection(preview)}
              className={`bg-white rounded-lg shadow-md p-5 cursor-pointer transition-all hover:shadow-lg ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                }`}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-lg line-clamp-2 flex-1">{preview.title}</h3>
                <div
                  className={`ml-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}
                >
                  {isSelected && <Check className="w-4 h-4 text-white" />}
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600 mb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span className="truncate">{preview.author || 'Unknown Author'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>{preview.date || 'Unknown Date'}</span>
                </div>
              </div>

              <div className="mb-3">
                <h4 className="font-medium text-sm text-gray-700 mb-1">Summary:</h4>
                <p className="text-sm text-gray-600 line-clamp-4">{preview.summary || preview.snippet || 'No summary available'}</p>
              </div>

              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                View Source
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
