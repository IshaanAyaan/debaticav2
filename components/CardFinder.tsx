'use client'

import { useState, useEffect } from 'react'
import { Search, Copy, Edit, Check, Type, Palette, Bold, Underline, X, Loader2 } from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import UnderlineExtension from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import toast from 'react-hot-toast'

interface Card {
    tag: string
    citation: string
    markdown: string
    url?: string
}

const FontSize = TextStyle.extend({
    addAttributes() {
        return {
            fontSize: {
                default: null,
                parseHTML: (element: HTMLElement) => element.style.fontSize,
                renderHTML: (attributes: { fontSize?: string }) => {
                    if (!attributes.fontSize) {
                        return {}
                    }
                    return {
                        style: `font-size: ${attributes.fontSize}`,
                    }
                },
            },
        }
    },
})

export default function CardFinder() {
    const [query, setQuery] = useState('')
    const [cards, setCards] = useState<Card[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedCard, setSelectedCard] = useState<Card | null>(null)

    // Formatting options
    const [font, setFont] = useState('calibri')
    const [highlightColor, setHighlightColor] = useState('#fdff00')
    const [isEditing, setIsEditing] = useState(false)

    const editor = useEditor({
        extensions: [
            StarterKit,
            Highlight.configure({ multicolor: true }),
            UnderlineExtension,
            TextStyle,
            Color,
            FontFamily,
            FontSize,
        ],
        content: '',
        editable: isEditing,
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[400px] p-4',
            },
        },
        immediatelyRender: false,
    })

    // Search function
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return

        setLoading(true)
        try {
            const response = await fetch(
                `https://api.debatify.app/recentsearch?q=${encodeURIComponent(query)}`
            )
            const data = await response.json()
            setCards(data || [])
            if (data && data.length > 0) {
                handleCardSelect(data[0])
            } else {
                setSelectedCard(null)
                editor?.commands.setContent('')
            }
        } catch (error) {
            console.error('Error fetching cards:', error)
            toast.error('Error fetching cards. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    // Select a card
    const handleCardSelect = (card: Card) => {
        setSelectedCard(card)
        setIsEditing(false)
    }

    // Update editor content when card changes
    useEffect(() => {
        if (selectedCard && editor) {
            const tag = cleanHTML(selectedCard.tag || '')
            const citation = cleanHTML(selectedCard.citation || '')
            const markdown = selectedCard.markdown || ''
            const processedMarkdown = processMarkdown(markdown, highlightColor)

            const content = `
        <div style="font-family: ${font}">
          <p style="font-size: 14pt; font-weight: bold; margin-bottom: 10px;">${tag}</p>
          <p style="margin-bottom: 10px; font-style: italic;">${citation}</p>
          <div style="font-size: 11pt;">
            ${processedMarkdown}
          </div>
        </div>
      `

            editor.commands.setContent(content)
            editor.chain().focus().setFontFamily(font).run()
        }
    }, [selectedCard, editor]) // Removed font/highlightColor to prevent reset

    // Update editable state
    useEffect(() => {
        editor?.setEditable(isEditing)
    }, [isEditing, editor])

    // Font change handler
    useEffect(() => {
        if (editor && isEditing) {
            editor.chain().focus().setFontFamily(font).run()
        }
    }, [font, editor, isEditing])

    // Clean HTML tags
    const cleanHTML = (html: string) => {
        return html
            .replace(/<mark[^>]*>/g, '')
            .replace(/<span[^>]*background-color[^>]*>/gi, '')
            .replace(/<\/mark>/g, '')
            .replace(/<\/span>/gi, '')
    }

    // Process markdown to apply highlighting
    const processMarkdown = (markdown: string, color: string) => {
        return markdown
            .replace(/<mark>(.*?)<\/mark>/g, `<mark style="background-color: ${color};">$1</mark>`)
    }

    // Copy to clipboard
    const handleCopy = async () => {
        if (!editor) return

        try {
            const htmlContent = editor.getHTML()
            const textContent = editor.getText()

            const blob = new Blob([htmlContent], { type: 'text/html' })
            const clipboardItemCtor = (window as typeof window & { ClipboardItem?: typeof ClipboardItem })
                .ClipboardItem

            if (navigator.clipboard && clipboardItemCtor) {
                const clipboardItem = new clipboardItemCtor({
                    'text/html': blob,
                    'text/plain': new Blob([textContent], { type: 'text/plain' }),
                })
                await navigator.clipboard.write([clipboardItem])
                toast.success('Card copied!')
            } else {
                await navigator.clipboard.writeText(textContent)
                toast.success('Card copied as plain text')
            }
        } catch (error) {
            console.error('Copy failed:', error)
            toast.error('Failed to copy card')
        }
    }

    const toggleHighlight = () => {
        editor?.chain().focus().toggleHighlight({ color: highlightColor }).run()
    }

    if (!editor) return null

    return (
        <div className="flex flex-col h-[calc(100vh-12rem)]">
            {/* Search Bar */}
            <div className="mb-6">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search for evidence (e.g., 'UBI causes inflation')..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </form>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Results List */}
                <div className="w-1/3 border border-gray-200 rounded-lg overflow-y-auto bg-white">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Searching database...</div>
                    ) : cards.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            {query ? 'No cards found.' : 'Enter a topic to search for cards.'}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {cards.map((card, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleCardSelect(card)}
                                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${selectedCard === card ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                        }`}
                                >
                                    <div
                                        className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm"
                                        dangerouslySetInnerHTML={{ __html: cleanHTML(card.tag || 'Untitled') }}
                                    />
                                    <div className="text-xs text-gray-500 line-clamp-2">
                                        {cleanHTML(card.citation || '').replace(/<[^>]*>/g, '')}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Card Display/Editor */}
                <div className="flex-1 flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden">
                    {selectedCard ? (
                        <>
                            {/* Toolbar */}
                            <div className="p-2 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-2 items-center">
                                <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                                    <select
                                        value={font}
                                        onChange={(e) => setFont(e.target.value)}
                                        className="text-sm border-gray-300 rounded-md"
                                    >
                                        <option value="calibri">Calibri</option>
                                        <option value="arial">Arial</option>
                                        <option value="times">Times New Roman</option>
                                        <option value="georgia">Georgia</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                                    <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-md p-1">
                                        <div
                                            className="w-4 h-4 rounded-full border border-gray-200 cursor-pointer"
                                            style={{ backgroundColor: highlightColor }}
                                        />
                                        <select
                                            value={highlightColor}
                                            onChange={(e) => setHighlightColor(e.target.value)}
                                            className="text-sm border-none focus:ring-0 p-0 w-20"
                                        >
                                            <option value="#fdff00">Yellow</option>
                                            <option value="#00ffff">Cyan</option>
                                            <option value="#00ff00">Green</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={toggleHighlight}
                                        className={`p-1.5 hover:bg-gray-200 rounded ${editor.isActive('highlight', { color: highlightColor }) ? 'bg-gray-200' : ''}`}
                                        title="Highlight Selected"
                                    >
                                        <Palette className="w-4 h-4" />
                                    </button>
                                </div>

                                {isEditing && (
                                    <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                                        <button
                                            onClick={() => editor.chain().focus().toggleBold().run()}
                                            className={`p-1.5 hover:bg-gray-200 rounded ${editor.isActive('bold') ? 'bg-gray-200' : ''}`}
                                            title="Bold"
                                        >
                                            <Bold className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                                            className={`p-1.5 hover:bg-gray-200 rounded ${editor.isActive('underline') ? 'bg-gray-200' : ''}`}
                                            title="Underline"
                                        >
                                            <Underline className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => editor.chain().focus().unsetAllMarks().run()}
                                            className="p-1.5 hover:bg-gray-200 rounded text-red-500"
                                            title="Clear Format"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}

                                <div className="flex-1" />

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                    >
                                        <Copy className="w-4 h-4" />
                                        Copy
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md ${isEditing
                                                ? 'bg-green-600 text-white hover:bg-green-700'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                            }`}
                                    >
                                        {isEditing ? (
                                            <>
                                                <Check className="w-4 h-4" />
                                                Done
                                            </>
                                        ) : (
                                            <>
                                                <Edit className="w-4 h-4" />
                                                Edit
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="flex-1 overflow-y-auto p-4 bg-white cursor-text" onClick={() => editor.chain().focus().run()}>
                                <EditorContent editor={editor} style={{ fontFamily: font }} />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">
                            Select a card to view
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
