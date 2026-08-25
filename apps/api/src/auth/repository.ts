export interface AuthorizedUser {
  id: string;
  companyId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  createdAt: number;
  disabledAt: number | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

interface UserRow {
  id: string;
  company_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  created_at: number;
  disabled_at: number | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
}

function mapUser(row: UserRow): AuthorizedUser {
  return {
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: row.password_iterations,
    createdAt: row.created_at,
    disabledAt: row.disabled_at
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at
  };
}

export class AuthRepository {
  constructor(private readonly db: D1Database) {}

  async createUser(input: {
    id: string;
    companyId: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    passwordIterations: number;
    createdAt: number;
  }): Promise<AuthorizedUser> {
    const email = input.email.trim().toLowerCase();
    await this.db
      .prepare(
        `INSERT INTO users (
          id, company_id, email, password_hash, password_salt,
          password_iterations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.companyId,
        email,
        input.passwordHash,
        input.passwordSalt,
        input.passwordIterations,
        input.createdAt
      )
      .run();

    return {
      ...input,
      email,
      disabledAt: null
    };
  }

  async findUserByEmail(email: string): Promise<AuthorizedUser | null> {
    const row = await this.db
      .prepare(
        `SELECT id, company_id, email, password_hash, password_salt,
          password_iterations, created_at, disabled_at
         FROM users
         WHERE email = ? COLLATE NOCASE`
      )
      .bind(email.trim())
      .first<UserRow>();

    return row ? mapUser(row) : null;
  }

  async createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    createdAt: number;
    expiresAt: number;
  }): Promise<SessionRecord> {
    await this.db
      .prepare(
        `INSERT INTO sessions (
          id, user_id, token_hash, created_at, expires_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.userId,
        input.tokenHash,
        input.createdAt,
        input.expiresAt,
        input.createdAt
      )
      .run();

    return { ...input, lastSeenAt: input.createdAt };
  }

  async findActiveSession(tokenHash: string, now: number): Promise<SessionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT s.id, s.user_id, s.token_hash, s.created_at, s.expires_at, s.last_seen_at
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL`
      )
      .bind(tokenHash, now)
      .first<SessionRow>();

    return row ? mapSession(row) : null;
  }
}
