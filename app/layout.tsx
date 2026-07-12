import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s | DocCanvas ∞', default: 'DocCanvas — Playbook ∞ Canvas' },
  description: 'Interactive infinite canvas for your AI product Playbook documents',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="bg-[#F8FBF0]">
      <body className="antialiased min-h-[100dvh]">{children}</body>
    </html>
  );
}
