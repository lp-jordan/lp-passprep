import type { Metadata } from 'next';
import './global.css';

export const metadata: Metadata = {
  title: 'Pass Prep MVP',
  description: 'Build Pass layout and workbook drafts as separate workflows from the same transcript source data.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
