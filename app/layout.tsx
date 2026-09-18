import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "Kiipl Projects", description: "Construction site progress visualisation" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
