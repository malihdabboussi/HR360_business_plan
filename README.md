# HR360 business plan · private sharing app

A small Next.js 14 app that serves the HR360 business plan (English and Arabic) only behind share links you control.

- `/admin` — password-protected dashboard: create a link per investor, copy it (English or Arabic version), see views and last view, **revoke** (instantly closes the link), **restore**, or **delete** it.
- `/p/<token>` — the English plan for that link; `/p/<token>/ar` — the Arabic plan. A revoked, expired or deleted link shows a "link no longer available" page.
- Tokens are 128-bit random, pages are marked `noindex`, and responses are never cached.

## 1. Run locally

```bash
npm install
cp .env.example .env.local     # set ADMIN_PASSWORD and SESSION_SECRET
npm run dev                    # http://localhost:3000/admin
```

Without `LINKS_TABLE` the app stores links in `.data/links.json` (fine locally, not on Amplify).

## 2. Create the DynamoDB table (one time)

```bash
aws dynamodb create-table \
  --table-name hr360-plan-links \
  --attribute-definitions AttributeName=token,AttributeType=S \
  --key-schema AttributeName=token,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-central-1
```

Any region works; use the same value for `LINKS_REGION`.

## 3. Deploy on AWS Amplify Hosting

1. Push this folder to a Git repository (GitHub, GitLab, Bitbucket or CodeCommit).
2. Amplify console → **Create new app** → connect the repository and branch. Amplify detects Next.js (SSR) and uses the `amplify.yml` in this folder.
3. **Environment variables** (App settings → Environment variables):

   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | the dashboard password |
   | `SESSION_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
   | `LINKS_TABLE` | `hr360-plan-links` |
   | `LINKS_REGION` | the table's region, e.g. `eu-central-1` |
   | `PUBLIC_BASE_URL` | optional, e.g. `https://plan.hrs360.com` (used when building share URLs) |

   `amplify.yml` copies these into `.env.production` at build time so the server can read them at runtime.
4. **Give the app permission to use the table** (App settings → IAM roles → **Compute role**): create or pick a role and attach this policy, replacing account id and region:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Scan"],
       "Resource": "arn:aws:dynamodb:eu-central-1:123456789012:table/hr360-plan-links"
     }]
   }
   ```
5. Deploy. Open `https://<app>.amplifyapp.com/admin`, sign in, create the first link, and send it.

A custom domain (App settings → Domain management) works as usual; set `PUBLIC_BASE_URL` to it so copied links use the domain.

## 4. Updating the plan content

The plan pages live in `content/index.html` (English) and `content/ar.html` (Arabic). Replace them and redeploy; `npm run build` embeds them into the server bundle automatically (`scripts/embed-plan.mjs`). The language switch inside the pages is rewritten to the link's own URLs at request time.

## How access control works

Every request to `/p/<token>` looks the token up in the table and serves the plan only when the link exists, is not revoked and has not expired. Revoking or deleting a link takes effect on the next request, with no cache in between. The admin area is protected by a signed, httpOnly session cookie valid for 12 hours.
