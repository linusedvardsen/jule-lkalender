"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_TIMEZONE = process.env.TZ_NAME || "Europe/Oslo";
const DEFAULT_UNLOCK_HOUR = 6;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PRIMARY_FILE = path.join(DATA_DIR, "calendar.json");
const FALLBACK_FILE = path.join(DATA_DIR, "calendar.example.json");

/**
 * Load calendar configuration from data/calendar.json (private, gitignored)
 * or fall back to data/calendar.example.json if not yet created.
 */
function loadCalendarConfig() {
  const targetFile = fs.existsSync(PRIMARY_FILE) ? PRIMARY_FILE : FALLBACK_FILE;
  const raw = fs.readFileSync(targetFile, "utf8");
  return JSON.parse(raw);
}

/**
 * Extract numeric date/time components for `date` in an IANA time zone.
 * @param {Date} date
 * @param {string} timeZone
 */
function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.create(null);
  for (const entry of formatter.formatToParts(date)) {
    if (entry.type !== "literal") {
      parts[entry.type] = Number(entry.value);
    }
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
  };
}

/**
 * Parse an optional admin-only demoDate string ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM").
 * Returns null if unset or invalid.
 * @param {unknown} value
 */
function parseDemoDate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] !== undefined ? Number(match[4]) : 12;
  const minute = match[5] !== undefined ? Number(match[5]) : 0;

  if (hour > 23 || minute > 59) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, hour, minute };
}

/**
 * Pack {year, month, day, hour, minute} into a comparable integer YYYYMMDDHHMM.
 */
function toStamp(parts) {
  return (
    ((parts.year * 100 + parts.month) * 100 + parts.day) * 10000 +
    parts.hour * 100 +
    parts.minute
  );
}

/**
 * Resolve effective time and filter locked door video URLs before responding.
 */
function buildCalendarResponse(config) {
  const timeZone =
    typeof config.timezone === "string" && config.timezone.trim()
      ? config.timezone.trim()
      : DEFAULT_TIMEZONE;

  const unlockHour =
    Number.isInteger(config.unlockHour) && config.unlockHour >= 0 && config.unlockHour <= 23
      ? config.unlockHour
      : DEFAULT_UNLOCK_HOUR;

  const demoParts = parseDemoDate(config.demoDate);
  const nowParts = demoParts || getZonedParts(new Date(), timeZone);
  const targetYear =
    Number.isInteger(config.year) && config.year >= 2000
      ? config.year
      : nowParts.year;

  const nowStamp = toStamp(nowParts);
  const rawDoors = Array.isArray(config.doors) ? config.doors : [];

  const doors = rawDoors.map((door) => {
    const day = Number(door.day);
    const doorStamp = toStamp({
      year: targetYear,
      month: 12,
      day,
      hour: unlockHour,
      minute: 0,
    });

    const isUnlocked = Boolean(door.unlocked) || nowStamp >= doorStamp;
    const isToday =
      nowParts.year === targetYear &&
      nowParts.month === 12 &&
      nowParts.day === day;

    return {
      day,
      title: typeof door.title === "string" && door.title.trim() ? door.title : `Luke ${day}`,
      unlocked: isUnlocked,
      isToday,
      // Never leak future video URLs before the door unlocks on the server.
      videoUrl: isUnlocked && typeof door.videoUrl === "string" ? door.videoUrl.trim() : null,
    };
  });

  return {
    title: typeof config.title === "string" && config.title.trim() ? config.title.trim() : "Juleølkalender",
    description: typeof config.description === "string" ? config.description.trim() : "",
    unlockHour,
    timezone: timeZone,
    serverDate: {
      year: nowParts.year,
      month: nowParts.month,
      day: nowParts.day,
      hour: nowParts.hour,
      minute: nowParts.minute,
      isDemo: Boolean(demoParts),
    },
    doors,
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store, max-age=0",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (urlPath === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (urlPath === "/api/calendar") {
    try {
      const config = loadCalendarConfig();
      const payload = buildCalendarResponse(config);
      if (req.method === "HEAD") {
        const body = JSON.stringify(payload);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          "Cache-Control": "no-store, max-age=0",
        });
        res.end();
        return;
      }
      sendJson(res, 200, payload);
    } catch (error) {
      console.error("Error loading calendar config:", error);
      sendJson(res, 500, { error: "Failed to load calendar configuration" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Calendar API listening on port ${PORT} (${DEFAULT_TIMEZONE})`);
  });
}

module.exports = {
  buildCalendarResponse,
  getZonedParts,
  parseDemoDate,
  toStamp,
};
