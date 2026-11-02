import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TrackerApp from "@/app/tracker-app";

export const metadata: Metadata = {
  title: "Kept — remember what matters",
  description: "A personal record of what you buy, use, care for, and change over time.",
  openGraph: {
    title: "Kept — remember what matters",
    description: "Keep your purchases, routines, services, and progress in one thoughtful place.",
    type: "website",
  },
};

export default async function HomePage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  if (!configured) return <TrackerApp />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return <TrackerApp />;

  return <PublicHome />;
}

function PublicHome() {
  return <main className="public-home">
    <a className="skip-link" href="#public-content">Skip to content</a>
    <header className="public-topbar">
      <Link className="wordmark" href="/" aria-label="Kept home"><span className="brand-mark">k.</span><span>kept</span></Link>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#your-life">Your life, in one place</a></nav>
      <div className="public-actions"><Link className="public-signin" href="/login">Sign in</Link><Link className="button button-primary" href="/login?mode=sign-up">Start free <span aria-hidden="true">→</span></Link></div>
    </header>

    <div id="public-content">
      <section className="public-hero" aria-labelledby="public-title">
        <div className="public-hero-copy">
          <p className="eyebrow"><span className="status-dot" /> YOUR PERSONAL LEDGER</p>
          <h1 id="public-title">Keep what<br /><em>matters.</em></h1>
          <p className="public-lede">A calmer way to remember what you bought, what you use, and how life changes over time.</p>
          <div className="public-hero-actions"><Link className="button button-primary" href="/login?mode=sign-up">Start your free account <span aria-hidden="true">→</span></Link><a className="public-text-link" href="#how-it-works">See how Kept works <span aria-hidden="true">↓</span></a></div>
          <p className="public-reassurance">Your account. Your records. Start with what you remember.</p>
        </div>
        <div className="public-visual" role="img" aria-label="A preview of a Kept library with products and a purchase timeline">
          <div className="public-visual-top"><span className="brand-mark">k.</span><span>YOUR LIBRARY</span><span className="public-live-dot" /></div>
          <div className="public-visual-title"><span>Things worth remembering</span><span>03</span></div>
          <div className="public-product-row"><span className="public-product-image public-product-sun" aria-hidden="true">◐</span><span><strong>Daily sunscreen</strong><small>Skincare · bought again</small></span><span className="public-row-arrow">↗</span></div>
          <div className="public-product-row"><span className="public-product-image public-product-shirt" aria-hidden="true">▱</span><span><strong>Blue everyday shirt</strong><small>Clothes · since last summer</small></span><span className="public-row-arrow">↗</span></div>
          <div className="public-product-row"><span className="public-product-image public-product-watch" aria-hidden="true">◷</span><span><strong>My everyday watch</strong><small>Accessories · cared for in June</small></span><span className="public-row-arrow">↗</span></div>
          <div className="public-visual-note"><span className="public-note-line" /><span><small>A SMALL RECORD OF WHAT STAYS</small><strong>Every purchase<br />has a little story.</strong></span><span className="public-note-date">OCT<br />26</span></div>
          <div className="public-visual-footer"><span>LIBRARY</span><span>CALENDAR</span><span>ROUTINE</span><span>PROGRESS</span></div>
        </div>
      </section>

      <section className="public-proof" aria-label="What Kept helps you remember"><p>Not another shopping list.</p><span>A little more aware of what you own.</span><i aria-hidden="true">✳</i><span>Useful details, when you need them.</span></section>

      <section className="public-features" id="how-it-works" aria-labelledby="features-title">
        <div className="public-section-heading"><p className="eyebrow">MADE FOR REAL LIFE</p><h2 id="features-title">Remember the details.<br /><em>Skip the mental load.</em></h2><p>Kept gives all the everyday things you want to remember a clear place to live.</p></div>
        <div className="public-feature-grid" id="your-life">
          <article className="public-feature public-feature-large"><span className="public-feature-number">01</span><span className="public-feature-icon" aria-hidden="true">▤</span><p className="eyebrow">YOUR THINGS</p><h3>A library with a longer memory.</h3><p>Keep an item’s photo, purchase dates, what you actually paid, and the useful details you’ll forget later.</p><span className="public-feature-mark">Every item, one story.</span></article>
          <article className="public-feature"><span className="public-feature-number">02</span><span className="public-feature-icon" aria-hidden="true">▦</span><p className="eyebrow">YOUR CALENDAR</p><h3>See your life by date.</h3><p>Find what you bought, used, or serviced on a particular day.</p></article>
          <article className="public-feature"><span className="public-feature-number">03</span><span className="public-feature-icon" aria-hidden="true">◷</span><p className="eyebrow">YOUR ROUTINE</p><h3>Keep your rhythm close.</h3><p>Save what’s in your morning and night routines, and keep the past when things change.</p></article>
          <article className="public-feature"><span className="public-feature-number">04</span><span className="public-feature-icon" aria-hidden="true">↻</span><p className="eyebrow">YOUR SERVICES</p><h3>Remember what needs care.</h3><p>Keep a simple history of haircuts, bike servicing, and other recurring services.</p></article>
          <article className="public-feature public-feature-progress"><span className="public-feature-number">05</span><span className="public-feature-icon" aria-hidden="true">⌁</span><p className="eyebrow">YOUR PROGRESS</p><h3>Notice change, over time.</h3><p>Build private photo timelines and small check-ins for the things you’re working on.</p><span className="public-feature-mark">Your pace. Your record.</span></article>
        </div>
      </section>

      <section className="public-privacy"><span className="public-privacy-icon" aria-hidden="true">◉</span><div><p className="eyebrow">A PERSONAL SPACE</p><h2>Your records stay yours.</h2><p>Sign in to keep your Kept account available across your devices. Your library is tied to your account.</p></div><Link className="public-text-link" href="/login?mode=sign-up">Make your account <span aria-hidden="true">→</span></Link></section>

      <section className="public-cta"><p className="eyebrow">START WITH WHAT YOU REMEMBER</p><h2>A name is enough<br />to get started<span>.</span></h2><p>Add dates, photos, and details whenever you’re ready.</p><Link className="button button-primary" href="/login?mode=sign-up">Start free with Kept <span aria-hidden="true">→</span></Link></section>
    </div>

    <footer className="public-footer"><Link className="footer-brand" href="/">kept<span>.</span></Link><span>A little more aware of what you own</span><Link href="/login">Sign in</Link><span>© Kept</span></footer>
  </main>;
}
