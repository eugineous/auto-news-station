import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
      title: 'Auto News Station - Politics & Tech',
      description: 'Automated news station with AI-powered carousel generation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
      return (
              <html lang="en">
                    <body className={inter.className}>{children}</body>
              </html>
            );
}
