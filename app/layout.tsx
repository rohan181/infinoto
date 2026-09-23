import type { Metadata } from "next";
import "./globals.css";
import "./recommendations.css";
import "./youtube.css";
import "./library-refresh.css";
import "./content-analysis.css";
import "./graph-controls.css";

export const metadata: Metadata = {
  title: "Infinity — Your curiosity, without limits.",
  description: "Tell Infinity what you want to learn. Create a personalized learning path with Claude, explore connected topics, and find your next step.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
