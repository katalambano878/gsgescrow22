import type { Metadata, Viewport } from "next";
import { Sora, Plus_Jakarta_Sans, IBM_Plex_Mono, Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-editorial",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1424" },
  ],
};

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://sellbuysafe.gsgbrands.com.gh";

export const metadata: Metadata = {
  title: {
    default: "Sell-Safe Buy-Safe — Ghana's protected checkout",
    template: "%s · SBBS",
  },
  description:
    "SBBS holds the buyer's money safely until the goods arrive as promised. The trusted middleman for Instagram, WhatsApp, TikTok and informal commerce in Ghana.",
  metadataBase: new URL(SITE_URL),
  applicationName: "Sell-Safe Buy-Safe",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  keywords: [
    "safe payments",
    "Ghana",
    "online shopping protection",
    "trust badge",
    "Instagram commerce",
    "WhatsApp shop",
    "TikTok commerce",
    "social commerce",
    "buyer protection",
    "seller protection",
    "MoMo payment",
    "GSG Brands",
  ],
  authors: [{ name: "GSG Brands", url: "https://gsgbrands.com.gh" }],
  creator: "GSG Brands",
  publisher: "GSG Brands",
  formatDetection: { telephone: false, email: false, address: false },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    siteName: "Sell-Safe Buy-Safe",
    title: "Sell-Safe Buy-Safe — Ghana's protected checkout",
    description:
      "Safe payments + Trust Badge + Dispute Court for Ghanaian social commerce.",
    url: SITE_URL,
    locale: "en_GH",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sell-Safe Buy-Safe — Ghana's protected checkout",
    description:
      "Safe payments + Trust Badge + Dispute Court for Ghanaian social commerce.",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jakarta.variable} ${plexMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground overflow-x-hidden">
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}
