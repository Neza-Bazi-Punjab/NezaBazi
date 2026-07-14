// Guided location picker: country + state dropdowns (vendored GeoNames data),
// village autocomplete via /api/locations/search, and a city/district field.
// Emits one combined string — "Village, City, State, Country" — so it drops
// into the existing `location` columns without schema changes.
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import countries from "@/data/countries.json";

type Country = { code: string; name: string };
type StateOption = { code: string; name: string };
type Suggestion = {
  id: number;
  name: string;
  district: string;
  state: string;
  country: string;
};

const countryList = countries as Country[];

const MIN_QUERY_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

const labelClassName =
  "font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink";

// Tailwind's scanner needs literal class strings, so spell out both tones.
const selectClassName = (tone: "sand" | "cream") =>
  tone === "sand"
    ? "mt-2 w-full rounded-lg border border-bronze/20 bg-sand px-4 py-3 text-brown focus:border-bronze focus:outline-none"
    : "mt-2 w-full rounded-lg border border-bronze/20 bg-cream px-4 py-3 text-brown focus:border-bronze focus:outline-none";

const buildLocation = (parts: Array<string | null | undefined>) =>
  parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(", ");

/* Best-effort parse of an existing "Village, City, State, Country" string so
   editing an account reopens the picker with the right selections. Legacy
   free-text values that don't match a known country stay editable manually. */
const parseInitialValue = (value: string) => {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");

  if (parts.length === 0) {
    return { countryCode: "", stateName: "", village: "", city: "", manual: false };
  }

  const lastPart = parts[parts.length - 1].toLowerCase();
  const country = countryList.find((entry) => entry.name.toLowerCase() === lastPart);

  if (!country) {
    return {
      countryCode: "",
      stateName: "",
      village: parts[0] ?? "",
      city: parts.slice(1).join(", "),
      manual: true,
    };
  }

  const middle = parts.slice(0, -1);
  const stateName = middle.length > 1 ? middle[middle.length - 1] : "";
  const localityParts = stateName === "" ? middle : middle.slice(0, -1);

  return {
    countryCode: country.code,
    stateName,
    village: localityParts[0] ?? "",
    city: localityParts.slice(1).join(", "),
    manual: false,
  };
};

function SearchableSelect({
  label,
  options,
  value,
  placeholder,
  disabled = false,
  tone,
  onChange,
}: {
  label: string;
  options: Array<{ code: string; name: string }>;
  value: string;
  placeholder: string;
  disabled?: boolean;
  tone: "sand" | "cream";
  onChange: (code: string) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedName = options.find((option) => option.code === value)?.name ?? "";
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery === "") {
      return options.slice(0, 12);
    }

    return options
      .filter((option) => option.name.toLowerCase().includes(normalizedQuery))
      .sort((first, second) => {
        const firstStarts = first.name.toLowerCase().startsWith(normalizedQuery);
        const secondStarts = second.name.toLowerCase().startsWith(normalizedQuery);

        if (firstStarts !== secondStarts) {
          return firstStarts ? -1 : 1;
        }

        return first.name.localeCompare(second.name);
      })
      .slice(0, 12);
  }, [options, query]);

  const selectOption = (option: { code: string; name: string }) => {
    setQuery(option.name);
    setOpen(false);
    setActiveIndex(0);
    onChange(option.code);
  };

  const commitTypedValue = () => {
    const normalizedQuery = query.trim().toLowerCase();
    const exactMatch = options.find(
      (option) => option.name.toLowerCase() === normalizedQuery,
    );

    if (exactMatch) {
      setQuery(exactMatch.name);
      setOpen(false);

      if (exactMatch.code !== value) {
        onChange(exactMatch.code);
      }
    } else if (normalizedQuery === "") {
      if (value !== "") {
        onChange("");
      }
    } else {
      setQuery(selectedName);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          commitTypedValue();
        }
      }}
    >
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && filteredOptions[activeIndex]
            ? `${listId}-${filteredOptions[activeIndex].code}`
            : undefined
        }
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        className={selectClassName(tone)}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && filteredOptions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => (current + 1) % filteredOptions.length);
          } else if (event.key === "ArrowUp" && filteredOptions.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(
              (current) => (current - 1 + filteredOptions.length) % filteredOptions.length,
            );
          } else if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
            event.preventDefault();
            selectOption(filteredOptions[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery(selectedName);
          }
        }}
      />

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-bronze/30 bg-cream shadow-lg"
        >
          {filteredOptions.map((option, index) => (
            <li
              id={`${listId}-${option.code}`}
              key={option.code}
              role="option"
              aria-selected={option.code === value}
            >
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onPointerUp={() => selectOption(option)}
                className={`block w-full px-4 py-2.5 text-left text-brown transition-colors hover:bg-sand ${
                  index === activeIndex ? "bg-sand" : ""
                }`}
              >
                {option.name}
              </button>
            </li>
          ))}
          {filteredOptions.length === 0 && (
            <li className="px-4 py-3 text-sm text-brown/70">No matches found</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function LocationPicker({
  value,
  onChange,
  tone = "sand",
}: {
  value: string;
  onChange: (value: string) => void;
  tone?: "sand" | "cream";
}) {
  const [initial] = useState(() => parseInitialValue(value));
  const [countryCode, setCountryCode] = useState(initial.countryCode);
  const [states, setStates] = useState<StateOption[]>([]);
  // Loading starts true when a restored country means a fetch is coming.
  const [statesLoading, setStatesLoading] = useState(() => initial.countryCode !== "");
  const [stateCode, setStateCode] = useState("");
  const [village, setVillage] = useState(initial.village);
  const [selectedVillage, setSelectedVillage] = useState(initial.village);
  const [city, setCity] = useState(initial.city);
  const [manualMode, setManualMode] = useState(initial.manual);
  const [searchAvailable, setSearchAvailable] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  /* The state list loads async, so remember the parsed state name until the
     matching option exists; skip emitting onChange while restoring. */
  const pendingStateName = useRef(initial.stateName);
  const restoringRef = useRef(true);
  const searchAbortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const countryName = useMemo(
    () => countryList.find((entry) => entry.code === countryCode)?.name ?? "",
    [countryCode]
  );
  const stateName = useMemo(
    () => states.find((entry) => entry.code === stateCode)?.name ?? pendingStateName.current,
    [states, stateCode]
  );

  const emit = (nextVillage: string, nextCity: string, nextStateName: string, nextCountryName: string) => {
    onChange(buildLocation([nextVillage, nextCity, nextStateName, nextCountryName]));
  };

  // Load states whenever the country changes (including the restored one).
  // Clearing/loading flags are set in the change handlers so this effect only
  // synchronizes with the fetch.
  useEffect(() => {
    if (countryCode === "") {
      return;
    }

    let cancelled = false;

    fetch(`/api/locations/states?country=${countryCode}`)
      .then((response) => response.json())
      .then((payload: { states?: StateOption[] }) => {
        if (cancelled) {
          return;
        }

        const nextStates = payload.states ?? [];
        setStates(nextStates);

        if (pendingStateName.current !== "") {
          const match = nextStates.find(
            (entry) => entry.name.toLowerCase() === pendingStateName.current.toLowerCase()
          );

          if (match) {
            setStateCode(match.code);
          }

          pendingStateName.current = match ? match.name : "";
        }

        restoringRef.current = false;
      })
      .catch(() => {
        if (!cancelled) {
          setStates([]);
          restoringRef.current = false;
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  // Village autocomplete: 3+ characters, debounced 300ms, max 5 suggestions.
  // The "not searchable" cases clear their state in the input handlers; this
  // effect only owns the debounce timer and the fetch.
  useEffect(() => {
    if (manualMode || restoringRef.current) {
      return;
    }

    const query = village.trim();

    if (query.length < MIN_QUERY_LENGTH || query === selectedVillage || countryCode === "") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const searchParams = new URLSearchParams({ country: countryCode, q: query });

      if (stateCode !== "") {
        searchParams.set("state", stateCode);
      }

      fetch(`/api/locations/search?${searchParams}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload: { available?: boolean; suggestions?: Suggestion[] }) => {
          if (payload.available === false) {
            // No GeoNames credential or quota exhausted — switch to manual
            // entry instead of leaving the user stuck.
            setSearchAvailable(false);
            setManualMode(true);
            setSuggestionsOpen(false);
            return;
          }

          setSuggestions(payload.suggestions ?? []);
          setSuggestionsOpen(true);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setSuggestions([]);
            setSuggestionsOpen(false);
          }
        })
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [village, selectedVillage, countryCode, stateCode, manualMode]);

  // Close the suggestion list when clicking outside the picker.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const handleCountryChange = (nextCode: string) => {
    restoringRef.current = false;
    pendingStateName.current = "";
    setCountryCode(nextCode);
    setStates([]);
    setStatesLoading(nextCode !== "");
    setStateCode("");
    setVillage("");
    setSelectedVillage("");
    setCity("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSearching(false);
    onChange("");
  };

  const handleStateChange = (nextCode: string) => {
    restoringRef.current = false;
    pendingStateName.current = "";
    setStateCode(nextCode);
    setVillage("");
    setSelectedVillage("");
    setCity("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSearching(false);
    onChange("");
  };

  const handleVillageInput = (nextVillage: string) => {
    restoringRef.current = false;
    setVillage(nextVillage);

    if (manualMode) {
      setSelectedVillage(nextVillage);
      emit(nextVillage, city, stateName, countryName);
      return;
    }

    if (nextVillage !== selectedVillage) {
      // Typing invalidates the previous pick — the combined value only comes
      // back once the user selects a suggestion (or switches to manual).
      setSelectedVillage("");
      onChange("");
    }

    // The debounce effect only fires for searchable input, so reflect the
    // search state here.
    if (nextVillage.trim().length >= MIN_QUERY_LENGTH && nextVillage !== selectedVillage) {
      setSearching(true);
    } else {
      setSearching(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
    }
  };

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    setVillage(suggestion.name);
    setSelectedVillage(suggestion.name);
    setCity(suggestion.district);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSearching(false);
    emit(
      suggestion.name,
      suggestion.district,
      suggestion.state !== "" ? suggestion.state : stateName,
      suggestion.country !== "" ? suggestion.country : countryName
    );
  };

  const handleCityChange = (nextCity: string) => {
    setCity(nextCity);

    if (selectedVillage !== "" || manualMode) {
      emit(village, nextCity, stateName, countryName);
    }
  };

  const enableManualMode = () => {
    setManualMode(true);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSearching(false);
    setSelectedVillage(village);

    if (village.trim() !== "") {
      emit(village, city, stateName, countryName);
    }
  };

  const disableManualMode = () => {
    setManualMode(false);
    setVillage("");
    setSelectedVillage("");
    setCity("");
    onChange("");
  };

  const showUnconfirmedHint =
    !manualMode &&
    selectedVillage === "" &&
    village.trim().length >= MIN_QUERY_LENGTH &&
    !searching &&
    !suggestionsOpen;

  return (
    <div ref={containerRef} className="space-y-4">
      <SearchableSelect
        label="Country"
        options={countryList}
        value={countryCode}
        placeholder="Type or select a country"
        tone={tone}
        onChange={handleCountryChange}
      />

      {countryCode !== "" && (states.length > 0 || statesLoading) && (
        <SearchableSelect
          key={`state-${countryCode}-${statesLoading ? "loading" : stateCode}`}
          label="State / Province"
          options={states}
          value={stateCode}
          placeholder={statesLoading ? "Loading..." : "Type or select a state"}
          disabled={statesLoading}
          tone={tone}
          onChange={handleStateChange}
        />
      )}

      {countryCode !== "" && (
        <div className="relative">
          <label className={labelClassName}>Village / Locality</label>
          <input
            type="text"
            value={village}
            onChange={(e) => handleVillageInput(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) {
                setSuggestionsOpen(true);
              }
            }}
            placeholder={
              manualMode ? "Type your village or locality" : "Start typing — e.g. Ladh…"
            }
            autoComplete="off"
            className={selectClassName(tone)}
          />

          {suggestionsOpen && !manualMode && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-bronze/30 bg-cream shadow-lg">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    onClick={() => handleSuggestionSelect(suggestion)}
                    className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-sand"
                  >
                    <span className="block font-semibold text-brown">{suggestion.name}</span>
                    <span className="block text-xs text-brown/70">
                      {buildLocation([suggestion.district, suggestion.state, suggestion.country])}
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={enableManualMode}
                  className="block w-full border-t border-bronze/20 px-4 py-2.5 text-left text-sm text-bronze-deep underline transition-colors hover:bg-sand"
                >
                  {suggestions.length === 0
                    ? "No matches — enter it manually"
                    : "Can't find your village? Enter it manually"}
                </button>
              </li>
            </ul>
          )}

          {searching && <p className="mt-1 text-xs text-brown/60">Searching…</p>}

          {showUnconfirmedHint && (
            <p className="mt-1 text-xs text-brown/70">
              Select a suggestion from the list, or{" "}
              <button
                type="button"
                onClick={enableManualMode}
                className="font-semibold text-bronze-deep underline"
              >
                enter it manually
              </button>
              .
            </p>
          )}

          {manualMode && searchAvailable && (
            <p className="mt-1 text-xs text-brown/70">
              Manual entry.{" "}
              <button
                type="button"
                onClick={disableManualMode}
                className="font-semibold text-bronze-deep underline"
              >
                Search suggestions instead
              </button>
            </p>
          )}

          {manualMode && !searchAvailable && (
            <p className="mt-1 text-xs text-brown/70">
              Suggestions are unavailable right now — type your village manually.
            </p>
          )}
        </div>
      )}

      {countryCode !== "" && (selectedVillage !== "" || manualMode) && (
        <div>
          <label className={labelClassName}>Nearby City / District</label>
          <input
            type="text"
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            placeholder="e.g. Jalandhar"
            autoComplete="off"
            className={selectClassName(tone)}
          />
        </div>
      )}

      {value !== "" && (
        <p className="text-xs text-brown/70">
          Saved as: <span className="font-semibold text-brown">{value}</span>
        </p>
      )}
    </div>
  );
}
