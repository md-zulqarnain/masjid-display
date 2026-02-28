const prayerData = {
    fajr: { arabic: "فجر", start: "04:30 AM", azan: "05:00 AM", jamah: "05:15 AM", end: "06:15 AM" },
    dhuhr: { arabic: "ظهر", start: "12:00 PM", azan: "12:30 PM", jamah: "12:45 PM", end: "03:30 PM" },
    asr: { arabic: "عصر", start: "03:30 PM", azan: "04:00 PM", jamah: "04:15 PM", end: "05:45 PM" },
    maghrib: { arabic: "مغرب", start: "05:50 PM", azan: "05:55 PM", jamah: "06:00 PM", end: "07:15 PM" },
    isha: { arabic: "عشاء", start: "07:15 PM", azan: "07:45 PM", jamah: "02:07 PM", end: "10:30 PM" },
};

// Load prayer times from timings.json with cache-busting and change detection
let lastTimingJSON = null;

let lastRenderedData = JSON.stringify(prayerData);

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
        const quickResp = await fetch(`/api/quick-times?t=${Date.now()}`, { cache: 'no-store' });
        let quickData = null;

        if (quickResp.ok) {
            const quickText = await quickResp.text();
            try { quickData = JSON.parse(quickText); } catch (e) { quickData = null; }
        }

        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();

        const mresp = await fetch(`/api/timings/${month}`);
        if (!mresp.ok) return false;

        const mdata = await mresp.json();
        const dayObj = Array.isArray(mdata)
            ? (mdata.find(d => d.day === day) || mdata[day - 1])
            : null;

        if (!dayObj) return false;

        const sahri = dayObj.Sahri;
        const sunrise = dayObj.Sunrise;
        const zohar = dayObj.Zohar;
        const asr = dayObj.Asr;
        const maghrib = dayObj.Maghrib;
        const isha = dayObj.Isha;

        let changed = false;

        // ==============================
        // FAJR
        // ==============================

        const fajrStart24_normal = addMinutesToHM(sahri, 15);
        const fajrEnd24 = addMinutesToHM(sunrise, -2);

        if (quickData?.fajr?.specialEnabled === true) {

            // 🔵 SAHRI BASED MODE

            const fajrAzan24 = addMinutesToHM(
                sahri,
                quickData.fajr.azanAfterSahri || 0
            );

            const fajrJamah24 = addMinutesToHM(
                fajrAzan24,
                quickData.fajr.jamahAfterAzan || 0
            );

            prayerData.fajr.start = to12Hour(fajrStart24_normal);
            prayerData.fajr.azan = to12Hour(fajrAzan24);
            prayerData.fajr.jamah = to12Hour(fajrJamah24);
            prayerData.fajr.end = to12Hour(fajrEnd24);

        } else {

            // 🟢 NORMAL MODE (Use timings.json if available)

            prayerData.fajr.start = to12Hour(fajrStart24_normal);
            prayerData.fajr.end = to12Hour(fajrEnd24);

            if (quickData?.fajr?.azan) {
                prayerData.fajr.azan = quickData.fajr.azan;
            } else {
                prayerData.fajr.azan = to12Hour(fajrStart24_normal);
            }

            if (quickData?.fajr?.jamah) {
                prayerData.fajr.jamah = quickData.fajr.jamah;
            } else {
                prayerData.fajr.jamah = to12Hour(
                    addMinutesToHM(fajrStart24_normal, 15)
                );
            }
        }

        // ==============================
        // DHUHR
        // ==============================

        const zoharStart24 = addMinutesToHM(zohar, 2);
        const zoharEnd24 = addMinutesToHM(asr, -2);

        prayerData.dhuhr.start = to12Hour(zoharStart24);
        prayerData.dhuhr.end = to12Hour(zoharEnd24);

        // Always prefer timings.json if provided
        if (quickData?.dhuhr?.azan) {
            prayerData.dhuhr.azan = quickData.dhuhr.azan;
        } else {
            prayerData.dhuhr.azan = to12Hour(zoharStart24);
        }

        if (quickData?.dhuhr?.jamah) {
            prayerData.dhuhr.jamah = quickData.dhuhr.jamah;
        } else {
            prayerData.dhuhr.jamah = to12Hour(addMinutesToHM(zoharStart24, 15));
        }

        // ==============================
        // ASR
        // ==============================

        const asrStart24 = addMinutesToHM(asr, 2);
        const asrEnd24 = addMinutesToHM(maghrib, -2);

        prayerData.asr.start = to12Hour(asrStart24);
        prayerData.asr.end = to12Hour(asrEnd24);

        if (quickData?.asr?.azan) {
            prayerData.asr.azan = quickData.asr.azan;
        } else {
            prayerData.asr.azan = to12Hour(asrStart24);
        }

        if (quickData?.asr?.jamah) {
            prayerData.asr.jamah = quickData.asr.jamah;
        } else {
            prayerData.asr.jamah = to12Hour(addMinutesToHM(asrStart24, 15));
        }

        // ==============================
        // MAGHRIB
        // ==============================

        const maghribStart24 = maghrib; // from monthly file (HH:MM 24h)
        const maghribAzanDefault24 = addMinutesToHM(maghribStart24, 2);
        const maghribJamahDefault24 = addMinutesToHM(maghribStart24, 5);
        const maghribEnd24 = addMinutesToHM(isha, -2);

        prayerData.maghrib.start = to12Hour(maghribStart24);
        prayerData.maghrib.end = to12Hour(maghribEnd24);

        if (quickData?.maghrib?.specialEnabled === true) {

            console.log("Maghrib Special Mode Enabled");

            // 1️⃣ Get azan
            let azan24;

            // if (quickData.maghrib.azan) {
            //     azan24 = to24Hour(quickData.maghrib.azan);
            // } else {
            //     azan24 = maghribAzanDefault24;
            // }
            azan24 = maghribAzanDefault24;

            // 2️⃣ Get jamah
            let jamah24;

            if (quickData.maghrib.jamahAfterAzan != null) {
                jamah24 = addMinutesToHM(
                    azan24,
                    parseInt(quickData.maghrib.jamahAfterAzan)
                );
            } else if (quickData.maghrib.jamah) {
                jamah24 = to24Hour(quickData.maghrib.jamah);
            } else {
                jamah24 = maghribJamahDefault24;
            }

            prayerData.maghrib.azan = to12Hour(azan24);
            prayerData.maghrib.jamah = to12Hour(jamah24);

        } else {

            console.log("Maghrib Normal Mode");

            prayerData.maghrib.azan = to12Hour(maghribAzanDefault24);
            prayerData.maghrib.jamah = to12Hour(maghribJamahDefault24);
        }

        // ==============================
        // ISHA
        // ==============================

        const ishaStart24 = addMinutesToHM(isha, 2);
        const ishaEnd24 = addMinutesToHM(sahri, -2);

        prayerData.isha.start = to12Hour(ishaStart24);
        prayerData.isha.end = to12Hour(ishaEnd24);

        if (quickData?.isha?.azan) {
            prayerData.isha.azan = quickData.isha.azan;
        } else {
            prayerData.isha.azan = to12Hour(ishaStart24);
        }

        if (quickData?.isha?.jamah) {
            prayerData.isha.jamah = quickData.isha.jamah;
        } else {
            prayerData.isha.jamah = to12Hour(addMinutesToHM(ishaStart24, 15));
        }

        const currentData = JSON.stringify(prayerData);

        if (currentData !== lastRenderedData) {
            lastRenderedData = currentData;
            return true; // something changed
        }

        return false; // nothing changed

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

    video.oncanplay = function () {
        console.log("Video loaded, playing...");
        showVideo();
    };

    video.onerror = function () {
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



let ishaRedirectTriggered = false;

function checkIshaJamahRedirect() {
    const now = new Date();

    console.log(prayerData, "Current prayer data for Isha:", prayerData.isha);

    const ishaJamahTime = parseTime(prayerData.isha.jamah);

    // If time already passed today, don't shift to tomorrow
    const diff = now - ishaJamahTime;

    // If current time is within first 5 seconds of Isha Jamah
    if (diff >= 0 && diff < 5000 && !ishaRedirectTriggered) {
        ishaRedirectTriggered = true;

        // Go to isha.html
        window.location.href = "isha.html";
    }
}

setInterval(checkIshaJamahRedirect, 1000);