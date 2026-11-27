import type { Metadata } from "next";
import { Jost, Radio_Canada_Big, Red_Hat_Mono } from "next/font/google";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

const head = Jost({ variable: "--font-head", subsets: ["latin"] });
const body = Radio_Canada_Big({ variable: "--font-body", subsets: ["latin"] });
const code = Red_Hat_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LedgerStack",
  description: "Multi-tenant B2B supply chain and inventory platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${head.variable} ${body.variable} ${code.variable} antialiased`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
