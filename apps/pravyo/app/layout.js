import './globals.css';
import './cas.css';
import { Providers } from './providers';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import PwaInstallButton from '@/components/PwaInstallButton';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.praavyo.com";

const siteDescription =
  "School events, results, magazines, certificates, notices, and student writing in one connected platform.";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Praavyo",
    template: "%s | Praavyo",
  },
  description: siteDescription,
  applicationName: "Praavyo",
  keywords: [
    "school events",
    "student writing",
    "school magazine",
    "certificates",
    "talent platform",
    "results and showcases",
  ],
  authors: [{ name: "Praavyo" }],
  creator: "Praavyo",
  publisher: "Praavyo",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Praavyo",
    description: siteDescription,
    url: siteUrl,
    siteName: "Praavyo",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/pravyo-og.png",
        width: 1200,
        height: 630,
        alt: "Praavyo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Praavyo",
    description: siteDescription,
    images: ["/pravyo-og.png"],
  },
  // The `?v=2` query busts aggressively-cached favicons/app icons so browsers
  // and installed PWAs pick up the new logo instead of flashing the old one.
  // Bump this whenever the logo assets change.
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/pravyo-icon.png?v=2", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/favicon.ico?v=2" }],
    apple: [{ url: "/apple-icon.png?v=2", type: "image/png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  // iOS does not read the web manifest. Without these, an icon added to the
  // Home Screen opens in a Safari tab with browser chrome instead of running
  // standalone, which is the single biggest reason a PWA "feels like a website"
  // on iPhone.
  appleWebApp: {
    capable: true,
    title: "Praavyo",
    // "default" deliberately, not "black-translucent": translucent lets content
    // slide UNDER the status bar, which needs every screen to be safe-area aware
    // or headers end up behind the clock. Revisit only with that audited.
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // REQUIRED for env(safe-area-inset-*) to return anything but 0. The stylesheet
  // already padded for the notch and the iPhone home indicator in several
  // places, but without viewport-fit=cover every one of those insets computed
  // to zero, so the padding silently did nothing on the exact devices it was
  // written for.
  viewportFit: "cover",
  // Pinch-zoom is left enabled on purpose. Disabling it is the usual trick for
  // an "app-like" feel and it breaks accessibility for low-vision users; the
  // iOS zoom-on-focus problem is solved properly in globals.css by keeping form
  // controls at >=16px instead.
  themeColor: "#20352c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true}>
        {/* First in the body: the install strip sits above every page. */}
        <PwaInstallButton />
        <Providers>{children}</Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
