import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
// Metadata icon URLs are not prefixed with basePath, so do it here.
const base = process.env.NEXT_PUBLIC_BASE_PATH;

const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: 'Number Guessing Game',
  description: "Pick a secret number, then take turns guessing your opponent's number. First to guess correctly wins!",
  icons: {
    icon: [
      {
        url: `${base}/icon-light-32x32.png`,
        media: '(prefers-color-scheme: light)',
      },
      {
        url: `${base}/icon-dark-32x32.png`,
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: `${base}/icon.svg`,
        type: 'image/svg+xml',
      },
    ],
    apple: `${base}/apple-icon.png`,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
