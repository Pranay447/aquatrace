# Google Cloud Run deployment

Run these Bash commands in Google Cloud Shell from the AquaTrace checkout. Replace uppercase placeholders. You need a billing-enabled Google Cloud project and permissions for Cloud Run, Cloud Build, Artifact Registry, Cloud SQL, IAM and Secret Manager. Use a fresh production database; never run the demo seed there.

## 1. Project and registry

```bash
export PROJECT_ID="YOUR_PROJECT_ID"
export REGION="australia-southeast1"
gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create aquatrace --repository-format=docker --location="$REGION"
gcloud iam service-accounts create aquatrace-run --display-name="AquaTrace runtime"
export RUN_SA="aquatrace-run@$PROJECT_ID.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA" --role=roles/cloudsql.client
```

Use existing resources instead of repeating creation commands if already provisioned. Cloud Build's configured service account needs Artifact Registry write permissions. See [Google Cloud's deployment requirements](https://docs.cloud.google.com/run/docs/deploying).

## 2. Managed PostgreSQL

Cloud SQL example (review region/tier and charges first):

```bash
gcloud sql instances create aquatrace-db --database-version=POSTGRES_16 --tier=db-custom-1-3840 --region="$REGION" --storage-auto-increase --backup-start-time=17:00
gcloud sql databases create aquatrace --instance=aquatrace-db
read -s -p "New database password: " DB_PASSWORD; echo
gcloud sql users create aquatrace --instance=aquatrace-db --password="$DB_PASSWORD"
unset DB_PASSWORD
export SQL_CONNECTION="$PROJECT_ID:$REGION:aquatrace-db"
```

Set your database URL using the real password (URL-encode reserved characters):

```text
postgresql://aquatrace:URL_ENCODED_PASSWORD@localhost/aquatrace?host=/cloudsql/PROJECT_ID:REGION:aquatrace-db&connection_limit=5&pool_timeout=20
```

The Cloud SQL attachment supplies an authenticated Unix socket through the Cloud SQL proxy. Alternatively use a managed provider's PostgreSQL URL with `sslmode=require&connection_limit=5&pool_timeout=20`; omit Cloud SQL attachment/roles in that case. Do not expose PostgreSQL publicly just to connect the ESP32. See [Cloud SQL with Cloud Run](https://docs.cloud.google.com/sql/docs/postgres/connect-instance-cloud-run).

## 3. Secrets

Create secrets from stdin. The shell variables are cleared immediately and should not be put in source/configuration files.

```bash
read -s -p "Full production DATABASE_URL: " DB_URL; echo
printf '%s' "$DB_URL" | gcloud secrets create aquatrace-database --data-file=-
unset DB_URL
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create aquatrace-auth --data-file=-
read -s -p "Device S04 secret (32+ random characters; also set in private firmware secrets.h): " DEVICE_SECRET; echo
printf '%s' "$DEVICE_SECRET" | gcloud secrets create aquatrace-device-s04 --data-file=-
unset DEVICE_SECRET
for SECRET in aquatrace-database aquatrace-auth aquatrace-device-s04; do
  gcloud secrets add-iam-policy-binding "$SECRET" --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor
done
```

For each additional physical device create a distinct secret and bind it as `DEVICE_KEY_ITS_ID`. Pin numeric secret versions for reproducible deployment and rotation. Initial commands below assume version 1. See [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

## 4. Build server and migration images

```bash
export IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/aquatrace/web:1"
export MIGRATION_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/aquatrace/migration:1"
gcloud builds submit --tag "$IMAGE" .
gcloud auth configure-docker "$REGION-docker.pkg.dev"
docker build --target migration -t "$MIGRATION_IMAGE" .
docker push "$MIGRATION_IMAGE"
```

The main Dockerfile is a multi-stage standalone Next.js image, runs as a non-root user and listens on Cloud Run's `PORT`. No secrets are needed for `next build`. Public browser environment values (`NEXT_PUBLIC_*`) are build-time values; modify build args/build environment if changing the tile source. Never put device/DB/auth secrets in `NEXT_PUBLIC_*`.

Run migrations as a one-off job before the web deployment, not once per scaling instance:

```bash
gcloud run jobs create aquatrace-migrate --image="$MIGRATION_IMAGE" --region="$REGION" --service-account="$RUN_SA" --set-cloudsql-instances="$SQL_CONNECTION" --set-secrets=DATABASE_URL=aquatrace-database:1 --max-retries=0 --tasks=1
gcloud run jobs execute aquatrace-migrate --region="$REGION" --wait
```

For future releases update the job image with `gcloud run jobs update`, then execute again. This project pins Prisma 6 and uses `prisma migrate deploy` with checked-in SQL migrations.

## 5. Create the first administrator and register S04

Use Cloud SQL Auth Proxy in a trusted environment to expose the database on localhost only (or your provider's secured admin connection), set `DATABASE_URL` there and run:

```bash
npm ci
npm run db:generate
# Create a temporary .env with DATABASE_URL, AUTH_SECRET and APP_URL for CLI use;
# never commit it. AUTH_SECRET must match the production secret for session commands.
read -s -p "Initial admin password (12+ characters): " ADMIN_INITIAL_PASSWORD; echo
export ADMIN_INITIAL_PASSWORD
npm run admin:create
unset ADMIN_INITIAL_PASSWORD
```

The command prompts for email/name; it promotes an existing account without replacing its password. To avoid local DB access, the same command can be run in a private one-off Cloud Run job using the migration image, `node_modules/.bin/tsx scripts/create-admin.ts`, and appropriately supplied stdin; this interactive route is easiest with a trusted local proxy. Do not add the demo seed or accounts to production.

## 6. Deploy

```bash
gcloud run deploy aquatrace --image="$IMAGE" --region="$REGION" --service-account="$RUN_SA" --port=8080 --allow-unauthenticated --add-cloudsql-instances="$SQL_CONNECTION" --set-secrets=DATABASE_URL=aquatrace-database:1,AUTH_SECRET=aquatrace-auth:1,DEVICE_KEY_S04=aquatrace-device-s04:1 --set-env-vars=APP_URL=https://placeholder.invalid,DEMO_MODE=false --memory=512Mi --cpu=1 --max-instances=5 --concurrency=40
export APP_URL="$(gcloud run services describe aquatrace --region="$REGION" --format='value(status.url)')"
gcloud run services update aquatrace --region="$REGION" --update-env-vars="APP_URL=$APP_URL"
```

`APP_URL` must exactly match the browser origin; update it again if using a custom domain. The placeholder first revision refuses browser mutations until the real URL is configured. Login as your production administrator and add S04 with its actual location, MAC and flow order. Then configure firmware `API_URL` to `$APP_URL/api/telemetry` and its private root CA and device secret.

**The Cloud Run URL is internet-reachable so an ESP32 can upload without Google IAM credentials. Application authorization remains mandatory:** dashboard/read APIs require a session, and POST `/api/telemetry` requires the matching `X-Device-Key`. `--allow-unauthenticated` removes the outer IAM gate; it does not enable public telemetry reads. No credential or secret is returned to the browser. The landing/login/registration and minimal health endpoint are public by design.

## 7. Verify

```bash
curl --fail "$APP_URL/api/health"
curl -i "$APP_URL/api/workspace"  # expect 401
curl -i "$APP_URL/api/export"     # expect 401
curl -i -H 'Content-Type: application/json' -d '{}' "$APP_URL/api/telemetry" # expect 400, no secret disclosed
```

For a positive telemetry test, generate a payload with a current UTC timestamp and keep your key in an environment variable. Use the supplied PowerShell test script locally, or:

```bash
read -s -p "S04 key: " DEVICE_KEY_S04; echo
printf '{"deviceId":"S04","timestamp":"%s","turbidityNtu":4.8,"tdsPpm":215.4,"temperatureC":22.6,"raw":{"turbidityAdc":1840,"tdsAdc":1260},"firmwareVersion":"1.0.0"}' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > /tmp/aquatrace-test.json
printf 'header = "X-Device-Key: %s"\n' "$DEVICE_KEY_S04" | curl --config - --fail-with-body -H 'Content-Type: application/json' --data-binary @/tmp/aquatrace-test.json "$APP_URL/api/telemetry"
unset DEVICE_KEY_S04
```

Expect 201. Check dashboard S04 readings, raw ADC values in the DB, charts, protected export and administrator audit entries. Test a standard account is denied sensor mutations. Wait past stale/offline periods and refresh Alerts to verify the device-health incidents. Check logs with `gcloud run services logs read aquatrace --region="$REGION" --limit=50`.

## Operations

- Configure Cloud SQL backups, least-privilege DB roles, billing budgets and Cloud Run monitoring before sustained operation.
- Keep total `max-instances × connection_limit` below PostgreSQL's connection allowance, leaving room for migrations/admin access.
- Schedule trusted database maintenance to remove expired `Session` and `RateLimit` rows; archive/delete old `Reading` rows according to your retention decision. Do not delete readings without a retention policy and backup.
- Stale/offline alerts reconcile during authenticated workspace polls. Unattended alert delivery requires a future authenticated scheduler/notification worker; no emails or texts are promised by this release.
- Rotate device keys in Secret Manager, deploy the new version, then update physical firmware. Rotate `AUTH_SECRET` to revoke all sessions. Deployments should use new image tags/digests rather than overwriting existing release tags.
- Hardware compilation, calibration, physical Wi-Fi coverage and a real cloud deployment require your board/cloud account and have to be verified separately.

Next.js deployment design follows its [standalone Docker guidance](https://nextjs.org/docs/app/getting-started/deploying).
