import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pass Prep MVP',
  description: 'Upload project.json, generate a structured plan, review, approve, and export.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
