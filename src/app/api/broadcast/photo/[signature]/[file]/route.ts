// GET /api/broadcast/photo/<signature>/<encoded path>.jpg — one rider photo,
// at the permanent link the broadcast feeds hand out (src/lib/broadcast/photo-link.ts).
//
// No ?key=: the signature is the permission. It is checked in constant time,
// then the path must be a rider photo's shape (an account's own folder or a
// registration's `paper/<id>/`), then the object is read with the service
// role and sent. One storage path always holds the same bytes, so the answer
// is cached for good at the CDN edge; no database, Auth or signing call is
// made for a cached picture. Anything wrong is a bare 404, never cached.
import { HEADSHOT_BUCKET } from "@/lib/headshots";
import { createServiceRoleClient } from "@/lib/admin/server";
import { readBroadcastSecret } from "@/lib/broadcast/key";
import { readPhotoLink } from "@/lib/broadcast/photo-link";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ signature: string; file: string }> };

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { signature, file } = await context.params;
    const path = readPhotoLink(readBroadcastSecret(), signature, file);

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
        "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return notFound();
  }
}
