// Returns the states/provinces for one country from the vendored GeoNames
// admin1 data, so the full 140KB dataset never ships to the browser.
import { NextResponse } from "next/server";
import statesByCountry from "@/data/states.json";

const countryCodePattern = /^[A-Z]{2}$/;

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get("country") ?? "";

  if (!countryCodePattern.test(country)) {
    return NextResponse.json(
      { error: "Please provide a two-letter country code." },
      { status: 400 }
    );
  }

  const states =
    (statesByCountry as Record<string, Array<{ code: string; name: string }>>)[
      country
    ] ?? [];

  return NextResponse.json(
    { states },
    {
      headers: {
        // The vendored dataset only changes when we regenerate it, so let
        // browsers and the CDN hold onto responses for a day.
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    }
  );
}
