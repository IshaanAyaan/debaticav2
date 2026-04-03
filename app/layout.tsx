import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'DEBATICA',
  description: 'Search, cut, and copy debate evidence for Policy, LD, PF, and BQ.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable}`}>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
