import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Content Intelligence | Sitecore Marketplace",
  description:
    "Evaluate page quality across accessibility, SEO, readability, completeness, and governance dimensions.",
};

export default function ContentIntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
