// The registered solo riders, read for the demo: the one place the practice
// session looks at a registration.
//
// "Reset training data" on the live site rebuilds the organisers' demo from
// the riders registered at that moment (training-riders.ts lays them out).
// This file reads them, through the service role, and only the fields the
// panels show: name, horse and location for everyone, and the commentators'
// background facts (parents' names, age, experience, the horse's breed and
// age). Never a phone number, an email address, an emergency contact, a
// confirmation code or a check-in. It only reads; nothing here can change a
// registration.
//
// Desk rows (riders added at the desk only to make up a team) are left out:
// they are not solo entrants.
import "server-only";

import type { TrainingDatabase } from "@/lib/scoring/training-db";
import type { RegisteredRider } from "@/lib/scoring/training-riders";

const SOLO_TABLE = "solo_registrations";

const COLUMNS =
  "id, full_name, horse_name, location, father_name, mother_name, age, years_experience, horse_breed, horse_age";

/* Far above any entry list; a guard against an unbounded read, no more. */
const MAX_RIDERS = 1000;

const whole = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;

const words = (value: unknown) => (typeof value === "string" ? value : null);

/* Every registered solo rider, oldest registration first (the draw shuffles
   them). Throws when the read fails; the caller keeps the sample riders. */
export const loadRegisteredRiders = async (client: TrainingDatabase): Promise<RegisteredRider[]> => {
  const { data, error } = await client
    .from(SOLO_TABLE)
    .select(COLUMNS)
    .neq("registration_source", "desk")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_RIDERS);

  if (error) {
    throw new Error(`Unable to read the registered riders for the demo: ${error.message}`);
  }

  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => typeof row.id === "string" && typeof row.full_name === "string")
    .map((row) => ({
      id: row.id as string,
      full_name: row.full_name as string,
      horse_name: words(row.horse_name),
      location: words(row.location),
      father_name: words(row.father_name),
      mother_name: words(row.mother_name),
      age: whole(row.age),
      years_experience: whole(row.years_experience),
      horse_breed: words(row.horse_breed),
      horse_age: whole(row.horse_age),
    }));
};
