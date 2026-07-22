import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Story } from "@/components/landing/story";
import { MarketsBento } from "@/components/landing/markets-bento";
import { NairaRamp } from "@/components/landing/naira-ramp";
import { Values } from "@/components/landing/values";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="relative w-full overflow-hidden bg-black">
      <Navbar />
      <Hero />
      <Story />
      <MarketsBento />
      <NairaRamp />
      <Values />
      <HowItWorks />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}
