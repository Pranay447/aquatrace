import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-state">
      <h1>This point isn’t on the map.</h1>
      <p>The requested page could not be found.</p>
      <Link className="button primary" href="/dashboard">
        Back to dashboard
      </Link>
    </main>
  );
}
