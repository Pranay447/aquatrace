import Link from "next/link";
import {
  Droplets,
  ArrowUpRight,
  Radio,
  Waves,
  MapPin,
  GitCompareArrows,
} from "lucide-react";
export default function Home() {
  return (
    <main className="landing">
      <nav>
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Droplets />
          </span>
          AquaTrace
        </Link>
        <div className="row">
          <Link href="/login">User login</Link>
          <Link className="button" href="/admin/login">
            Administrator access <ArrowUpRight size={16} />
          </Link>
        </div>
      </nav>
      <div className="landing-hero">
        <div>
          <span className="eyebrow">
            <Radio size={14} /> CONNECTED WATER. CLEARER INSIGHT.
          </span>
          <h1>
            Track pollution.
            <br />
            Trace the source.
          </h1>
          <p>
            One waterway. A clearer picture.
            <br />A connected sensor network that turns water-quality readings
            into a place to start investigating.
          </p>
          <div className="row">
            <Link className="button primary" href="/login">
              Open your workspace <ArrowUpRight size={18} />
            </Link>
            <Link className="button" href="/register">
              Join the network
            </Link>
          </div>
          <small>
            Built for local communities. Designed for healthier waterways.
          </small>
        </div>
        <div className="hero-image">
          <div className="hero-note">
            <span className="live-dot" /> A better view of what flows
            downstream.<span>ESP32 · Turbidity · TDS · Temperature</span>
          </div>
        </div>
      </div>
      <div className="feature-grid">
        {[
          [
            Waves,
            "See the change",
            "Continuous readings make short-lived events visible.",
          ],
          [
            GitCompareArrows,
            "Follow the evidence",
            "Compare upstream and downstream monitoring points.",
          ],
          [
            MapPin,
            "Know where to look",
            "Use source corridors to focus your next inspection.",
          ],
        ].map(([Icon, title, desc]) => {
          const I = Icon as typeof Waves;
          return (
            <article key={String(title)}>
              <I size={24} />
              <h3>{String(title)}</h3>
              <p>{String(desc)}</p>
            </article>
          );
        })}
      </div>
      <footer>
        © 2026 AquaTrace{" "}
        <span>Environmental monitoring · Not a drinking-water assessment</span>
      </footer>
    </main>
  );
}
