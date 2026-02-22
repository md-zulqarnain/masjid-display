const prayerData = {
  fajr: { arabic: "فجر", start: "04:30 AM", azan: "05:00 AM", jamah: "05:15 AM", end: "06:15 AM" },
  dhuhr: { arabic: "ظهر", start: "12:00 PM", azan: "12:30 PM", jamah: "12:45 PM", end: "03:30 PM" },
  asr: { arabic: "عصر", start: "03:30 PM", azan: "04:00 PM", jamah: "04:15 PM", end: "05:45 PM" },
  maghrib: { arabic: "مغرب", start: "05:50 PM", azan: "05:55 PM", jamah: "06:00 PM", end: "07:15 PM" },
  isha: { arabic: "عشاء", start: "07:15 PM", azan: "07:45 PM", jamah: "08:00 PM", end: "10:30 PM" }
};

// Load prayer times from timings.json with cache-busting and change detection
let lastTimingJSON = null;
async function loadPrayerTimesForToday() {
  try {
    const response = await fetch(`/api/quick-times?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      console.log("Using default prayer times");
      return false;
    }

    const text = await response.text();
    if (!text) return false;

    // If JSON string is identical to last fetched, no change
    if (lastTimingJSON === text) return false;

    let timingData;
    try {
      timingData = JSON.parse(text);
    } catch (e) {
      console.error('Invalid JSON from /api/quick-times', e, text);
      return false;
    }

    lastTimingJSON = text;
    let hasChanged = false;

    Object.keys(timingData).forEach(prayer => {
      if (timingData[prayer] && timingData[prayer].azan && timingData[prayer].jamah) {
        if (prayerData[prayer].azan !== timingData[prayer].azan ||
            prayerData[prayer].jamah !== timingData[prayer].jamah) {
          hasChanged = true;
          prayerData[prayer].azan = timingData[prayer].azan;
          prayerData[prayer].jamah = timingData[prayer].jamah;
        }
      }
    });

    return hasChanged;
  } catch (err) {
    console.error("Error loading prayer times:", err);
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