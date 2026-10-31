// Where this device remembers that the admin menu is collapsed: a cookie, so
// the server already knows when it draws the page (no flash, no script, and
// the first render matches on server and browser). Shared by the menu (a
// client component) and the admin layout (server).
export const COLLAPSED_COOKIE = "nezabazi_admin_nav";
