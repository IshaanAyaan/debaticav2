'use client'

import { useState, useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import {
  Bold,
  Underline as UnderlineIcon,
  Highlighter,
  Type,
  Palette,
  Copy,
  Check,
  RotateCcw,
  Edit,
  ArrowLeft,
  Minus,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Card {
  id?: string
  tag: string
  citation: string
  content: string
  highlights?: any
  font?: string
  tagSize?: string
  highlightColor?: string
  user_id?: string
}

interface CardEditorProps {
  initialCards: Card[]
  onBack: () => void
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

export default function CardEditor({ initialCards, onBack }: CardEditorProps) {
  const [cards] = useState<Card[]>(initialCards)
  const [selectedCard, setSelectedCard] = useState<Card | null>(cards[0] || null)
  const [isEditing, setIsEditing] = useState(false)

  // Editor State
  const [font, setFont] = useState('calibri')
  const [highlightColor, setHighlightColor] = useState('#fdff00')
  const [fontSize, setFontSize] = useState('11pt')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
    ],
    content: '',
    editable: isEditing,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[500px] p-4',
      },
    },
    immediatelyRender: false,
  })

  // Sync editor content when card changes
  useEffect(() => {
    if (!cards.length) {
      setSelectedCard(null)
      editor?.commands.setContent('')
      return
    }

    setSelectedCard((prev) => {
      if (!prev) return cards[0]
      const stillExists = cards.find((card) => card.id === prev.id || card.tag === prev.tag)
      return stillExists || cards[0]
    })
  }, [cards, editor])

  useEffect(() => {
    if (selectedCard && editor) {
      const safeContent = selectedCard.content || ''
      const isFullCard = safeContent.includes('<div') && safeContent.includes(selectedCard.tag)

      let contentToLoad = safeContent

      if (!isFullCard) {
        contentToLoad = `
          <div style="font-family: ${font}">
            <p style="font-size: 14pt; font-weight: bold; margin-bottom: 10px;">${selectedCard.tag}</p>
            <p style="margin-bottom: 10px; font-style: italic;">${selectedCard.citation}</p>
            <div style="font-size: 11pt;">
              ${safeContent.replace(/\n/g, '<br>')}
            </div>
          </div>
        `
      }

      editor.commands.setContent(contentToLoad)
      editor.chain().focus().setFontFamily(font).run()
    }
  }, [selectedCard, editor]) // Removed font from dependency to avoid resetting on font change

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
        toast.success('Card copied with formatting!')
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

  const setFontSizeCommand = (size: string) => {
    // @ts-ignore
    editor?.chain().focus().setMark('textStyle', { fontSize: size }).run()
  }

  const fonts = [
    'calibri', 'arial', 'times', 'georgia', 'verdana', 'helvetica',
    'courier', 'trebuchet', 'impact', 'palatino', 'garamond', 'bookman', 'tahoma', 'lucida'
  ]

  if (!editor) {
    return null
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-200px)]">
      {/* Sidebar */}
      <div className="w-full lg:w-1/4 bg-white rounded-lg shadow-md p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={onBack}
            className="p-1 hover:bg-gray-100 rounded-full"
            title="Back to Preview"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h3 className="font-bold text-lg">Generated Cards</h3>
        </div>
        <div className="space-y-2 overflow-y-auto flex-1">
          {cards.map((card, index) => (
            <div
              key={card.id ?? index}
              onClick={() => setSelectedCard(card)}
              className={`p-3 rounded cursor-pointer transition-colors ${selectedCard?.tag === card.tag
                ? 'bg-blue-100 border-blue-500 border'
                : 'bg-gray-50 hover:bg-gray-100'
                }`}
            >
              <div className="font-semibold text-sm truncate">{card.tag}</div>
              <div className="text-xs text-gray-600 truncate mt-1">
                {card.citation.replace(/<[^>]*>/g, '')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 bg-white rounded-lg shadow-md flex flex-col overflow-hidden">
        {/* Top Toolbar */}
        <div className="border-b p-4 flex items-center gap-4 flex-wrap bg-gray-50">
          <select
            value={font}
            onChange={(e) => setFont(e.target.value)}
            className="px-3 py-1 border rounded bg-white"
          >
            {fonts.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 border-l pl-4 border-gray-300">
            <Palette className="w-4 h-4 text-gray-600" />
            <input
              type="color"
              value={highlightColor}
              onChange={(e) => setHighlightColor(e.target.value)}
              className="w-8 h-8 border rounded cursor-pointer p-0 overflow-hidden"
            />
            <div className="flex gap-1">
              {['#fdff00', '#00ffff', '#00ff00'].map(c => (
                <button
                  key={c}
                  onClick={() => setHighlightColor(c)}
                  className="w-6 h-6 rounded border border-gray-200"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleCopy}
              className="px-3 py-1 bg-blue-600 text-white rounded flex items-center gap-2 hover:bg-blue-700 text-sm"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1 rounded flex items-center gap-2 text-sm transition-colors ${isEditing
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
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

        {/* Editing Toolbar (Visible only when editing) */}
        {isEditing && (
          <div className="border-b p-2 flex items-center gap-2 flex-wrap bg-gray-100">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-2 rounded hover:bg-gray-200 ${editor.isActive('bold') ? 'bg-gray-300' : ''}`}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={`p-2 rounded hover:bg-gray-200 ${editor.isActive('underline') ? 'bg-gray-300' : ''}`}
              title="Underline"
            >
              <UnderlineIcon className="w-4 h-4" />
            </button>

            <div className="h-6 w-px bg-gray-300 mx-1" />

            <button
              onClick={toggleHighlight}
              className={`p-2 rounded hover:bg-gray-200 ${editor.isActive('highlight', { color: highlightColor }) ? 'bg-gray-300' : ''}`}
              title="Highlight"
            >
              <Highlighter className="w-4 h-4" style={{ color: highlightColor }} />
            </button>

            <div className="h-6 w-px bg-gray-300 mx-1" />

            <div className="flex items-center gap-1">
              <Type className="w-4 h-4 text-gray-600" />
              <button
                onClick={() => setFontSizeCommand('8pt')}
                className="p-1 hover:bg-gray-200 rounded text-xs"
                title="Shrink Text"
              >
                <Minus className="w-3 h-3" />
              </button>
              <select
                value={fontSize}
                onChange={(e) => {
                  setFontSize(e.target.value)
                  setFontSizeCommand(e.target.value)
                }}
                className="w-16 px-1 py-1 border rounded text-sm"
              >
                {['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '18pt', '24pt'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                onClick={() => setFontSizeCommand('14pt')}
                className="p-1 hover:bg-gray-200 rounded text-xs"
                title="Enlarge Text"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            <div className="ml-auto">
              <button
                onClick={() => editor.chain().focus().unsetAllMarks().run()}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
                title="Clear Formatting"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white cursor-text" onClick={() => editor.chain().focus().run()}>
          {selectedCard ? (
            <EditorContent editor={editor} style={{ fontFamily: font }} />
          ) : (
            <div className="text-center text-gray-500 py-12">Select a card to edit</div>
          )}
        </div>
      </div>
    </div>
  )
}
