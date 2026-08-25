#!/usr/bin/env node

import { mkdtemp, open, rmdir, unlink } from "node:fs/promises";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ITERATIONS = 210_000;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseEmail(args) {
  if (args.some((arg) => arg === "--password" || arg.startsWith("--password="))) {
    throw new Error("Passwords must be entered through the hidden terminal prompt.");
  }
  const emailIndex = args.indexOf("--email");
  const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: node scripts/create-user.mjs --email name@company.com");
  }
  return email.trim().toLowerCase();
}

async function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("A TTY is required for hidden password entry.");
  }

  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

function escapeSql(value) {
  return value.replaceAll("'", "''");
}

async function runWrangler(sqlFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "--filter",
        "@ad-agent/api",
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--local",
        "--file",
        sqlFile,
        "--yes"
      ],
      { stdio: ["ignore", "ignore", "inherit"] }
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("The local D1 user write failed."));
    });
  });
}

async function main() {
  const email = parseEmail(process.argv.slice(2));
  const pepper = process.env.SESSION_PEPPER;
  if (!pepper) throw new Error("SESSION_PEPPER must be set in the current shell.");

  const password = await promptHidden("Password: ");
  const confirmation = await promptHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");

  const salt = randomBytes(16);
  const hash = pbkdf2Sync(`${password}\u0000${pepper}`, salt, ITERATIONS, 32, "sha256");
  const directory = await mkdtemp(join(tmpdir(), "ad-agent-user-"));
  const sqlFile = join(directory, "create-user.sql");
  const createdAt = Date.now();
  const sql = `INSERT INTO users (
    id, company_id, email, password_hash, password_salt, password_iterations, created_at
  ) VALUES (
    'usr_${randomUUID()}', 'cmp_default', '${escapeSql(email)}',
    '${hash.toString("base64")}', '${salt.toString("base64")}', ${ITERATIONS}, ${createdAt}
  );\n`;

  try {
    const file = await open(sqlFile, "wx", 0o600);
    await file.writeFile(sql, "utf8");
    await file.close();
    await runWrangler(sqlFile);
  } finally {
    await unlink(sqlFile).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
    hash.fill(0);
    salt.fill(0);
  }

  process.stdout.write("Authorized local user created.\n");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "User creation failed.");
});
