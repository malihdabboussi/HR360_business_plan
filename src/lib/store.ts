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

let store: LinkStore | undefined;
export function getStore(): LinkStore {
  if (store) return store;
  const table = process.env.LINKS_TABLE;
  if (table) {
    store = new DynamoStore(table, process.env.LINKS_REGION || process.env.AWS_REGION);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[hr360] LINKS_TABLE is not set: using the local file store. Links will not persist on Amplify.");
    }
    store = new FileStore();
  }
  return store;
}
