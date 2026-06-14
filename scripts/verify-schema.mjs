import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tables = [
  "clinics",
  "patients",
  "messages",
  "cohort_definitions",
  "cohort_memberships",
  "scheduled_events",
];

for (const table of tables) {
  const { error, count } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.log(`${table}: ERROR — ${error.message}`);
  } else {
    console.log(`${table}: OK (${count} rows)`);
  }
}
