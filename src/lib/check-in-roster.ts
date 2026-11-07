// The check-in desk's rider rows, one per confirmation code.
//
// A code belongs to one rider (20261108120000_shared_contact_details): the
// same rider holding a solo entry and a team place under the same name and
// email shares one code, so they are one row with both entries and one
// check-in. Two riders sharing an email or a phone (a family, a club
// contact) have two codes, so they are two rows. Rows are merged by code
// only, never by email or phone.
//
// Pure and dependency-free, so `node --test` loads it directly.

export type RiderMatch = {
  id: string;
  source: "solo" | "team";
  /* Every entry this one code covers: a rider can be both a solo entrant and
     a team rider. */
  entries: Array<"solo" | "team">;
  full_name: string;
  email: string;
  phone: string;
  team_name: string | null;
  /* The team this rider rides for, so the desk can count a team's riders. */
  team_id: string | null;
  is_leader: boolean | null;
  confirmation_code: string;
  checked_in_at: string | null;
};

/* Solo rows first, so a merged row keeps the solo entry's id and source;
   the team label (team name, team id, leader) is filled from the team row. */
export const mergeRidersByCode = (rows: readonly RiderMatch[]): RiderMatch[] => {
  const byCode = new Map<string, RiderMatch>();
  const ordered = [
    ...rows.filter((row) => row.source === "solo"),
    ...rows.filter((row) => row.source !== "solo"),
  ];

  for (const row of ordered) {
    const existing = byCode.get(row.confirmation_code);

    if (!existing) {
      byCode.set(row.confirmation_code, { ...row, entries: [...row.entries] });
      continue;
    }

    existing.entries = [...new Set([...existing.entries, ...row.entries])];
    existing.team_name = existing.team_name ?? row.team_name;
    existing.team_id = existing.team_id ?? row.team_id;
    existing.is_leader = existing.is_leader ?? row.is_leader;
  }

  return [...byCode.values()].sort((first, second) =>
    first.full_name.localeCompare(second.full_name)
  );
};
