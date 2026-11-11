import type { Metadata } from "next";
import { Geist_Mono, Montserrat } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

// Used for codes (recovery codes, setup key, ticket keys)
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Fountline Digital Portal",
  description: "Projects, tickets and support for Fountline Digital clients and team.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
