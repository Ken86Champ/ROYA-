import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROYA — Revenue Reactivation",
  description: "Autonome B2B Revenue Reactivation Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
