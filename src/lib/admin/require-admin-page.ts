import "server-only";

import { redirect } from "next/navigation";
import { getAdminAccess } from "@/app/admin/admin-access";

/* Registration is closed to the public after the 2026 championship: the
   registration pages (/register and everything under it, /register-team and
   its success page) are for administrators only. Anyone else, signed in or
   not, is sent to the home page. Each page calls this itself rather than
   leaving it to a shared layout, because a layout is not re-run on every
   request for the page beneath it. The footer's "Registration" link stays. */
export async function requireAdminOrHome() {
  const access = await getAdminAccess();

  if (access.kind !== "admin") {
    redirect("/");
  }

  return access;
}
