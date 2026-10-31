/* Every /admin page shares the admin menu (AdminNav). It is shown to
   administrators only; anyone else sees just the page, which renders its own
   "Login Required" or "Access Denied" message. */
import { cookies } from "next/headers";
import AdminNav from "./AdminNav";
import { getAdminAccess } from "./admin-access";
import { COLLAPSED_COOKIE } from "./admin-nav-state";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();

  if (access.kind !== "admin") {
    return children;
  }

  // Read here so the menu is drawn the way this device last left it, with no
  // flash and the same first render on the server and in the browser.
  const collapsed = (await cookies()).get(COLLAPSED_COOKIE)?.value === "1";

  return (
    <div className="bg-cream lg:flex">
      <AdminNav initialCollapsed={collapsed} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
