import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s | DocCanvas', default: 'DocCanvas | Knowledge Product Workspace' },
  description: 'Auditable knowledge objects, product blueprints and deterministic canvas projections',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="bg-[var(--factory-canvas)]">
      <body className="antialiased min-h-[100dvh]">{children}</body>
    </html>
  );
}
