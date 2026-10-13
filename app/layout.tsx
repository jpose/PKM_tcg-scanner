import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PokéScan — scanner et classeur de cartes Pokémon',
  description: 'Scannez vos cartes Pokémon, retrouvez leur valeur et rangez-les dans votre classeur.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#E23B2E',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=Nunito:wght@500;600;700;800&display=swap"
        />
        {/* Connexions ouvertes en avance : gagne ~200 ms sur la première recherche */}
        <link rel="preconnect" href="https://api.tcgdex.net" />
        <link rel="preconnect" href="https://assets.tcgdex.net" />
      </head>
      <body>{children}</body>
    </html>
  );
}
