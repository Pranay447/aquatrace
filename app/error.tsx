"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-state">
      <h1>We couldn’t connect.</h1>
      <p>Check the database and network connection, then try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link href="/login">Return to login</Link>
    </main>
  );
}
