'use client'

import { useState } from 'react'
import { Search, Loader2, Settings } from 'lucide-react'
import toast from 'react-hot-toast'

interface SearchInterfaceProps {
  onSearch: (query: string, numResults: number) => Promise<void>
}

export default function SearchInterface({ onSearch }: SearchInterfaceProps) {
  const [query, setQuery] = useState('')
  const [numResults, setNumResults] = useState(5)
  const [loading, setLoading] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) {
      toast.error('Please enter a search query')
      return
    }

    setLoading(true)
    const toastId = toast.loading('Searching and extracting articles...')

    try {
      await onSearch(query, numResults)
      toast.success('Search completed!', { id: toastId })
    } catch (error) {
      console.error('Search error:', error)
      toast.error('Failed to search. Please try again.', { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-2">Search for Evidence</h2>
        <p className="text-gray-600 mb-6">
          Enter your topic or argument to find relevant articles and generate debate cards
        </p>

        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Query
            </label>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., climate change causes economic recession"
                className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              />
              <Search className="absolute right-4 top-3.5 w-5 h-5 text-gray-400" />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Articles
              </label>
              <select
                value={numResults}
                onChange={(e) => setNumResults(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              >
                <option value={3}>3 articles</option>
                <option value={5}>5 articles</option>
                <option value={7}>7 articles</option>
                <option value={10}>10 articles</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start gap-2">
            <Settings className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 mb-1">How it works:</p>
              <ol className="text-blue-700 space-y-1">
                <li>1. Searches Google for relevant articles</li>
                <li>2. Extracts full article content</li>
                <li>3. Generates summaries with key evidence</li>
                <li>4. Allows you to select and generate NSDA-format cards</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
