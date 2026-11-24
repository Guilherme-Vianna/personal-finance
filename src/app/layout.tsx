import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Grana na Vida", template: "%s · Grana na Vida" },
  description: "Controle de gastos, orçamento do mês e metas de dinheiro",
};

export const viewport: Viewport = { themeColor: "#1b3558", viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
