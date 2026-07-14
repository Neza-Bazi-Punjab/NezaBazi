// Village/locality autocomplete. Proxies the GeoNames place search so the
// GEONAMES_USERNAME credential stays server-side; the client sends the chosen
// country code, GeoNames admin1 (state) code, and at least 3 typed characters.
import { NextResponse } from "next/server";

type GeoNamesPlace = {
  geonameId: number;
  name: string;
  adminName1?: string;
  adminName2?: string;
  countryName?: string;
};

export type LocationSuggestion = {
  id: number;
  name: string;
  district: string;
  state: string;
  country: string;
};

const countryCodePattern = /^[A-Z]{2}$/;
const stateCodePattern = /^[A-Za-z0-9.-]{1,20}$/;

// Small in-memory cache so repeated keystrokes and popular villages don't
// burn through the GeoNames hourly rate limit. Entries expire after 10 min.
const cache = new Map<string, { expires: number; suggestions: LocationSuggestion[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const readCache = (key: string) => {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.suggestions;
};

const writeCache = (key: string, suggestions: LocationSuggestion[]) => {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, suggestions });
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const country = params.get("country") ?? "";
  const state = params.get("state") ?? "";
  const query = (params.get("q") ?? "").trim();

  if (!countryCodePattern.test(country)) {
    return NextResponse.json(
      { error: "Please provide a two-letter country code." },
      { status: 400 }
    );
  }

  if (state !== "" && !stateCodePattern.test(state)) {
    return NextResponse.json({ error: "Please provide a valid state code." }, { status: 400 });
  }

  if (query.length < 3 || query.length > 100) {
    return NextResponse.json(
      { error: "Please type at least 3 characters." },
      { status: 400 }
    );
  }

  const username = process.env.GEONAMES_USERNAME;

  if (!username) {
    // Autocomplete is optional infrastructure — without the credential the
    // picker falls back to manual entry instead of failing the form.
    return NextResponse.json({ available: false, suggestions: [] });
  }

  const cacheKey = `${country}|${state}|${query.toLowerCase()}`;
  const cached = readCache(cacheKey);

  if (cached) {
    return NextResponse.json({ available: true, suggestions: cached });
  }

  const geoNamesUrl = new URL("https://secure.geonames.org/searchJSON");
  geoNamesUrl.searchParams.set("name_startsWith", query);
  geoNamesUrl.searchParams.set("country", country);
  geoNamesUrl.searchParams.set("featureClass", "P"); // populated places only
  geoNamesUrl.searchParams.set("maxRows", "5");
  geoNamesUrl.searchParams.set("orderby", "population");
  geoNamesUrl.searchParams.set("style", "FULL"); // FULL includes adminName2 (district)
  geoNamesUrl.searchParams.set("isNameRequired", "true");
  geoNamesUrl.searchParams.set("username", username);

  if (state !== "") {
    geoNamesUrl.searchParams.set("adminCode1", state);
  }

  try {
    const response = await fetch(geoNamesUrl, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      console.error("GeoNames search failed with HTTP status", response.status);
      return NextResponse.json({ available: false, suggestions: [] });
    }

    const payload = (await response.json()) as {
      geonames?: GeoNamesPlace[];
      status?: { message?: string; value?: number };
    };

    if (payload.status) {
      // GeoNames reports quota/credential problems inside a 200 response.
      console.error("GeoNames search error", payload.status);
      return NextResponse.json({ available: false, suggestions: [] });
    }

    const seen = new Set<string>();
    const suggestions: LocationSuggestion[] = [];

    for (const place of payload.geonames ?? []) {
      const suggestion: LocationSuggestion = {
        id: place.geonameId,
        name: place.name,
        district: place.adminName2 ?? "",
        state: place.adminName1 ?? "",
        country: place.countryName ?? "",
      };
      const dedupeKey = `${suggestion.name}|${suggestion.district}`.toLowerCase();

      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        suggestions.push(suggestion);
      }
    }

    writeCache(cacheKey, suggestions);

    return NextResponse.json({ available: true, suggestions });
  } catch (error) {
    console.error("GeoNames search request failed", error);
    return NextResponse.json({ available: false, suggestions: [] });
  }
}
