import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export type ShareLink = {
  token: string;
  label: string;
  note?: string;
  createdAt: string;
  expiresAt?: string | null;
  revoked: boolean;
  revokedAt?: string | null;
  views: number;
  lastViewedAt?: string | null;
};

export interface LinkStore {
  list(): Promise<ShareLink[]>;
  get(token: string): Promise<ShareLink | null>;
  put(link: ShareLink): Promise<void>;
  update(token: string, patch: Partial<ShareLink>): Promise<ShareLink | null>;
  remove(token: string): Promise<void>;
  recordView(token: string): Promise<void>;
}

// ---------------------------------------------------------------- DynamoDB (production)
class DynamoStore implements LinkStore {
  private doc: DynamoDBDocumentClient;
  constructor(private table: string, region?: string) {
    const client = new DynamoDBClient(region ? { region } : {});
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }
  async list() {
    const items: ShareLink[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(new ScanCommand({ TableName: this.table, ExclusiveStartKey }));
      items.push(...((res.Items as ShareLink[]) ?? []));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }
  async get(token: string) {
    const res = await this.doc.send(new GetCommand({ TableName: this.table, Key: { token } }));
    return (res.Item as ShareLink) ?? null;
  }
  async put(link: ShareLink) {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: link }));
  }
  async update(token: string, patch: Partial<ShareLink>) {
    const existing = await this.get(token);
    if (!existing) return null;
    const merged = { ...existing, ...patch, token };
    await this.put(merged);
    return merged;
  }
  async remove(token: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { token } }));
  }
  async recordView(token: string) {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { token },
        UpdateExpression: "ADD #v :one SET lastViewedAt = :now",
        ConditionExpression: "attribute_exists(#t)",
        ExpressionAttributeNames: { "#v": "views", "#t": "token" },
        ExpressionAttributeValues: { ":one": 1, ":now": new Date().toISOString() },
      })
    );
  }
}

// ---------------------------------------------------------------- JSON file (local development only)
class FileStore implements LinkStore {
  private file = path.join(process.cwd(), ".data", "links.json");
  private async readAll(): Promise<ShareLink[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as ShareLink[];
    } catch {
      return [];
    }
  }
  private async writeAll(links: ShareLink[]) {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(links, null, 2));
  }
  async list() {
    return this.readAll();
  }
  async get(token: string) {
    return (await this.readAll()).find((l) => l.token === token) ?? null;
  }
  async put(link: ShareLink) {
    const all = (await this.readAll()).filter((l) => l.token !== link.token);
    all.push(link);
    await this.writeAll(all);
  }
  async update(token: string, patch: Partial<ShareLink>) {
    const all = await this.readAll();
    const i = all.findIndex((l) => l.token === token);
    if (i < 0) return null;
    all[i] = { ...all[i], ...patch, token };
    await this.writeAll(all);
    return all[i];
  }
  async remove(token: string) {
    await this.writeAll((await this.readAll()).filter((l) => l.token !== token));
  }
  async recordView(token: string) {
    const link = await this.get(token);
    if (link) await this.update(token, { views: (link.views ?? 0) + 1, lastViewedAt: new Date().toISOString() });
  }
}

// ---------------------------------------------------------------- PostgreSQL (e.g. an existing RDS instance)
type Row = {
  token: string;
  label: string;
  note: string | null;
  created_at: Date;
  expires_at: Date | null;
  revoked: boolean;
  revoked_at: Date | null;
  views: number;
  last_viewed_at: Date | null;
};
const TABLE = "business_plan_links";
class PostgresStore implements LinkStore {
  private pool: Pool;
  private ready: Promise<void>;
  constructor(connectionString: string, ssl: boolean) {
    this.pool = new Pool({ connectionString, ssl: ssl ? { rejectUnauthorized: false } : undefined, max: 3 });
    this.ready = this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
          token text PRIMARY KEY,
          label text NOT NULL,
          note text,
          created_at timestamptz NOT NULL,
          expires_at timestamptz,
          revoked boolean NOT NULL DEFAULT false,
          revoked_at timestamptz,
          views integer NOT NULL DEFAULT 0,
          last_viewed_at timestamptz
        )`
      )
      .then(() => undefined);
  }
  private toLink(r: Row): ShareLink {
    return {
      token: r.token,
      label: r.label,
      note: r.note ?? undefined,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
      revoked: r.revoked,
      revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
      views: r.views,
      lastViewedAt: r.last_viewed_at ? r.last_viewed_at.toISOString() : null,
    };
  }
  async list() {
    await this.ready;
    const res = await this.pool.query<Row>(`SELECT * FROM ${TABLE} ORDER BY created_at DESC`);
    return res.rows.map((r) => this.toLink(r));
  }
  async get(token: string) {
    await this.ready;
    const res = await this.pool.query<Row>(`SELECT * FROM ${TABLE} WHERE token = $1`, [token]);
    return res.rows[0] ? this.toLink(res.rows[0]) : null;
  }
  async put(l: ShareLink) {
    await this.ready;
    await this.pool.query(
      `INSERT INTO ${TABLE} (token, label, note, created_at, expires_at, revoked, revoked_at, views, last_viewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (token) DO UPDATE SET label=EXCLUDED.label, note=EXCLUDED.note, expires_at=EXCLUDED.expires_at,
         revoked=EXCLUDED.revoked, revoked_at=EXCLUDED.revoked_at, views=EXCLUDED.views, last_viewed_at=EXCLUDED.last_viewed_at`,
      [l.token, l.label, l.note ?? null, l.createdAt, l.expiresAt ?? null, l.revoked, l.revokedAt ?? null, l.views ?? 0, l.lastViewedAt ?? null]
    );
  }
  async update(token: string, patch: Partial<ShareLink>) {
    const existing = await this.get(token);
    if (!existing) return null;
    const merged = { ...existing, ...patch, token };
    await this.put(merged);
    return merged;
  }
  async remove(token: string) {
    await this.ready;
    await this.pool.query(`DELETE FROM ${TABLE} WHERE token = $1`, [token]);
  }
  async recordView(token: string) {
    await this.ready;
    await this.pool.query(`UPDATE ${TABLE} SET views = views + 1, last_viewed_at = now() WHERE token = $1`, [token]);
  }
}

let store: LinkStore | undefined;
export function getStore(): LinkStore {
  if (store) return store;
  const table = process.env.LINKS_TABLE;
  const pg = process.env.DATABASE_URL;
  if (pg) {
    const ssl = (process.env.DATABASE_SSL ?? "true").toLowerCase() !== "false";
    store = new PostgresStore(pg, ssl);
  } else if (table) {
    store = new DynamoStore(table, process.env.LINKS_REGION || process.env.AWS_REGION);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[hr360] Neither DATABASE_URL nor LINKS_TABLE is set: using the local file store. Links will not persist on Amplify.");
    }
    store = new FileStore();
  }
  return store;
}
