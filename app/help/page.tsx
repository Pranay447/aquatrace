import Link from "next/link";
export default function Help() {
  return (
    <main className="landing">
      <nav>
        <Link className="brand" href="/">
          AquaTrace
        </Link>
        <Link className="button" href="/login">
          Back to login
        </Link>
      </nav>
      <article
        className="card padded"
        style={{ maxWidth: 760, margin: "60px auto" }}
      >
        <h1>Workspace help</h1>
        <h3>Signing in</h3>
        <p>
          Use your registered email and password. Administrator login requires
          an approved administrator account. An existing administrator reviews
          access requests in Settings.
        </p>
        <h3>Local demo</h3>
        <p>
          Demo credentials and setup steps are listed in the project README.
          Demo accounts are available only in a seeded local database.
        </p>
        <h3>Connection problems</h3>
        <p>
          Ask your deployment administrator to check the PostgreSQL connection,
          database migrations and application origin. Offline sensor readings
          require checking device power, Wi-Fi, clock, upload credentials and
          calibration.
        </p>
        <h3>Account recovery</h3>
        <p>
          Contact your deployment administrator through your organisation’s
          usual support channel. Automatic email recovery is not configured.
        </p>
        <h3>Understanding readings</h3>
        <p>
          Configured monitoring ranges help prioritise investigation. They do
          not establish drinking-water suitability or identify the cause of a
          change.
        </p>
      </article>
    </main>
  );
}
