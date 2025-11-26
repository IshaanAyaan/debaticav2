'use client'

import { useState } from 'react'
import SearchInterface from '@/components/SearchInterface'
import PreviewSection from '@/components/PreviewSection'
import CardEditor from '@/components/CardEditor'
import CardFinder from '@/components/CardFinder'
import { Sparkles, Search as SearchIcon } from 'lucide-react'

export default function Home() {
  const [activeTab, setActiveTab] = useState<'free' | 'premium'>('free')

  // Premium State
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [generatedCards, setGeneratedCards] = useState<any[]>([])
  const [activeView, setActiveView] = useState<'search' | 'preview' | 'editor'>('search')

  const handleSearch = async (query: string, numResults: number) => {
    try {
      const response = await fetch('/api/rpa-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, numResults }),
      })
      const data = await response.json()
      if (data.success) {
        setSearchResults(data.results)
        setActiveView('preview')
      }
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  const handleGenerate = async (selected: any[]) => {
    try {
      const response = await fetch('/api/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: selected }),
      })
      const data = await response.json()
      if (data.success) {
        setGeneratedCards(data.cards)
        setActiveView('editor')
      }
    } catch (error) {
      console.error('Generation failed:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">DEBATICA</h1>
              <span className="ml-3 text-sm text-gray-500">AI-Powered Debate Evidence</span>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setActiveTab('free')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'free'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <SearchIcon className="w-4 h-4" />
                  Free Card Finder
                </div>
              </button>
              <button
                onClick={() => setActiveTab('premium')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'premium'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Premium AI Generator
                </div>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'free' ? (
          <CardFinder />
        ) : (
          <div className="space-y-6">
            {/* Premium Header */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-purple-800 font-medium">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h2 className="text-xl font-bold text-purple-900">Premium AI Generator</h2>
              </div>
              <p className="text-purple-700">
                Generate custom cards from any topic using advanced AI.
              </p>
            </div>

            {activeView === 'search' && (
              <SearchInterface onSearch={handleSearch} />
            )}

            {activeView === 'preview' && (
              <PreviewSection
                previews={searchResults}
                onGenerate={handleGenerate}
                onBack={() => setActiveView('search')}
              />
            )}

            {activeView === 'editor' && (
              <CardEditor
                initialCards={generatedCards}
                onBack={() => setActiveView('preview')}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
