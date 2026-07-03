import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { GymFlowProvider } from '../providers/GymFlowContext';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'GymFlow AI | Premium Fitness & Subscription Platform',
  description: 'Alcance sua alta performance com treinos adaptados por Inteligência Artificial, acompanhamento de nutrição, gamificação e comunidade exclusiva.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GymFlow AI',
  },
};

// Next 16: viewport é um export separado de metadata.
// viewportFit: 'cover' habilita as safe-areas (notch / home indicator) no mobile.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} dark h-full`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="bg-gym-dark text-white font-sans min-h-full flex flex-col antialiased">
        <GymFlowProvider>
          {children}
        </GymFlowProvider>
      </body>
    </html>
  );
}
