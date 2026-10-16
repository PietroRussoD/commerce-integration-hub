export type OperatorRole = "operator" | "platform-admin";

export interface AccessTokenIdentity {
  expiresAt: Date;
  roles: ReadonlySet<OperatorRole>;
  subject: string;
}

export type AccessTokenInspection =
  | { kind: "active"; identity: AccessTokenIdentity }
  | { kind: "expired" }
  | { kind: "invalid" };

const operatorRoles = new Set<OperatorRole>(["operator", "platform-admin"]);

export function inspectAccessToken(token: string, now = Date.now()): AccessTokenInspection {
  const segments = token.split(".");
  if (segments.length !== 3) return { kind: "invalid" };

  try {
    const payload = JSON.parse(decodeBase64Url(segments[1])) as Record<string, unknown>;
    const subject = readNonEmptyString(payload.sub);
    const expirationSeconds = payload.exp;

    if (subject === undefined || typeof expirationSeconds !== "number" || !Number.isFinite(expirationSeconds)) {
      return { kind: "invalid" };
    }

    const expiresAt = new Date(expirationSeconds * 1_000);
    if (!Number.isFinite(expiresAt.getTime())) return { kind: "invalid" };
    if (expiresAt.getTime() <= now) return { kind: "expired" };

    return {
      kind: "active",
      identity: {
        subject,
        expiresAt,
        roles: readRoles(payload.groups),
      },
    };
  } catch {
    return { kind: "invalid" };
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return atob(`${normalized}${"=".repeat(paddingLength)}`);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readRoles(value: unknown): ReadonlySet<OperatorRole> {
  if (!Array.isArray(value)) return new Set();

  return new Set(value.filter((role): role is OperatorRole => typeof role === "string" && operatorRoles.has(role as OperatorRole)));
}
