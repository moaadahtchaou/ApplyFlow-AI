import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: {
    default: 'ApplyFlow AI',
    template: '%s · ApplyFlow AI'
  },
  description: 'Local-first job search CRM with AI-powered personalized message generation.',
  keywords: ['job search', 'CRM', 'AI', 'outreach', 'cover letter', 'lead finder'],
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    title: 'ApplyFlow AI',
    description: 'Find companies, save contacts, and generate personalized outreach messages with AI.',
    type: 'website'
  }
};

// Pre-hydration inline script — prevents theme flash (no external deps)
const themeScript = `
(function(){
  try{
    var s=localStorage.getItem('applyflow-theme');
    var d=document.documentElement;
    if(s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)){
      d.classList.add('dark');
    }
  }catch(e){}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased bg-background text-on-surface">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
