import PublicNav from './PublicNav';
import PublicFooter from './PublicFooter';
import MarketingMotion from './MarketingMotion';

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-site">
      <PublicNav />
      <main>
        <MarketingMotion>{children}</MarketingMotion>
      </main>
      <PublicFooter />
    </div>
  );
}
