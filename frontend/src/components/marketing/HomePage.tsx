import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import MarketingShell from './MarketingShell';
import {
  FEATURES,
  MARKETING_IMAGES,
  PRICING_PLANS,
  TESTIMONIALS,
} from './marketing-data';

function delay(ms: number): CSSProperties {
  return { '--mkt-delay': `${ms}ms` } as CSSProperties;
}

export default function HomePage() {
  return (
    <MarketingShell>
      <section className="mkt-hero">
        <div className="mkt-glow-orb mkt-glow-orb--hero" aria-hidden />
        <div className="mkt-container mkt-hero-grid">
          <div className="mkt-reveal is-visible" style={delay(0)}>
            <div className="mkt-eyebrow">
              <span className="status-dot green" style={{ width: 6, height: 6 }} />
              Built for Ghanaian SMEs
            </div>
            <h1>
              Run your business <em>smarter</em>, from counter to close
            </h1>
            <p className="mkt-hero-lead">
              BizManager is the all-in-one platform for retail and food businesses — mobile POS,
              inventory, invoicing, MoMo-ready payments, and AI insights your team can act on today.
            </p>
            <div className="mkt-hero-cta">
              <Link href="/register" className="mkt-btn mkt-btn-primary mkt-btn-lg">
                Start free trial →
              </Link>
              <Link href="/pricing" className="mkt-btn mkt-btn-outline mkt-btn-lg">
                View pricing
              </Link>
            </div>
            <div className="mkt-stats">
              <div className="mkt-stat">
                <strong>500+</strong>
                <span>Businesses on platform</span>
              </div>
              <div className="mkt-stat">
                <strong>GH₵2M+</strong>
                <span>Sales processed</span>
              </div>
              <div className="mkt-stat">
                <strong>99.9%</strong>
                <span>Uptime target</span>
              </div>
            </div>
          </div>

          <div className="mkt-hero-visual mkt-reveal mkt-reveal-right is-visible" style={delay(120)}>
            <div className="mkt-hero-frame">
              <Image
                src={MARKETING_IMAGES.heroPos}
                alt="Shop owner processing a sale with BizManager POS"
                fill
                priority
                sizes="(max-width: 960px) 100vw, 520px"
              />
              <div className="mkt-float-card">
                <span className="status-dot green" style={{ width: 10, height: 10, flexShrink: 0 }} />
                <div>
                  <strong>Today&apos;s sales · GH₵ 4,280</strong>
                  <span>12 MoMo · 8 cash · synced across devices</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mkt-container mkt-trust-bar mkt-reveal" style={delay(200)}>
          <span>Retail & wholesale</span>
          <span>Restaurants & cafés</span>
          <span>Offline-first</span>
          <span>Paystack · MoMo ready</span>
        </div>
      </section>

      <section id="features" className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-kicker">Everything you need</p>
            <h2>One platform. Total control of your operation.</h2>
            <p>
              Replace scattered notebooks, spreadsheets, and guesswork with a system your whole team trusts.
            </p>
          </div>
          <div className="mkt-feature-grid">
            {FEATURES.map((f, i) => (
              <article
                key={f.title}
                className="mkt-feature-card mkt-reveal mkt-reveal-scale"
                style={delay(i * 70)}
              >
                <div
                  className="mkt-feature-icon"
                  style={{ background: f.bg, color: f.color, border: `1px solid ${f.color}33` }}
                  aria-hidden
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 0 }}>
        <div className="mkt-container">
          <div className="mkt-split">
            <div className="mkt-split-media mkt-reveal mkt-reveal-left" style={delay(0)}>
              <Image
                src={MARKETING_IMAGES.featureRetail}
                alt="Retail store using modern point of sale"
                width={1200}
                height={825}
              />
            </div>
            <div className="mkt-split-copy mkt-reveal mkt-reveal-right" style={delay(80)}>
              <p className="mkt-kicker">Retail & shops</p>
              <h3>Sell faster at the counter</h3>
              <p>
                Barcode-ready product lists, quick checkout, and customer credit tracking — built for
                provision stores, boutiques, and electronics shops across Ghana.
              </p>
              <ul className="mkt-checklist">
                <li>Multi-payment checkout including MoMo</li>
                <li>Customer balances and invoice history</li>
                <li>Works when connectivity drops</li>
              </ul>
            </div>
          </div>

          <div className="mkt-split is-reverse">
            <div className="mkt-split-media mkt-reveal mkt-reveal-right" style={delay(0)}>
              <Image
                src={MARKETING_IMAGES.featureRestaurant}
                alt="Restaurant team serving customers efficiently"
                width={1200}
                height={825}
              />
            </div>
            <div className="mkt-split-copy mkt-reveal mkt-reveal-left" style={delay(80)}>
              <p className="mkt-kicker">Food & hospitality</p>
              <h3>Kitchen, menu, and orders in sync</h3>
              <p>
                Menu categories, modifiers, kitchen tickets, and food POS — so front-of-house and
                back-of-house stay aligned during rush hour.
              </p>
              <ul className="mkt-checklist">
                <li>Recipe-linked inventory deductions</li>
                <li>Order status from new to served</li>
                <li>Daily close and shift reporting</li>
              </ul>
            </div>
          </div>

          <div className="mkt-split">
            <div className="mkt-split-media mkt-reveal mkt-reveal-left" style={delay(0)}>
              <Image
                src={MARKETING_IMAGES.featureAnalytics}
                alt="Business owner reviewing sales analytics"
                width={1200}
                height={825}
              />
            </div>
            <div className="mkt-split-copy mkt-reveal mkt-reveal-right" style={delay(80)}>
              <p className="mkt-kicker">Insights</p>
              <h3>Know your numbers before month-end</h3>
              <p>
                Dashboards, sales history, and AI-powered recommendations help you spot trends, protect
                margin, and plan stock with confidence.
              </p>
              <ul className="mkt-checklist">
                <li>Daily, weekly, and monthly reports</li>
                <li>Low-stock and revenue alerts</li>
                <li>Secure multi-tenant data isolation</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section" style={{ background: 'var(--bg-surface)' }}>
        <div className="mkt-container">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-kicker">Built for your industry</p>
            <h2>Whether you sell plates or products</h2>
          </div>
          <div className="mkt-industries">
            <article className="mkt-industry-card mkt-reveal" style={delay(0)}>
              <Image src={MARKETING_IMAGES.heroMarket} alt="Busy retail market in Ghana" fill sizes="50vw" />
              <div className="mkt-industry-overlay">
                <h3>Retail & wholesale</h3>
                <p>POS, stock, and customer CRM for shops that move fast and need accurate counts.</p>
              </div>
            </article>
            <article className="mkt-industry-card mkt-reveal" style={delay(100)}>
              <Image src={MARKETING_IMAGES.featureInventory} alt="Warehouse inventory management" fill sizes="50vw" />
              <div className="mkt-industry-overlay">
                <h3>Inventory-heavy teams</h3>
                <p>Track ingredients, variants, and suppliers — with alerts before shelves go empty.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-container">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-kicker">How it works</p>
            <h2>Up and running in three steps</h2>
          </div>
          <div className="mkt-steps">
            {[
              {
                n: '1',
                title: 'Create your business',
                desc: 'Register in minutes, add your products or menu, and invite managers and cashiers.',
              },
              {
                n: '2',
                title: 'Sell from any device',
                desc: "Use POS on phone or tablet. Sales sync when you're back online — nothing lost.",
              },
              {
                n: '3',
                title: 'Grow with clarity',
                desc: 'Reports, invoices, and AI advice help you make better stocking and pricing decisions.',
              },
            ].map((step, i) => (
              <article key={step.n} className="mkt-step mkt-reveal" style={delay(i * 90)}>
                <div className="mkt-step-num">{step.n}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 0 }}>
        <div className="mkt-container">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-kicker">Trusted by operators</p>
            <h2>Real businesses. Real results.</h2>
          </div>
          <div className="mkt-testimonials">
            {TESTIMONIALS.map((t, i) => (
              <blockquote key={t.name} className="mkt-testimonial mkt-reveal" style={delay(i * 80)}>
                <p>&ldquo;{t.quote}&rdquo;</p>
                <footer className="mkt-person">
                  <Image src={t.avatar} alt="" width={44} height={44} />
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section" style={{ background: 'var(--bg-surface)' }}>
        <div className="mkt-container">
          <div className="mkt-section-head mkt-reveal">
            <p className="mkt-kicker">Simple pricing</p>
            <h2>Start free. Scale when you&apos;re ready.</h2>
          </div>
          <div className="mkt-pricing-grid">
            {PRICING_PLANS.map((plan, i) => (
              <article
                key={plan.id}
                className={`mkt-price-card mkt-reveal mkt-reveal-scale${plan.featured ? ' is-featured' : ''}`}
                style={delay(i * 90)}
              >
                <h3>{plan.name}</h3>
                <p className="mkt-price">
                  {plan.price}
                  <small> / {plan.period}</small>
                </p>
                <ul className="mkt-price-features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mkt-btn mkt-btn-lg ${plan.featured ? 'mkt-btn-primary' : 'mkt-btn-outline'}`}
                  style={{ width: '100%' }}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
          <p className="mkt-reveal" style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)', ...delay(200) }}>
            <Link href="/pricing" className="mkt-link-arrow">
              Compare all plans
            </Link>
          </p>
        </div>
      </section>

      <section className="mkt-cta-band mkt-reveal mkt-reveal-scale">
        <h2>Ready to modernize your business?</h2>
        <p>
          Join hundreds of Ghanaian operators using BizManager. 14-day free trial — no credit card required.
        </p>
        <Link href="/register" className="mkt-btn mkt-btn-primary mkt-btn-lg">
          Create free account
        </Link>
      </section>
    </MarketingShell>
  );
}
