(() => {
  "use strict";

  const CALENDAR_DATA_URL = "/data/calendar.json";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
  ]);
  const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const snowfallEl = document.getElementById("snowfall");
  const titleEl = document.getElementById("calendar-title");
  const demoBannerEl = document.getElementById("demo-banner");
  const statusEl = document.getElementById("calendar-status");
  const gridEl = document.getElementById("calendar-grid");
  const modalEl = document.getElementById("video-modal");
  const modalTitleEl = document.getElementById("modal-title");
  const modalCloseEl = document.getElementById("modal-close");
  const youtubeEl = document.getElementById("door-youtube");
  const modalMessageEl = document.getElementById("modal-message");

  /**
   * Populate gentle CSS snowfall particles unless reduced motion is preferred.
   */
  function initSnowfall() {
    if (!snowfallEl) {
      return;
    }
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReducedMotion) {
      return;
    }

    const flakeCount = 26;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < flakeCount; i += 1) {
      const flake = document.createElement("span");
      flake.className = "snowflake";
      const sizePx = 3 + ((i * 7) % 5);
      const leftPct = (i * 37 + 5) % 100;
      const durationSec = 9 + ((i * 3) % 9);
      const delaySec = -((i * 1.7) % durationSec);
      const driftPx = (i % 2 === 0 ? 1 : -1) * (8 + (i % 14));

      flake.style.width = `${sizePx}px`;
      flake.style.height = `${sizePx}px`;
      flake.style.left = `${leftPct}%`;
      flake.style.opacity = String(0.28 + ((i % 5) * 0.12));
      flake.style.animationDuration = `${durationSec}s`;
      flake.style.animationDelay = `${delaySec.toFixed(1)}s`;
      flake.style.setProperty("--drift", `${driftPx}px`);
      fragment.appendChild(flake);
    }
    snowfallEl.appendChild(fragment);
  }

  /**
   * Build a compact inline SVG icon representing the door state.
   * @param {"today" | "open" | "eve" | "locked"} variant
   * @returns {SVGElement | null}
   */
  function createDoorIcon(variant) {
    if (typeof document.createElementNS !== "function") {
      return null;
    }

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "door-card__icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");

    const path = document.createElementNS(SVG_NS, "path");
    if (variant === "today") {
      path.setAttribute("d", "M12 2.5l2.5 5.8 6.3.6-4.7 4.2 1.4 6.2L12 16l-5.5 3.3 1.4-6.2-4.7-4.2 6.3-.6z");
      path.setAttribute("fill", "currentColor");
    } else if (variant === "open") {
      path.setAttribute("d", "M8 5.5v13l10.5-6.5z");
      path.setAttribute("fill", "currentColor");
    } else if (variant === "eve") {
      path.setAttribute("d", "M4 10h16v10H4zM2.5 7h19v3h-19zM12 7v13M12 7c-2.2 0-3.5-1.2-3.5-2.5S9.8 2 12 4.5C14.2 2 15.5 3.2 15.5 4.5S14.2 7 12 7z");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.75");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    } else {
      path.setAttribute("d", "M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.8L12 7l2.5-2.2M9.5 19.2L12 17l2.5 2.2");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.65");
      path.setAttribute("stroke-linecap", "round");
    }

    svg.appendChild(path);
    return svg;
  }

  /**
   * Extract a YouTube video ID from watch, share, embed, shorts, or live URLs.
   * Returns null for non-YouTube or invalid URLs.
   * @param {string} rawUrl
   * @returns {string | null}
   */
  function extractYouTubeId(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return null;
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    let candidate = null;

    if (host === "youtu.be" || host === "www.youtu.be") {
      candidate = segments[0] || null;
    } else if (segments[0] === "watch" || parsed.searchParams.has("v")) {
      candidate = parsed.searchParams.get("v");
    } else if (["embed", "shorts", "live"].includes(segments[0])) {
      candidate = segments[1] || null;
    }

    return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  }

  /**
   * Build a privacy-enhanced youtube-nocookie.com embed URL.
   * @param {string} videoId
   * @returns {string}
   */
  function buildYouTubeEmbedUrl(videoId) {
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
  }

  /**
   * Parse an ISO YYYY-MM-DD date string strictly into calendar components.
   * @param {string} value
   * @returns {{ year: number, month: number, day: number } | null}
   */
  function parseIsoDate(value) {
    if (typeof value !== "string") {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const check = new Date(year, month - 1, day);
    if (
      check.getFullYear() !== year ||
      check.getMonth() !== month - 1 ||
      check.getDate() !== day
    ) {
      return null;
    }
    return { year, month, day };
  }

  /**
   * Resolve the effective calendar date from ?date=YYYY-MM-DD, ?date=live,
   * calendar.json demoDate, or the browser's current local date.
   * @param {{ demoDate?: string } | null} data
   * @returns {{ year: number, month: number, day: number, isDemo: boolean }}
   */
  function resolveEffectiveDate(data) {
    const queryDate = new URLSearchParams(window.location.search).get("date");
    if (queryDate && queryDate.toLowerCase() !== "live") {
      const parsedQuery = parseIsoDate(queryDate);
      if (parsedQuery) {
        return { ...parsedQuery, isDemo: true };
      }
    }

    if (queryDate?.toLowerCase() !== "live" && data && !Array.isArray(data)) {
      const parsedDemo = parseIsoDate(data.demoDate);
      if (parsedDemo) {
        return { ...parsedDemo, isDemo: true };
      }
    }

    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      isDemo: false,
    };
  }

  /**
   * Determine whether a door is unlocked and whether it represents today's door.
   * @param {{ day: number, unlocked?: boolean }} door
   * @param {{ month: number, day: number }} effectiveDate
   * @returns {{ isUnlocked: boolean, isToday: boolean }}
   */
  function getDoorState(door, effectiveDate) {
    const isDecember = effectiveDate.month === 12;
    const unlockedByDate = isDecember && door.day <= effectiveDate.day;
    return {
      isUnlocked: Boolean(door.unlocked) || unlockedByDate,
      isToday: isDecember && door.day === effectiveDate.day,
    };
  }

  /**
   * Display or clear a top-level status banner above the grid.
   * @param {string} message
   */
  function setStatus(message) {
    if (!message) {
      statusEl.textContent = "";
      statusEl.hidden = true;
      return;
    }
    statusEl.textContent = message;
    statusEl.hidden = false;
  }

  /**
   * Update the header pill showing the active date and unlock progress.
   * @param {{ month: number, day: number, isDemo: boolean }} effectiveDate
   * @param {number} unlockedCount
   * @param {number} totalCount
   */
  function updateDemoBanner(effectiveDate, unlockedCount, totalCount) {
    const monthName = MONTH_NAMES[effectiveDate.month - 1] || "December";
    const prefix = effectiveDate.isDemo ? "Demo date: " : "";
    demoBannerEl.textContent = `${prefix}${monthName} ${effectiveDate.day} · ${unlockedCount} / ${totalCount} doors unlocked`;
    demoBannerEl.hidden = false;
  }

  /**
   * Reset and unload the YouTube iframe player.
   */
  function resetYouTubePlayer() {
    youtubeEl.removeAttribute("src");
    youtubeEl.hidden = true;
  }

  /**
   * Show a message inside the modal instead of the YouTube player.
   * @param {string} message
   */
  function showModalMessage(message) {
    resetYouTubePlayer();
    modalMessageEl.textContent = message;
    modalMessageEl.hidden = false;
  }

  /**
   * Open the modal for a given calendar door entry.
   * @param {{ day: number, title?: string, videoUrl?: string, unlocked?: boolean }} door
   * @param {{ isUnlocked: boolean, isToday: boolean }} doorState
   */
  function openDoorModal(door, doorState) {
    const label = door.title || `Day ${door.day}`;
    modalTitleEl.textContent = doorState.isToday ? `${label} — Today` : label;
    modalMessageEl.hidden = true;
    modalMessageEl.textContent = "";
    resetYouTubePlayer();

    if (!doorState.isUnlocked) {
      showModalMessage(`Wrapped until December ${door.day}. Come back then to unwrap this video!`);
    } else {
      const youtubeId = extractYouTubeId(door.videoUrl);
      if (youtubeId) {
        youtubeEl.hidden = false;
        youtubeEl.src = buildYouTubeEmbedUrl(youtubeId);
      } else {
        showModalMessage(`No YouTube video has been linked for ${label} yet.`);
      }
    }

    if (typeof modalEl.showModal === "function") {
      modalEl.showModal();
    } else {
      modalEl.setAttribute("open", "");
    }
  }

  /**
   * Close the modal and stop embedded YouTube playback.
   */
  function closeDoorModal() {
    resetYouTubePlayer();
    if (typeof modalEl.close === "function" && modalEl.open) {
      modalEl.close();
    } else {
      modalEl.removeAttribute("open");
    }
  }

  /**
   * Build a single accessible calendar door card element.
   * @param {{ day: number, title?: string, videoUrl?: string, unlocked?: boolean }} door
   * @param {{ isUnlocked: boolean, isToday: boolean }} doorState
   * @returns {HTMLButtonElement}
   */
  function createDoorCard(door, doorState) {
    const { isUnlocked, isToday } = doorState;
    const isEve = door.day === 24;
    const title = door.title || `Day ${door.day}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "door-card",
      isUnlocked ? "door-card--unlocked" : "door-card--locked",
      isToday ? "door-card--today" : "",
      isEve ? "door-card--eve" : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.dataset.day = String(door.day);

    let stateLabel = `Locked until December ${door.day}`;
    let badgeText = `Dec ${door.day}`;
    let iconVariant = isEve ? "eve" : "locked";
    if (isToday && isUnlocked) {
      stateLabel = "Today, unlocked";
      badgeText = "Today";
      iconVariant = "today";
    } else if (isUnlocked) {
      stateLabel = "Unlocked";
      badgeText = "Open";
      iconVariant = isEve ? "eve" : "open";
    }
    button.setAttribute("aria-label", `${title} (${stateLabel})`);

    const topRow = document.createElement("div");
    topRow.className = "door-card__top";

    const numberSpan = document.createElement("span");
    numberSpan.className = "door-card__number";
    numberSpan.textContent = String(door.day);
    topRow.appendChild(numberSpan);

    const iconEl = createDoorIcon(iconVariant);
    if (iconEl) {
      topRow.appendChild(iconEl);
    }

    const metaDiv = document.createElement("div");
    metaDiv.className = "door-card__meta";

    const titleSpan = document.createElement("span");
    titleSpan.className = "door-card__title";
    titleSpan.textContent = isEve && title === "Day 24" ? "Christmas Eve" : title;

    const badgeSpan = document.createElement("span");
    badgeSpan.className = "door-card__badge";
    badgeSpan.textContent = badgeText;

    metaDiv.append(titleSpan, badgeSpan);
    button.append(topRow, metaDiv);
    button.addEventListener("click", () => openDoorModal(door, doorState));

    return button;
  }

  /**
   * Fetch calendar manifest and render all doors.
   */
  async function initCalendar() {
    initSnowfall();

    try {
      const response = await fetch(CALENDAR_DATA_URL, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading calendar data`);
      }

      const data = await response.json();
      if (data && typeof data.title === "string" && data.title.trim()) {
        titleEl.textContent = data.title;
        document.title = data.title;
      }

      const doors = Array.isArray(data) ? data : data?.doors;
      if (!Array.isArray(doors) || doors.length === 0) {
        setStatus("No calendar doors found in calendar.json.");
        return;
      }

      const effectiveDate = resolveEffectiveDate(data);
      let unlockedCount = 0;

      setStatus("");
      const fragment = document.createDocumentFragment();
      for (const door of doors) {
        const doorState = getDoorState(door, effectiveDate);
        if (doorState.isUnlocked) {
          unlockedCount += 1;
        }
        fragment.appendChild(createDoorCard(door, doorState));
      }
      gridEl.replaceChildren(fragment);
      updateDemoBanner(effectiveDate, unlockedCount, doors.length);
    } catch (error) {
      console.error("Failed to initialize advent calendar:", error);
      setStatus("Unable to load the calendar configuration. Please try again later.");
    }
  }

  modalCloseEl.addEventListener("click", closeDoorModal);

  // Clicking on the backdrop area outside the surface closes the dialog.
  modalEl.addEventListener("click", (event) => {
    if (event.target === modalEl) {
      closeDoorModal();
    }
  });

  modalEl.addEventListener("close", resetYouTubePlayer);

  document.addEventListener("DOMContentLoaded", initCalendar);
})();
