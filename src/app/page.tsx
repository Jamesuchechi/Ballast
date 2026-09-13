import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main style={{ minHeight: "100vh", backgroundColor: "var(--bg)", color: "var(--text)" }}>
      <Hero />
      <HowItWorks />
      <ComparisonTable />
      <Footer />
    </main>
  );
}
