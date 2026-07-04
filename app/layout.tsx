import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "СМЕНА · Диспетчер отклонений",
  description:
    "Учебный тренажёр по производственной инструкции № 408-Р-6. Не заменяет инструкцию.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0c1216",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body style={{ background: "#0c1216" }}>{children}</body>
    </html>
  );
}
