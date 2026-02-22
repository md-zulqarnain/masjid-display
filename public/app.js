const prayerData = {
  fajr: { arabic: "فجر", start: "04:30 AM", azan: "05:00 AM", jamah: "05:15 AM", end: "06:15 AM" },
  dhuhr: { arabic: "ظهر", start: "12:00 PM", azan: "12:30 PM", jamah: "12:45 PM", end: "03:30 PM" },
  asr: { arabic: "عصر", start: "03:30 PM", azan: "04:00 PM", jamah: "04:15 PM", end: "05:45 PM" },
  maghrib: { arabic: "مغرب", start: "05:50 PM", azan: "05:55 PM", jamah: "06:00 PM", end: "07:15 PM" },
  isha: { arabic: "عشاء", start: "07:15 PM", azan: "07:45 PM", jamah: "08:00 PM", end: "10:30 PM" }
};

// Load prayer times from timings.json with cache-busting and change detection
let lastTimingJSON = null;

function parseHM(timeStr) {
  // accepts 'HH:MM' or 'H:MM'
  const [h, m] = timeStr.split(':').map(s => parseInt(s, 10));
  return { h, m };
}

function addMinutesToHM(timeStr, minutes) {
  const { h, m } = parseHM(timeStr);
  const dt = new Date();
  dt.setHours(h, m, 0, 0);
  dt.setMinutes(dt.getMinutes() + minutes);
  const hh = dt.getHours();
  const mm = dt.getMinutes();
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function to12Hour(time24) {
  // time24 may be 'HH:MM' or already 'hh:mm AM'
  if (time24.includes('AM') || time24.includes('PM')) return time24;
  const [h, m] = time24.split(':').map(s => parseInt(s, 10));
  const ampm = h >= 12 ? 'PM' : 'AM';
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return String(hh).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

// Load prayer times either from quick-times or monthly timing-data files
async function loadPrayerTimesForToday() {
  try {
    // First try quick-times (timings.json)
    const quickResp = await fetch(`/api/quick-times?t=${Date.now()}`, { cache: 'no-store' });
    if (quickResp.ok) {
      const quickText = await quickResp.text();
      if (quickText) {
        if (lastTimingJSON === quickText) {
          // still attempt to update start/end from monthly data if available
        } else {
          lastTimingJSON = quickText;
        }

        let quickData;
        try { quickData = JSON.parse(quickText); } catch (e) { quickData = null; }
        if (quickData && Object.keys(quickData).length) {
          let changed = false;
          Object.keys(quickData).forEach(prayer => {
            if (quickData[prayer] && quickData[prayer].azan && quickData[prayer].jamah) {
              if (prayerData[prayer].azan !== quickData[prayer].azan || prayerData[prayer].jamah !== quickData[prayer].jamah) {
                prayerData[prayer].azan = quickData[prayer].azan;
                prayerData[prayer].jamah = quickData[prayer].jamah;
                changed = true;
              }
            }
          });

          // Also fetch monthly data to compute start/end times (so start uses Sahri+13 etc.)
          try {
            const now = new Date();
            const month = now.getMonth() + 1;
            const day = now.getDate();
            const mresp = await fetch(`/api/timings/${month}`);
            if (mresp.ok) {
              const mdata = await mresp.json();
              const dayObj = Array.isArray(mdata) ? (mdata.find(d => d.day === day) || mdata[day - 1]) : null;
              if (dayObj) {
                const sahri = dayObj.Sahri;
                const sunrise = dayObj.Sunrise;
                const zohar = dayObj.Zohar;
                const asr = dayObj.Asr;
                const maghrib = dayObj.Maghrib;
                const isha = dayObj.Isha;

                const fajrStart24 = addMinutesToHM(sahri, 13 + 2);
                const fajrEnd24 = addMinutesToHM(sunrise, -2);
                const zoharStart24 = addMinutesToHM(zohar, 2);
                const zoharEnd24 = addMinutesToHM(asr, -2);
                const asrStart24 = addMinutesToHM(asr, 2);
                const asrEnd24 = addMinutesToHM(maghrib, -2);
                const maghribStart24 = addMinutesToHM(maghrib, 2);
                const maghribEnd24 = addMinutesToHM(isha, -2);
                const ishaStart24 = addMinutesToHM(isha, 2);
                const ishaEnd24 = addMinutesToHM(sahri, -2);

                const monthlyStarts = {
                  fajr: { start: to12Hour(fajrStart24), azan: to12Hour(fajrStart24), jamah: to12Hour(addMinutesToHM(fajrStart24, 15)), end: to12Hour(fajrEnd24) },
                  dhuhr: { start: to12Hour(zoharStart24), azan: to12Hour(zoharStart24), jamah: to12Hour(addMinutesToHM(zoharStart24, 15)), end: to12Hour(zoharEnd24) },
                  asr: { start: to12Hour(asrStart24), azan: to12Hour(asrStart24), jamah: to12Hour(addMinutesToHM(asrStart24, 15)), end: to12Hour(asrEnd24) },
                  maghrib: { start: to12Hour(maghribStart24), azan: to12Hour(maghribStart24), jamah: to12Hour(addMinutesToHM(maghribStart24, 3)), end: to12Hour(maghribEnd24) },
                  isha: { start: to12Hour(ishaStart24), azan: to12Hour(ishaStart24), jamah: to12Hour(addMinutesToHM(ishaStart24, 15)), end: to12Hour(ishaEnd24) }
                };

                Object.keys(monthlyStarts).forEach(p => {
                  let localChanged = false;
                  // Always update start and end from monthly calculations
                  if (prayerData[p].start !== monthlyStarts[p].start) {
                    prayerData[p].start = monthlyStarts[p].start;
                    localChanged = true;
                  }
                  if (prayerData[p].end !== monthlyStarts[p].end) {
                    prayerData[p].end = monthlyStarts[p].end;
                    localChanged = true;
                  }

                  // For Maghrib always use monthly azan/jamah; for others only if quick-times don't provide them
                  if (p === 'maghrib') {
                    if (prayerData[p].azan !== monthlyStarts[p].azan) {
                      prayerData[p].azan = monthlyStarts[p].azan;
                      localChanged = true;
                    }
                    if (prayerData[p].jamah !== monthlyStarts[p].jamah) {
                      prayerData[p].jamah = monthlyStarts[p].jamah;
                      localChanged = true;
                    }
                  } else {
                    if (!quickData || !quickData[p] || !quickData[p].azan) {
                      if (prayerData[p].azan !== monthlyStarts[p].azan) {
                        prayerData[p].azan = monthlyStarts[p].azan;
                        localChanged = true;
                      }
                    }
                    if (!quickData || !quickData[p] || !quickData[p].jamah) {
                      if (prayerData[p].jamah !== monthlyStarts[p].jamah) {
                        prayerData[p].jamah = monthlyStarts[p].jamah;
                        localChanged = true;
                      }
                    }
                  }

                  if (localChanged) changed = true;
                });
              }
            }
          } catch (e) {
            console.error('Error fetching monthly data for start/end:', e);
          }

          return changed;
        }
      }
    }

    // Fallback: load monthly timing-data-<month>.json
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const resp = await fetch(`/api/timings/${month}`);
    if (!resp.ok) {
      console.log('Monthly timing data not available');
      return false;
    }

    const data = await resp.json();
    // data expected as array of day objects
    const dayObj = Array.isArray(data) ? (data.find(d => d.day === day) || data[day - 1]) : null;
    if (!dayObj) return false;

    // Compute timings per rules, adding 2 minutes buffer to starts and subtracting 2 from ends
    // Fajr: start = Sahri + 13 min (+2), end = Sunrise (-2)
    const sahri = dayObj.Sahri;
    const sunrise = dayObj.Sunrise;
    const zohar = dayObj.Zohar;
    const asr = dayObj.Asr;
    const maghrib = dayObj.Maghrib;
    const isha = dayObj.Isha;

    const fajrStart24 = addMinutesToHM(sahri, 13 + 2);
    const fajrEnd24 = addMinutesToHM(sunrise, -2);

    const zoharStart24 = addMinutesToHM(zohar, 2);
    const zoharEnd24 = addMinutesToHM(asr, -2);

    const asrStart24 = addMinutesToHM(asr, 2);
    const asrEnd24 = addMinutesToHM(maghrib, -2);

    const maghribStart24 = addMinutesToHM(maghrib, 2);
    const maghribEnd24 = addMinutesToHM(isha, -2);

    const ishaStart24 = addMinutesToHM(isha, 2);
    const ishaEnd24 = addMinutesToHM(sahri, -2);

    // Assign to prayerData (convert to 12-hour for display)
    const newData = {
      fajr: { azan: to12Hour(fajrStart24), jamah: to12Hour(addMinutesToHM(fajrStart24, 15)), start: to12Hour(fajrStart24), end: to12Hour(fajrEnd24) },
      dhuhr: { azan: to12Hour(zoharStart24), jamah: to12Hour(addMinutesToHM(zoharStart24, 15)), start: to12Hour(zoharStart24), end: to12Hour(zoharEnd24) },
      asr: { azan: to12Hour(asrStart24), jamah: to12Hour(addMinutesToHM(asrStart24, 15)), start: to12Hour(asrStart24), end: to12Hour(asrEnd24) },
      maghrib: { azan: to12Hour(maghribStart24), jamah: to12Hour(addMinutesToHM(maghribStart24, 15)), start: to12Hour(maghribStart24), end: to12Hour(maghribEnd24) },
      isha: { azan: to12Hour(ishaStart24), jamah: to12Hour(addMinutesToHM(ishaStart24, 15)), start: to12Hour(ishaStart24), end: to12Hour(ishaEnd24) }
    };

    const newJSON = JSON.stringify(newData);
    if (lastTimingJSON === newJSON) return false;
    lastTimingJSON = newJSON;

    let changed = false;
    Object.keys(newData).forEach(p => {
      if (prayerData[p].azan !== newData[p].azan || prayerData[p].jamah !== newData[p].jamah || prayerData[p].start !== newData[p].start || prayerData[p].end !== newData[p].end) {
        prayerData[p].azan = newData[p].azan;
        prayerData[p].jamah = newData[p].jamah;
        prayerData[p].start = newData[p].start;
        prayerData[p].end = newData[p].end;
        changed = true;
      }
    });
    return changed;
  } catch (err) {
    console.error('Error loading prayer times:', err);
    return false;
  }
}

// Auto-refresh prayer times every 3 seconds
setInterval(async () => {
  const hasChanged = await loadPrayerTimesForToday();
  if (hasChanged) {
    console.log("Prayer times updated, re-rendering table...");
    renderTable();
  }
}, 3 * 1000);

function updateClock() {
  const now = new Date();

  let hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const ampm = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12

  const formattedHours = String(hours).padStart(2, '0') +
    ":" +
    String(minutes).padStart(2, '0');

  const formattedSeconds =
    ":" + String(seconds).padStart(2, '0');

  const hoursEl = document.getElementById("hours");
  const secondsEl = document.getElementById("seconds");
  const ampmEl = document.getElementById("ampm");
  const dateEl = document.getElementById("date");
  const hijriEl = document.getElementById("hijri");

  if (hoursEl) hoursEl.innerText = formattedHours;
  if (secondsEl) secondsEl.innerText = formattedSeconds;
  if (ampmEl) ampmEl.innerText = ampm;

  if (dateEl) {
    dateEl.innerText =
      now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      });
  }

  if (hijriEl) {
    hijriEl.innerText =
      new Intl.DateTimeFormat('en-TN-u-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(now);
  }
}

setInterval(updateClock, 1000);
updateClock();

// Load prayer times on page load and then render table
async function initializePage() {
  await loadPrayerTimesForToday();
  renderTable();
}

initializePage();

function renderTable() {
  const table = document.getElementById("prayerTable");
  
  if (!table) {
    console.error("Prayer table element not found");
    return;
  }
  
  table.innerHTML = "";

  Object.keys(prayerData).forEach(key => {
    const row = document.createElement("tr");
    row.id = key;

    row.innerHTML = `
      <td>${key.charAt(0).toUpperCase() + key.slice(1)}</td>
      <td>${prayerData[key].arabic}</td>
      <td>${prayerData[key].start}</td>
      <td>${prayerData[key].azan}</td>
      <td>${prayerData[key].jamah}</td>
      <td>${prayerData[key].end}</td>
    `;

    table.appendChild(row);
  });

  highlightNextPrayer();
}

function parseTime(timeStr) {
  const now = new Date();
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":");
  hours = parseInt(hours);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  const date = new Date(now);
  date.setHours(hours);
  date.setMinutes(parseInt(minutes));
  date.setSeconds(0);

  return date;
}

function highlightNextPrayer() {
  const now = new Date();
  let closest = null;
  let minDiff = Infinity;
  // clear previous active rows
  document.querySelectorAll('tbody tr').forEach(r => r.classList.remove('active-row'));

  Object.keys(prayerData).forEach(key => {
    let prayerTime = parseTime(prayerData[key].azan);
    if (prayerTime < now) prayerTime.setDate(prayerTime.getDate() + 1);

    const diff = prayerTime - now;
    if (diff < minDiff) {
      minDiff = diff;
      closest = key;
    }

    if (Math.abs(diff) < 1000) {
      triggerAzan(key);
    }
  });

  if (closest) {
    const row = document.getElementById(closest);
    if (row) row.classList.add('active-row');
  }
}

// Update next prayer countdown every second
function formatDiff(ms) {
  if (ms <= 0) return '00:00:00';
  let total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  total %= 3600;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function updateNextPrayerCountdown() {
  try {
    const now = new Date();
    let closest = null;
    let minDiff = Infinity;

    Object.keys(prayerData).forEach(key => {
      let prayerTime = parseTime(prayerData[key].azan);
      if (prayerTime < now) prayerTime.setDate(prayerTime.getDate() + 1);
      const diff = prayerTime - now;
      if (diff < minDiff) {
        minDiff = diff;
        closest = key;
      }
    });

    const nameEl = document.getElementById('nextPrayerName');
    const cntEl = document.getElementById('nextPrayerCountdown');

    if (!nameEl || !cntEl) return;

    if (closest) {
      const displayName = (prayerData[closest].arabic || '') + ' - ' + (closest.charAt(0).toUpperCase() + closest.slice(1));
      nameEl.innerText = 'Next: ' + displayName;
      cntEl.innerText = formatDiff(minDiff);
    } else {
      nameEl.innerText = '';
      cntEl.innerText = '';
    }
  } catch (e) {
    console.error('Error updating next prayer countdown', e);
  }
}

// Start countdown timer
setInterval(updateNextPrayerCountdown, 1000);
updateNextPrayerCountdown();

function triggerAzan(prayer) {
  const audio = document.getElementById("azanAudio");
  audio.play();

  const black = document.getElementById("blackScreen");
  black.style.display = "block";

  setTimeout(() => {
    black.style.display = "none";
  }, 10 * 60 * 1000); // 10 minutes
}

function showVideo() {
  const video = document.getElementById("masjidVideo");
  const container = document.querySelector(".container");
  
  container.style.display = "none";
  video.style.display = "block";
  video.play();
}

function hideVideo() {
  const video = document.getElementById("masjidVideo");
  const container = document.querySelector(".container");
  
  video.style.display = "none";
  container.style.display = "flex";
  video.pause();
}

// Video rotation functionality
let videoList = [];
let currentVideoIndex = 0;

// Fetch available videos from server
async function loadVideos() {
  try {
    const response = await fetch("/api/videos");
    videoList = await response.json();
    console.log("Available videos:", videoList);
    return videoList;
  } catch (err) {
    console.error("Error loading videos:", err);
    return [];
  }
}

// Play video for 30 seconds every 5 minutes
function playVideoInterval() {
  if (videoList.length === 0) {
    console.log("No videos available");
    return;
  }

  const video = document.getElementById("masjidVideo");
  const source = video.querySelector("source");
  
  console.log("Playing video:", videoList[currentVideoIndex]);
  
  source.src = videoList[currentVideoIndex];
  video.load();
  
  video.oncanplay = function() {
    console.log("Video loaded, playing...");
    showVideo();
  };
  
  video.onerror = function() {
    console.error("Error loading video:", videoList[currentVideoIndex]);
    hideVideo();
  };
  
  setTimeout(() => {
    hideVideo();
    currentVideoIndex = (currentVideoIndex + 1) % videoList.length;
  }, 30 * 1000); // 30 seconds
}

// Load videos on page load
loadVideos().then(() => {
  console.log("Videos loaded, starting interval...");
});

setInterval(playVideoInterval, 5 * 60 * 1000); // 5 minutes

renderTable();