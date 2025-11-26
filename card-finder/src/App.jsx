import React, { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedCard, setSelectedCard] = useState(null)
  const [cardContent, setCardContent] = useState('')
  
  // Formatting options
  const [font, setFont] = useState('calibri')
  const [tagSize, setTagSize] = useState('11pt')
  const [highlightColor, setHighlightColor] = useState('#fdff00')
  
  // Editable content state
  const [isEditing, setIsEditing] = useState(false)
  const [fontSize, setFontSize] = useState('11')
  const [selectionRange, setSelectionRange] = useState(null)
  
  // Custom preset state
  const [showPresetModal, setShowPresetModal] = useState(false)
  const [presetConfig, setPresetConfig] = useState({
    highlightColor: '#fdff00',
    bold: false,
    fontSize: '11'
  })

  // Search function
  const handleSearch = async (e) => {
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
        // Auto-select first card
        handleCardSelect(data[0])
      }
    } catch (error) {
      console.error('Error fetching cards:', error)
      alert('Error fetching cards. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Select a card
  const handleCardSelect = (card) => {
    setSelectedCard(card)
    // Format the card content
    const tag = cleanHTML(card.tag || '')
    const citation = cleanHTML(card.citation || '')
    const markdown = card.markdown || ''
    
    // Process markdown to apply highlighting
    const processedMarkdown = processMarkdown(markdown, highlightColor)
    
    setCardContent(`<b>${tag}</b><br />${citation}<br />${processedMarkdown}<br />`)
    setIsEditing(false)
  }

  // Re-process content when highlight color changes
  useEffect(() => {
    if (selectedCard && !isEditing) {
      const tag = cleanHTML(selectedCard.tag || '')
      const citation = cleanHTML(selectedCard.citation || '')
      const markdown = selectedCard.markdown || ''
      const processedMarkdown = processMarkdown(markdown, highlightColor)
      setCardContent(`<b>${tag}</b><br />${citation}<br />${processedMarkdown}<br />`)
    }
  }, [highlightColor, selectedCard, isEditing])

  // Clean HTML tags
  const cleanHTML = (html) => {
    return html
      .replace(/<mark[^>]*>/g, '')
      .replace(/<span[^>]*background-color[^>]*>/gi, '')
      .replace(/<\/mark>/g, '')
      .replace(/<\/span>/gi, '')
  }

  // Process markdown to apply highlighting
  const processMarkdown = (markdown, color = highlightColor) => {
    return markdown
      .replace(/<mark>(.*?)<\/mark>/g, `<span style="background-color: ${color}; padding: 2px; text-decoration: underline;">$1</span>`)
  }

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      const blob = new Blob([cardContent], { type: 'text/html' })
      const clipboardItem = new ClipboardItem({ 'text/html': blob })
      await navigator.clipboard.write([clipboardItem])
      alert('Card copied to clipboard!')
    } catch (error) {
      // Fallback for browsers that don't support ClipboardItem
      const textArea = document.createElement('textarea')
      textArea.value = cardContent.replace(/<[^>]*>/g, '')
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('Card copied to clipboard!')
    }
  }

  // Save selection range
  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      setSelectionRange(selection.getRangeAt(0).cloneRange())
    }
  }

  // Restore selection range
  const restoreSelection = () => {
    if (selectionRange) {
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(selectionRange.cloneRange())
    }
  }

  // Formatting functions for editable content (keeps selection)
  const formatText = (command, value = null) => {
    const editableDiv = document.getElementById('editable-card-content')
    if (!editableDiv) return

    // Save current selection
    saveSelection()
    
    // Apply formatting
    document.execCommand(command, false, value)
    
    // Update content state
    setCardContent(editableDiv.innerHTML)
    
    // Restore selection after a brief delay
    setTimeout(() => {
      restoreSelection()
    }, 10)
  }

  // Highlight all currently highlighted text
  const highlightAll = () => {
    const editableDiv = document.getElementById('editable-card-content')
    if (!editableDiv) return

    // Find all elements with background color
    const highlightedElements = editableDiv.querySelectorAll('[style*="background-color"]')
    
    highlightedElements.forEach(el => {
      const style = el.getAttribute('style') || ''
      // Replace any background-color with the new one
      const newStyle = style.replace(/background-color:\s*[^;]+/gi, `background-color: ${highlightColor}`)
      el.setAttribute('style', newStyle || `background-color: ${highlightColor}`)
    })

    setCardContent(editableDiv.innerHTML)
  }

  // Highlight only selected text
  const highlightSelected = () => {
    formatText('backColor', highlightColor)
  }

  // Apply custom preset to selected text
  const applyCustomPreset = () => {
    const editableDiv = document.getElementById('editable-card-content')
    if (!editableDiv) return

    saveSelection()
    
    // Apply all preset options
    if (presetConfig.bold) {
      document.execCommand('bold', false, null)
    }
    document.execCommand('backColor', false, presetConfig.highlightColor)
    document.execCommand('fontSize', false, '7') // This is a hack, we'll set it properly
    // Set font size using style
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const span = document.createElement('span')
      span.style.fontSize = presetConfig.fontSize + 'pt'
      try {
        range.surroundContents(span)
      } catch (e) {
        // If surroundContents fails, try a different approach
        const contents = range.extractContents()
        span.appendChild(contents)
        range.insertNode(span)
      }
    }

    setCardContent(editableDiv.innerHTML)
    setShowPresetModal(false)
    
    setTimeout(() => {
      restoreSelection()
    }, 10)
  }

  // Sync editable content when entering edit mode
  useEffect(() => {
    if (isEditing) {
      const editableDiv = document.getElementById('editable-card-content')
      if (editableDiv && cardContent) {
        // Only update if content is different to avoid cursor jumping
        if (editableDiv.innerHTML !== cardContent) {
          editableDiv.innerHTML = cardContent
        }
      }
    }
  }, [isEditing])

  // Update card content when exiting edit mode
  const handleDoneEditing = () => {
    const editableDiv = document.getElementById('editable-card-content')
    if (editableDiv) {
      setCardContent(editableDiv.innerHTML)
    }
    setIsEditing(false)
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="title">Card Finder</h1>
        
        {/* Search Form */}
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-group">
            <input
              type="text"
              placeholder="Search for cards..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-button" disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Formatting Controls */}
        {selectedCard && (
          <div className="formatting-controls">
            <select
              value={font}
              onChange={(e) => setFont(e.target.value)}
              className="control-select"
            >
              <option value="calibri">Calibri</option>
              <option value="arial">Arial</option>
              <option value="times">Times New Roman</option>
              <option value="comic">Comic Sans</option>
              <option value="georgia">Georgia</option>
              <option value="verdana">Verdana</option>
              <option value="helvetica">Helvetica</option>
              <option value="courier">Courier New</option>
              <option value="trebuchet">Trebuchet MS</option>
              <option value="impact">Impact</option>
              <option value="palatino">Palatino</option>
              <option value="garamond">Garamond</option>
              <option value="bookman">Bookman</option>
              <option value="tahoma">Tahoma</option>
              <option value="lucida">Lucida Console</option>
              <option value="century">Century Gothic</option>
              <option value="futura">Futura</option>
              <option value="roboto">Roboto</option>
              <option value="open-sans">Open Sans</option>
              <option value="lato">Lato</option>
              <option value="montserrat">Montserrat</option>
              <option value="raleway">Raleway</option>
              <option value="ubuntu">Ubuntu</option>
              <option value="playfair">Playfair Display</option>
              <option value="merriweather">Merriweather</option>
              <option value="oswald">Oswald</option>
              <option value="source-sans">Source Sans Pro</option>
              <option value="pt-sans">PT Sans</option>
              <option value="droid-sans">Droid Sans</option>
            </select>

            <select
              value={tagSize}
              onChange={(e) => setTagSize(e.target.value)}
              className="control-select"
            >
              <option value="11pt">Tag Size: 11 pt</option>
              <option value="12pt">Tag Size: 12 pt</option>
              <option value="13pt">Tag Size: 13 pt</option>
              <option value="14pt">Tag Size: 14 pt</option>
              <option value="15pt">Tag Size: 15 pt</option>
              <option value="16pt">Tag Size: 16 pt</option>
              <option value="17pt">Tag Size: 17 pt</option>
              <option value="18pt">Tag Size: 18 pt</option>
            </select>

            <select
              value={highlightColor}
              onChange={(e) => setHighlightColor(e.target.value)}
              className="control-select"
            >
              <option value="#fdff00">Yellow</option>
              <option value="#00ffff">Cyan</option>
              <option value="#00ff00">Green</option>
            </select>

            <button onClick={handleCopy} className="copy-button">
              Copy
            </button>

            <button
              onClick={() => isEditing ? handleDoneEditing() : setIsEditing(true)}
              className={`edit-button ${isEditing ? 'active' : ''}`}
            >
              {isEditing ? 'Done Editing' : 'Edit Card'}
            </button>
          </div>
        )}

        {/* Cards List and Display */}
        <div className="content-wrapper">
          {/* Cards List */}
          <div className="cards-list">
            {loading && <p className="loading">Loading...</p>}
            {!loading && cards.length === 0 && (
              <p className="empty-state">No cards found. Try searching!</p>
            )}
            {cards.map((card, index) => (
              <button
                key={index}
                onClick={() => handleCardSelect(card)}
                className={`card-item ${selectedCard === card ? 'selected' : ''}`}
              >
                <div className="card-tag" dangerouslySetInnerHTML={{ __html: cleanHTML(card.tag || '') }} />
                <div className="card-citation">
                  {cleanHTML(card.citation || '').replace(/<[^>]*>/g, '').slice(0, 100)}...
                </div>
              </button>
            ))}
          </div>

          {/* Card Display */}
          {selectedCard && (
            <div className="card-display">
              {isEditing ? (
                <div className="editable-container">
                  <div className="editing-toolbar sticky-toolbar">
                    <div className="toolbar-group">
                      <button
                        onClick={() => formatText('bold')}
                        className="toolbar-button"
                        title="Bold"
                      >
                        <strong>B</strong>
                      </button>
                      <button
                        onClick={() => formatText('underline')}
                        className="toolbar-button"
                        title="Underline"
                      >
                        <u>U</u>
                      </button>
                      <button
                        onClick={() => formatText('removeFormat')}
                        className="toolbar-button"
                        title="Remove Formatting"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="toolbar-group">
                      <button
                        onClick={highlightSelected}
                        className="toolbar-button highlight-button"
                        style={{ backgroundColor: highlightColor }}
                        title="Highlight Selected Text"
                      >
                        Highlight Selected
                      </button>
                      <button
                        onClick={highlightAll}
                        className="toolbar-button highlight-all-button"
                        style={{ backgroundColor: highlightColor }}
                        title="Change All Highlights"
                      >
                        Highlight All
                      </button>
                      <input
                        type="color"
                        value={highlightColor}
                        onChange={(e) => setHighlightColor(e.target.value)}
                        className="color-picker"
                        title="Choose highlight color"
                      />
                    </div>

                    <div className="toolbar-group">
                      <label className="font-size-label">
                        Font Size:
                        <input
                          type="number"
                          min="8"
                          max="72"
                          value={fontSize}
                          onChange={(e) => {
                            const size = e.target.value
                            setFontSize(size)
                            
                            // Apply font size to selected text
                            const editableDiv = document.getElementById('editable-card-content')
                            if (editableDiv) {
                              saveSelection()
                              const selection = window.getSelection()
                              if (selection.rangeCount > 0 && !selection.isCollapsed) {
                                const range = selection.getRangeAt(0)
                                const span = document.createElement('span')
                                span.style.fontSize = size + 'pt'
                                try {
                                  const contents = range.extractContents()
                                  span.appendChild(contents)
                                  range.insertNode(span)
                                  setCardContent(editableDiv.innerHTML)
                                  setTimeout(() => restoreSelection(), 10)
                                } catch (e) {
                                  // Fallback: wrap in span
                                  try {
                                    range.surroundContents(span)
                                    setCardContent(editableDiv.innerHTML)
                                    setTimeout(() => restoreSelection(), 10)
                                  } catch (e2) {
                                    // If that fails, just update the state
                                    setCardContent(editableDiv.innerHTML)
                                  }
                                }
                              }
                            }
                          }}
                          className="font-size-input"
                          title="Font Size (pt) - Select text first to apply"
                        />
                      </label>
                    </div>

                    <div className="toolbar-group">
                      <button
                        onClick={() => setShowPresetModal(true)}
                        className="toolbar-button preset-button"
                        title="Custom Preset"
                      >
                        Custom Preset
                      </button>
                    </div>
                  </div>

                  {/* Custom Preset Modal */}
                  {showPresetModal && (
                    <div className="modal-overlay" onClick={() => setShowPresetModal(false)}>
                      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Custom Preset</h3>
                        <div className="preset-form">
                          <label>
                            Highlight Color:
                            <input
                              type="color"
                              value={presetConfig.highlightColor}
                              onChange={(e) => setPresetConfig({...presetConfig, highlightColor: e.target.value})}
                            />
                          </label>
                          <label>
                            Font Size (pt):
                            <input
                              type="number"
                              min="8"
                              max="72"
                              value={presetConfig.fontSize}
                              onChange={(e) => setPresetConfig({...presetConfig, fontSize: e.target.value})}
                            />
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={presetConfig.bold}
                              onChange={(e) => setPresetConfig({...presetConfig, bold: e.target.checked})}
                            />
                            Bold
                          </label>
                          <div className="modal-buttons">
                            <button onClick={applyCustomPreset} className="apply-button">
                              Apply to Selected
                            </button>
                            <button onClick={() => setShowPresetModal(false)} className="cancel-button">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div
                    id="editable-card-content"
                    contentEditable
                    className={`editable-content ${font}`}
                    style={{
                      fontSize: tagSize,
                      backgroundColor: '#fff',
                      padding: '20px',
                      minHeight: '400px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      outline: 'none',
                    }}
                    onInput={(e) => setCardContent(e.target.innerHTML)}
                    onMouseUp={saveSelection}
                    onKeyUp={saveSelection}
                    dangerouslySetInnerHTML={{ __html: cardContent }}
                  />
                </div>
              ) : (
                <div
                  className={`card-content reset-injected-html ${font}`}
                  style={{
                    backgroundColor: highlightColor,
                    padding: '20px',
                    fontSize: tagSize,
                  }}
                  dangerouslySetInnerHTML={{ __html: cardContent }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

