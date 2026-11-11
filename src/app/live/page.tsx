import { redirect } from "next/navigation";

// /live is taken down for now: visitors go to /stats, where updated
// leaderboards and statistics are coming soon. The live board itself
// (LiveBoard.tsx) is kept, so bringing it back is putting this page back.
export default function LivePage() {
  redirect("/stats");
}
