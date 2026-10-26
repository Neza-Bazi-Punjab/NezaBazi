// Possible duplicates for the paper entry panel, checked while the
// administrator types: a rider who also registered online, or whose form was
// already keyed in, should be caught before a second entry is made. Advisory
// only — admin_create_paper_registration enforces uniqueness on its own.
//
// GET /api/admin/paper-registration/matches?phone=…&name=…&email=…
import { NextResponse } from "next/server";
import { createServiceRoleClient, verifyAdminRequest } from "@/lib/admin/server";
import { isValidEmail } from "@/lib/email-address";
import { displayEmail, isPaperPlaceholderEmail } from "@/lib/paper-registration";
import { escapeIlikePattern } from "@/lib/supabase/query";

export const dynamic = "force-dynamic";

/* Rider contact details: never cached by a browser or the CDN. */
const NO_STORE = { "Cache-Control": "private, no-store" };

const MATCH_LIMIT = 10;
const MIN_NAME_LENGTH = 3;
const MIN_PHONE_DIGITS = 6;

type MatchReason = "phone" | "email" | "name";

type PaperMatch = {
  id: string;
  source: "solo" | "team";
  full_name: string;
  phone: string;
  email: string;
  team_name: string | null;
  is_leader: boolean;
  registration_source: string | null;
  confirmation_code: string | null;
  matched_on: MatchReason[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown) => (typeof value === "string" ? value : null);

/* PostgREST returns an embedded relation as an object or a one-element
   array, depending on what it can prove about the join. */
const readTeam = (value: unknown) => {
  const team = Array.isArray(value) ? value[0] : value;

  if (!isRecord(team)) {
    return { team_name: null, registration_source: null };
  }

  return {
    team_name: readString(team.team_name),
    registration_source: readString(team.registration_source),
  };
};

const readRow = (
  row: unknown,
  source: "solo" | "team",
  reason: MatchReason
): PaperMatch | null => {
  if (!isRecord(row)) {
    return null;
  }

  const id = readString(row.id);
  const fullName = readString(row.full_name);

  if (!id || fullName === null) {
    return null;
  }

  const team = source === "team" ? readTeam(row.teams) : null;

  return {
    id,
    source,
    full_name: fullName,
    phone: readString(row.phone) ?? "",
    email: displayEmail(readString(row.email)),
    team_name: team?.team_name ?? null,
    is_leader: row.is_leader === true,
    registration_source: team ? team.registration_source : readString(row.registration_source),
    confirmation_code: readString(row.confirmation_code),
    matched_on: [reason],
  };
};

/* "98765 43210", "+91-98765-43210" and "9876543210" are one number. The last
   ten digits, with a wildcard between each, match all of them. */
const phonePattern = (phone: string) => {
  const digits = phone.replace(/\D/g, "");

  if (digits.length < MIN_PHONE_DIGITS) {
    return null;
  }

  return `%${digits.slice(-10).split("").join("%")}%`;
};

export async function GET(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const params = new URL(request.url).searchParams;
  const name = (params.get("name") ?? "").trim().slice(0, 200);
  const phone = (params.get("phone") ?? "").trim().slice(0, 30);
  const email = (params.get("email") ?? "").trim().toLowerCase().slice(0, 254);

  // Each column is its own query rather than one PostgREST `or` filter, so a
  // name containing a comma or bracket cannot break the filter syntax, and
  // LIKE wildcards typed into the name stay literal.
  const lookups: Array<{ reason: MatchReason; column: string; pattern: string }> = [];
  const phoneLike = phonePattern(phone);

  if (phoneLike) {
    lookups.push({ reason: "phone", column: "phone", pattern: phoneLike });
  }

  if (isValidEmail(email) && !isPaperPlaceholderEmail(email)) {
    lookups.push({ reason: "email", column: "email", pattern: escapeIlikePattern(email) });
  }

  if (name.length >= MIN_NAME_LENGTH) {
    lookups.push({ reason: "name", column: "full_name", pattern: `%${escapeIlikePattern(name)}%` });
  }

  if (lookups.length === 0) {
    return NextResponse.json({ matches: [] }, { headers: NO_STORE });
  }

  const serviceSupabase = createServiceRoleClient();
  const [soloResults, teamResults] = await Promise.all([
    Promise.all(
      lookups.map((lookup) =>
        serviceSupabase
          .from("solo_registrations")
          .select("id, full_name, phone, email, confirmation_code, registration_source")
          .ilike(lookup.column, lookup.pattern)
          .limit(MATCH_LIMIT)
      )
    ),
    Promise.all(
      lookups.map((lookup) =>
        serviceSupabase
          .from("team_members")
          .select(
            "id, full_name, phone, email, confirmation_code, is_leader, teams(team_name, registration_source)"
          )
          .ilike(lookup.column, lookup.pattern)
          .limit(MATCH_LIMIT)
      )
    ),
  ]);

  const failure = [...soloResults, ...teamResults].find((result) => result.error);

  if (failure?.error) {
    console.error("Paper registration duplicate check failed", failure.error);
    return NextResponse.json(
      { error: "Could not check for existing registrations." },
      { status: 500, headers: NO_STORE }
    );
  }

  const byEntry = new Map<string, PaperMatch>();

  const collect = (source: "solo" | "team", results: typeof soloResults | typeof teamResults) => {
    results.forEach((result, index) => {
      const reason = lookups[index].reason;

      for (const row of result.data ?? []) {
        const match = readRow(row, source, reason);

        if (!match) {
          continue;
        }

        const key = `${source}:${match.id}`;
        const existing = byEntry.get(key);

        if (existing) {
          existing.matched_on = [...new Set([...existing.matched_on, reason])];
        } else {
          byEntry.set(key, match);
        }
      }
    });
  };

  collect("solo", soloResults);
  collect("team", teamResults);

  // A shared phone or email is a far stronger signal than a similar name.
  const strength = (match: PaperMatch) =>
    match.matched_on.includes("phone") || match.matched_on.includes("email") ? 0 : 1;

  const matches = [...byEntry.values()]
    .sort(
      (first, second) =>
        strength(first) - strength(second) || first.full_name.localeCompare(second.full_name)
    )
    .slice(0, MATCH_LIMIT);

  return NextResponse.json({ matches }, { headers: NO_STORE });
}
