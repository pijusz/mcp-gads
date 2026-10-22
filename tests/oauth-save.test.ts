import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveToken } from "../src/auth/oauth.js";

describe("saveToken", () => {
  test("merges refreshed token into a credentials file with embedded client info", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gads-oauth-"));
    const credPath = join(dir, "token.json");
    const original = {
      client_id: "cid",
      client_secret: "secret",
      refresh_token: "rt",
      access_token: "old",
    };
    writeFileSync(credPath, JSON.stringify(original));

    const merged = await saveToken(
      credPath,
      { access_token: "new", expiry_date: 123, refresh_token: "rt" },
      original,
    );

    const onDisk = JSON.parse(readFileSync(credPath, "utf-8"));
    expect(onDisk).toEqual({
      client_id: "cid",
      client_secret: "secret",
      refresh_token: "rt",
      access_token: "new",
      expiry_date: 123,
    });
    expect(merged).toEqual(onDisk);
    expect(existsSync(join(dir, "token_token.json"))).toBe(false);
  });

  test("writes companion token file for client-config credentials", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gads-oauth-"));
    const credPath = join(dir, "client.json");
    const result = await saveToken(
      credPath,
      { access_token: "a", refresh_token: "r" },
      null,
    );
    expect(result).toBeNull();
    const onDisk = JSON.parse(readFileSync(join(dir, "client_token.json"), "utf-8"));
    expect(onDisk.access_token).toBe("a");
  });
});
