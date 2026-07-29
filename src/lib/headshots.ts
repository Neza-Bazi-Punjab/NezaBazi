/* Shared rules for rider headshots.

   Riders register from phones, so a photo arrives however the phone hands it
   over: an iPhone shoots HEIC by default and a modern camera file is happily
   8-12 MB. Rather than rejecting those, the browser decodes, rotates,
   downscales and re-encodes every photo to JPEG before it is uploaded. That
   means the bucket only ever receives modest JPEGs, and the rider never sees
   "unsupported format" for a photo their own phone just took. */

export const HEADSHOT_BUCKET = "rider-headshots";

/* `image/*` on purpose. Naming specific types narrows the picker on some
   Android browsers — sometimes hiding the camera entirely — and would refuse
   HEIC outright on iOS. Anything the phone offers is accepted here and
   normalised below. No `capture` attribute either: setting it forces the
   camera and takes away the gallery. */
export const HEADSHOT_ACCEPT = "image/*";

/* Ceiling on the file as it leaves the phone, before processing. Generous:
   this exists only to stop something absurd being decoded. */
export const HEADSHOT_MAX_SOURCE_BYTES = 30 * 1024 * 1024;

/* What actually gets stored, after downscaling. */
export const HEADSHOT_MAX_EDGE = 1200;
export const HEADSHOT_JPEG_QUALITY = 0.85;
export const HEADSHOT_UPLOAD_TYPE = "image/jpeg";

/* How long a display URL stays valid. Long enough to load and linger on a
   page, short enough that a copied link stops working. */
export const HEADSHOT_SIGNED_URL_SECONDS = 60 * 60;

export const describeHeadshotLimits = () =>
  "Take a photo or choose one from your gallery.";

/* Returns an error message, or null when the file is worth processing. */
export const validateHeadshotSource = (file: File) => {
  // HEIC from an iPhone sometimes arrives with an empty type, so an empty
  // string is allowed through and left for the decoder to accept or reject.
  if (file.type !== "" && !file.type.startsWith("image/")) {
    return "That file isn't an image. Take a photo or choose one from your gallery.";
  }

  if (file.size > HEADSHOT_MAX_SOURCE_BYTES) {
    return "That photo is very large. Try another one, or a lower camera resolution.";
  }

  return null;
};

const drawToBlob = (
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob | null> => {
  const scale = Math.min(1, HEADSHOT_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");

  if (!context) {
    return Promise.resolve(null);
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) =>
    canvas.toBlob(resolve, HEADSHOT_UPLOAD_TYPE, HEADSHOT_JPEG_QUALITY)
  );
};

/* Decodes with createImageBitmap where available — it honours the EXIF
   orientation flag, which is what stops a portrait phone photo arriving on its
   side — and falls back to an <img>, which modern browsers also auto-rotate. */
const decode = async (file: File) => {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Older Safari rejects the options argument; fall through.
      try {
        return await createImageBitmap(file);
      } catch {
        // Format the browser cannot decode — HEIC outside Safari, typically.
      }
    }
  }

  return new Promise<HTMLImageElement | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
};

export type PreparedHeadshot = { blob: Blob; extension: "jpg" };

/* Turns whatever the phone produced into a modest, correctly-rotated JPEG.
   Returns null when the browser cannot decode the file at all — an HEIC
   picked in Chrome on Android, for instance — so the caller can say something
   useful rather than uploading a file nothing can display. */
export const prepareHeadshot = async (
  file: File
): Promise<PreparedHeadshot | null> => {
  const decoded = await decode(file);

  if (!decoded) {
    return null;
  }

  const width =
    "width" in decoded ? decoded.width : (decoded as HTMLImageElement).naturalWidth;
  const height =
    "height" in decoded
      ? decoded.height
      : (decoded as HTMLImageElement).naturalHeight;

  if (!width || !height) {
    return null;
  }

  const blob = await drawToBlob(decoded, width, height);

  if ("close" in decoded && typeof decoded.close === "function") {
    decoded.close();
  }

  return blob ? { blob, extension: "jpg" } : null;
};

/* Objects live at `<profile_id>/<random>.jpg`. The first segment is what the
   storage policies check, so it must be the owner's id. The random second
   segment means replacing a photo writes a new object rather than overwriting
   one, which sidesteps stale cached copies of the old image. */
export const buildHeadshotPath = (profileId: string) => {
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;

  return `${profileId}/${unique}.jpg`;
};
