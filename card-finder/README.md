# Card Finder

A modern web application for searching and formatting debate evidence cards from the Debatify API.

## Features

- 🔍 Search cards using the Debatify recent API
- 📋 Display cards in a clean, readable format
- 🎨 Customize formatting:
  - Font selection (Calibri, Arial, Times New Roman, Comic Sans)
  - Tag size (11pt - 18pt)
  - Highlight color (Yellow, Cyan, Green)
- ✏️ **Editable interface** - Highlight, underline, and bold your own text
- 📄 Copy cards to clipboard with formatting preserved

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## Usage

1. Enter your search query in the search box
2. Click "Search" to fetch cards from the Debatify API
3. Select a card from the list to view it
4. Use the formatting controls to customize the appearance
5. Click "Edit Card" to enable editing mode where you can:
   - Select text and make it bold
   - Underline text
   - Highlight text with colors
   - Remove formatting
6. Click "Copy" to copy the formatted card to your clipboard

## Technologies

- React 18
- Vite
- Modern CSS

