// GET /api/live/vmix/photo/<Rider Name>.png — one rider's photo, at the
// `photo_url` the public vMix feeds hand out (current, leaderboard, entrants).
//
// Public, no key. The name is looked up in the photo index
// (src/lib/broadcast/photo-index.ts) by exact file name, case-insensitively;
// names are unique (a short id is added when two riders share a name). The
// object is read with the service role and sent as stored: the photos are
// JPEGs, so the type is image/jpeg although the name ends in .png. Unknown
// name, no photo or any error: a bare 404, never cached.
import { HEADSHOT_BUCKET } from "@/lib/headshots";
import { createServiceRoleClient } from "@/lib/admin/server";
import { getPhotoIndex } from "@/lib/broadcast/photo-index";
import { vmixPhotoLookupKey } from "@/lib/broadcast/rows";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ file: string }> };

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });

/* The name as sent. Names never hold "%", so one still encoded is decoded. */
const readName = (raw: string) => {
  if (!/%[0-9a-f]{2}/i.test(raw)) {
    return raw;
  }

  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { file } = await context.params;
    const name = readName(file ?? "");

    if (!name || name.length > 300) {
      return notFound();
    }

    const index = await getPhotoIndex();
    const path = index.byVmixFile.get(vmixPhotoLookupKey(name));

    if (!path) {
      return notFound();
    }

    const { data, error } = await createServiceRoleClient()
      .storage.from(HEADSHOT_BUCKET)
      .download(path);

    if (error || !data) {
      return notFound();
    }

    return new Response(data, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return notFound();
  }
}
