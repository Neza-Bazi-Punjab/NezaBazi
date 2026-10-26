#!/usr/bin/env node
// vMix bridge: pushes the live scoring feed into a vMix title.
//
// Reads <site>/api/live/vmix/current (a JSON array holding one flat row: the
// round, the called and next pool, the rider on course, the last result …)
// every --interval milliseconds, and sends each value that changed since the
// last push to a field of a vMix title through vMix's local HTTP API:
//
//   GET http://<vmix>/API/?Function=SetText&Input=<input>&SelectedName=<field>.Text&Value=<value>
//
// Run it on the vMix computer (or any computer that can reach both the
// website and vMix) and leave it running for the day:
//
//   node scripts/vmix-bridge.mjs --input "Scorebug" --only rider_name,team_name,round_name
//
// Which of the three vMix routes to use (docs/vmix-data-feed.md is the
// graphics team's handout; docs/live-stream.md has the detail):
//
//   * Data Source (Settings -> Data Sources -> JSON or CSV, one of the four
//     /api/live/vmix/* URLs). vMix polls the feed itself and each title field
//     is bound to a column in the Title Designer. No extra software, and the
//     only route for the feeds with many rows (leaderboard, entrants,
//     rounds). The default for a graphics team building its own titles.
//   * This bridge. For a title that already exists and whose field names you
//     would rather map on the command line (--map rider_name=Name) than bind
//     one by one; for driving several titles from one feed (one bridge per
//     title); or when you want vMix touched only when a value actually
//     changes. It handles the one-row "current" feed only.
//   * Web Browser input (Add Input -> Web Browser, one of the /overlay pages).
//     Optional ready-made graphics in the website's style, transparent
//     background, nothing to design or bind.
//
// Before event day the live feed is empty; --sample reads the rehearsal data
// (?sample=1) instead, every row marked sample = "Yes".
//
// Behaviour worth knowing:
//   * The first pass sends every selected value; after that only changes.
//   * When the website cannot be read (offline, 503 while scoring is not set
//     up), vMix keeps what it shows and the bridge retries with exponential
//     backoff, capped at 10 s. Same when vMix cannot be reached; once it is
//     back, every value is sent again, because vMix may have restarted.
//   * vMix refusing one field (say, a field name the title does not have) is
//     logged once and retried on later passes; the other fields carry on.
//   * Exits non-zero only on bad arguments. Ctrl+C stops it cleanly.
//
// Node 24, no dependencies. It only ever makes GET requests: one a second to
// a public, edge-cached endpoint of the website, and SetText calls to vMix.

import { parseArgs } from "node:util";

const DEFAULT_SITE = "https://www.nezabazipunjab.com";
const DEFAULT_VMIX = "http://127.0.0.1:8088";
const FEED_PATH = "/api/live/vmix/current";
const DEFAULT_INTERVAL_MS = 1_000;
const MIN_INTERVAL_MS = 200;
const MAX_INTERVAL_MS = 60_000;
const MAX_BACKOFF_MS = 10_000;
const SITE_TIMEOUT_MS = 5_000;
const VMIX_TIMEOUT_MS = 3_000;
const KEY_PATTERN = /^[A-Za-z0-9_]+$/;
const USER_AGENT = "nbp-vmix-bridge/1";

const USAGE = `Usage: node scripts/vmix-bridge.mjs --input <title> [options]

Pushes the live scoring feed (${FEED_PATH}) into a vMix title,
one SetText call per value that changed.

Options:
  --input <name|number>  The vMix title input to update: its name as shown in
                         vMix, or its number. Required.
  --site <url>           Website to read. Default ${DEFAULT_SITE}
  --vmix <url>           vMix HTTP API address. Default ${DEFAULT_VMIX}
  --interval <ms>        How often to read the feed. Default ${DEFAULT_INTERVAL_MS}, minimum ${MIN_INTERVAL_MS}.
  --map key=Field        Send feed column "key" to the title field "Field"
                         (".Text" is added unless the name already ends in it).
                         Repeatable. A column without --map goes to the field
                         of the same name.
  --only key1,key2       Send only these columns. Recommended: list the fields
                         your title actually has.
  --sample               Read the rehearsal data (?sample=1) instead of the
                         live feed, for building and testing titles before
                         event day. Every row carries sample = "Yes".
  --once                 One pass, then exit.
  --dry-run              Print what would be sent instead of contacting vMix.
  -h, --help             Show this help.

To see every column and its current value:
  node scripts/vmix-bridge.mjs --input x --dry-run --once
To see the same with rehearsal values:
  node scripts/vmix-bridge.mjs --input x --dry-run --once --sample

Example:
  node scripts/vmix-bridge.mjs --input "Scorebug" \\
    --only rider_name,team_name,round_name,pool_label,last_result \\
    --map rider_name=Name --map team_name=Team

Full instructions: docs/vmix-data-feed.md and docs/live-stream.md`;

class UsageError extends Error {}

/* Arguments ----------------------------------------------------------------- */

const parseHttpUrl = (value, option) => {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`--${option} must be a full address such as ${option === "site" ? DEFAULT_SITE : DEFAULT_VMIX}, not "${value}".`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError(`--${option} must start with http:// or https://.`);
  }

  return url;
};

const parseCommandLine = (argv) => {
  let parsed;

  try {
    parsed = parseArgs({
      args: argv,
      options: {
        site: { type: "string" },
        vmix: { type: "string" },
        input: { type: "string" },
        interval: { type: "string" },
        map: { type: "string", multiple: true },
        only: { type: "string", multiple: true },
        sample: { type: "boolean" },
        once: { type: "boolean" },
        "dry-run": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const { values } = parsed;

  if (values.help) {
    return { help: true };
  }

  const input = values.input?.trim() ?? "";

  if (input === "") {
    throw new UsageError("--input is required: the name or number of the vMix title to update.");
  }

  const siteUrl = parseHttpUrl(values.site?.trim() || DEFAULT_SITE, "site");
  const vmixUrl = parseHttpUrl(values.vmix?.trim() || DEFAULT_VMIX, "vmix");

  let interval = DEFAULT_INTERVAL_MS;

  if (values.interval !== undefined) {
    const raw = values.interval.trim();

    if (!/^\d+$/.test(raw)) {
      throw new UsageError(`--interval must be a whole number of milliseconds, not "${values.interval}".`);
    }

    interval = Number(raw);

    if (interval < MIN_INTERVAL_MS || interval > MAX_INTERVAL_MS) {
      throw new UsageError(`--interval must be between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS} ms.`);
    }
  }

  const map = new Map();

  for (const entry of values.map ?? []) {
    const separator = entry.indexOf("=");
    const key = separator === -1 ? "" : entry.slice(0, separator).trim();
    const field = separator === -1 ? "" : entry.slice(separator + 1).trim();

    if (!KEY_PATTERN.test(key) || field === "" || /[\u0000-\u001f]/.test(field)) {
      throw new UsageError(`--map takes key=FieldName, for example --map rider_name=Name; got "${entry}".`);
    }

    if (map.has(key)) {
      throw new UsageError(`--map ${key} is given more than once.`);
    }

    map.set(key, field);
  }

  let only = null;

  if (values.only !== undefined) {
    only = values.only
      .flatMap((entry) => entry.split(","))
      .map((key) => key.trim())
      .filter(Boolean);

    if (only.length === 0) {
      throw new UsageError("--only needs at least one column name, for example --only rider_name,team_name.");
    }

    const invalid = only.find((key) => !KEY_PATTERN.test(key));

    if (invalid) {
      throw new UsageError(`--only: "${invalid}" is not a column name.`);
    }

    only = [...new Set(only)];
  }

  const sitePath = siteUrl.pathname.replace(/\/+$/, "");
  const feedUrl = new URL(`${sitePath}${FEED_PATH}`, siteUrl.origin);

  if (values.sample === true) {
    feedUrl.searchParams.set("sample", "1");
  }

  return {
    help: false,
    input,
    feedUrl: feedUrl.href,
    vmixApi: new URL("/API/", vmixUrl.origin).href,
    interval,
    map,
    only,
    once: values.once === true,
    dryRun: values["dry-run"] === true,
  };
};

/* Output -------------------------------------------------------------------- */

const pad = (value, width = 2) => String(value).padStart(width, "0");

const stamp = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
};

const log = (message) => console.log(`${stamp()}  ${message}`);
const warn = (message) => console.warn(`${stamp()}  ${message}`);

const shown = (text) => {
  const quoted = JSON.stringify(text);
  return quoted.length > 90 ? `${quoted.slice(0, 87)}…"` : quoted;
};

const describeError = (error) => {
  if (error && typeof error === "object") {
    const cause = "cause" in error ? error.cause : null;

    if (cause && typeof cause === "object" && "message" in cause && cause.message) {
      return String(cause.message);
    }

    if ("message" in error && error.message) {
      return String(error.message);
    }
  }

  return String(error);
};

const seconds = (ms) => `${Number((ms / 1000).toFixed(1))} s`;

/* HTTP ---------------------------------------------------------------------- */

const inFlight = new Set();

/* GET with a timeout. Reads the whole body inside the timeout, so a server
   that stalls mid-response cannot hang a pass. Aborted on shutdown. */
const httpGet = async (url, timeoutMs, headers = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`no answer within ${seconds(timeoutMs)}`)),
    timeoutMs
  );
  inFlight.add(controller);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, ...headers },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
    inFlight.delete(controller);
  }
};

/* vMix answered, but with an error status: the request reached it and it said
   no (unknown input, unknown field …). Not a connection problem. */
class VmixRefusedError extends Error {
  constructor(status, detail) {
    super(`vMix answered HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.signature = `${status}|${detail}`;
  }
}

/* The bridge ----------------------------------------------------------------- */

const toText = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const fieldName = (name) => (/\.text$/i.test(name) ? name : `${name}.Text`);

const run = async (config) => {
  const { input, feedUrl, vmixApi, interval, map, only, once, dryRun } = config;

  /* field -> the value vMix was last given */
  const sent = new Map();
  /* field -> the last refusal logged for it, so a bad field name is reported
     once rather than every second */
  const refusals = new Map();
  let failures = 0;
  let siteDown = false;
  let vmixDown = false;
  let checkedColumns = false;
  let stopping = false;

  const stopController = new AbortController();

  const stop = (signal) => {
    if (stopping) {
      // A second Ctrl+C while a request is still finishing: leave at once.
      process.exit(0);
    }

    stopping = true;
    log(`${signal} received, stopping.`);

    for (const controller of inFlight) {
      controller.abort(new Error("stopped"));
    }

    stopController.abort();
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const sleep = (ms) =>
    new Promise((resolve) => {
      if (stopController.signal.aborted) {
        resolve();
        return;
      }

      const onStop = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        stopController.signal.removeEventListener("abort", onStop);
        resolve();
      }, ms);
      stopController.signal.addEventListener("abort", onStop, { once: true });
    });

  const readRow = async () => {
    const response = await httpGet(feedUrl, SITE_TIMEOUT_MS, { accept: "application/json" });
    let body;

    try {
      body = JSON.parse(response.text);
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      const detail =
        body && typeof body === "object" && typeof body.error === "string" ? `: ${body.error}` : "";
      throw new Error(`HTTP ${response.status}${detail}`);
    }

    const row = Array.isArray(body) ? body[0] : undefined;

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("unexpected response (expected a JSON array holding one row)");
    }

    return row;
  };

  const setText = async (field, text) => {
    const url =
      `${vmixApi}?Function=SetText` +
      `&Input=${encodeURIComponent(input)}` +
      `&SelectedName=${encodeURIComponent(field)}` +
      `&Value=${encodeURIComponent(text)}`;

    if (dryRun) {
      return url;
    }

    const response = await httpGet(url, VMIX_TIMEOUT_MS);

    if (!response.ok) {
      throw new VmixRefusedError(response.status, response.text.trim().replace(/\s+/g, " ").slice(0, 160));
    }

    return url;
  };

  /* One pass: read the feed, send what changed. Returns null when it went
     through, otherwise a sentence saying what failed. */
  const pass = async () => {
    let row;

    try {
      row = await readRow();
    } catch (error) {
      if (stopping) {
        return null;
      }

      siteDown = true;
      return `Cannot read ${feedUrl} (${describeError(error)}).`;
    }

    if (siteDown) {
      siteDown = false;
      log("The website answers again.");
    }

    const columns = Object.keys(row);

    if (!checkedColumns) {
      checkedColumns = true;
      const named = [...new Set([...(only ?? []), ...map.keys()])];

      for (const key of named.filter((name) => !columns.includes(name))) {
        warn(`"${key}" is not a column of the feed and will never be sent. Columns: ${columns.join(", ")}.`);
      }
    }

    const keys = only ? only.filter((key) => columns.includes(key)) : columns;

    for (const key of keys) {
      if (stopping) {
        return null;
      }

      const field = fieldName(map.get(key) ?? key);
      const text = toText(row[key]);

      if (sent.get(field) === text) {
        continue;
      }

      let url;

      try {
        url = await setText(field, text);
      } catch (error) {
        if (stopping) {
          return null;
        }

        if (error instanceof VmixRefusedError) {
          if (refusals.get(field) !== error.signature) {
            refusals.set(field, error.signature);
            warn(
              `${key} -> ${field}: ${error.message}. Check --input "${input}" and that the title has a field named ${field}. Retrying on later passes.`
            );
          }

          continue;
        }

        // vMix itself is unreachable. Forget what it was showing: it may be
        // restarting, and every value goes again once it answers.
        vmixDown = true;
        sent.clear();
        return `Cannot reach vMix at ${vmixApi} (${describeError(error)}).`;
      }

      if (vmixDown) {
        vmixDown = false;
        log("vMix answers again; sending every value.");
      }

      if (refusals.delete(field)) {
        log(`${field} accepted again.`);
      }

      sent.set(field, text);
      log(dryRun ? `[dry run] ${key} -> ${field} = ${shown(text)}  GET ${url}` : `${key} -> ${field} = ${shown(text)}`);
    }

    return null;
  };

  log(
    `Reading ${feedUrl} every ${seconds(interval)}; ${dryRun ? "dry run, not sending to" : "sending to"} vMix input "${input}" at ${vmixApi}.`
  );

  if (only) {
    for (const key of [...map.keys()].filter((name) => !only.includes(name))) {
      warn(`--map ${key} is ignored: "${key}" is not listed in --only.`);
    }

    log(`Columns: ${only.map((key) => `${key} -> ${fieldName(map.get(key) ?? key)}`).join(", ")}.`);
  } else if (map.size > 0) {
    log(
      `Every column, to the field of the same name except ${[...map]
        .map(([key, field]) => `${key} -> ${fieldName(field)}`)
        .join(", ")}.`
    );
  }

  while (!stopping) {
    let failure;

    try {
      failure = await pass();
    } catch (error) {
      // Nothing above should throw, but the bridge must not crash on air.
      failure = `Unexpected error: ${describeError(error)}.`;
    }

    if (stopping) {
      break;
    }

    if (once) {
      if (failure) {
        warn(failure);
      }

      log("Single pass done (--once).");
      break;
    }

    let delay = interval;

    if (failure) {
      failures += 1;
      delay = Math.max(interval, Math.min(MAX_BACKOFF_MS, interval * 2 ** failures));
      warn(`${failure} Retrying in ${seconds(delay)}.`);
    } else {
      failures = 0;
    }

    await sleep(delay);
  }

  if (stopping) {
    log("Stopped.");
  }
};

/* Entry point ---------------------------------------------------------------- */

let config;

try {
  config = parseCommandLine(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`vmix-bridge: ${error.message}`);
    console.error("Run with --help to see every option.");
    process.exit(2);
  }

  throw error;
}

if (config.help) {
  console.log(USAGE);
} else {
  process.on("unhandledRejection", (reason) => {
    warn(`Unexpected error: ${describeError(reason)}`);
  });

  await run(config);
}
