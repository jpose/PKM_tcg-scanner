import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PokéScan — Scanner de cartes Pokémon',
  description: 'Scannez vos cartes Pokémon et gérez votre collection avec reconnaissance IA.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen text-poke-dark">{children}</body>
    </html>
  );
}
