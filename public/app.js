const prayerData = {
    fajr: { name: "फ़जर ", arabic: "فجر", start: "04:30 AM", azan: "05:00 AM", jamah: "05:15 AM", end: "06:15 AM" },
    dhuhr: { name: "ज़ोहर ", arabic: "ظهر", start: "12:00 PM", azan: "12:30 PM", jamah: "12:45 PM", end: "03:30 PM" },
    asr: { name: "असर ", arabic: "عصر", start: "03:30 PM", azan: "04:00 PM", jamah: "04:15 PM", end: "05:45 PM" },
    maghrib: { name: "मग़रिब ", arabic: "مغرب", start: "05:50 PM", azan: "05:55 PM", jamah: "06:00 PM", end: "07:15 PM" },
    isha: { name: "इशा ", arabic: "عشاء", start: "07:15 PM", azan: "07:45 PM", jamah: "08:07 PM", end: "10:30 PM" },
};

// Load prayer times from timings.json with cache-busting and change detection
let lastTimingJSON = null;

let lastRenderedData = JSON.stringify(prayerData);

let azanBeeped = {};
let jamahBeeped = {};
let beepInterval = null;
let HIJRI_OFFSET = 0;
let todaySahri = null;
let todayMaghrib = null;

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

function formatDisplayTime(timeStr) {
    // Converts "04:30 AM" → "04:30"
    return timeStr.replace(" AM", "").replace(" PM", "");
}


async function loadHijriOffset() {
    try {
        const res = await fetch('/api/settings?t=' + Date.now(), { cache: 'no-store' });
        const data = await res.json();

        if (typeof data.hijriOffset !== "undefined" && data.hijriOffset !== HIJRI_OFFSET) {
            HIJRI_OFFSET = data.hijriOffset;
        }

    } catch (e) {
        console.error("Error refreshing Hijri offset");
    }
}

loadHijriOffset();

setInterval(async () => {
    loadHijriOffset();
}, 5000);

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

        todaySahri = sahri;
        todayMaghrib = addMinutesToHM(maghrib, 2);

        let changed = false;

        // ==============================
        // FAJR
        // ==============================

        const fajrStart24_normal = addMinutesToHM(sahri, 10);
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

        const asrStart24 = asr;
        const asrEnd24 = maghrib;

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

        prayerData.maghrib.start = to12Hour(maghribAzanDefault24);
        prayerData.maghrib.end = to12Hour(maghribEnd24);

        if (quickData?.maghrib?.specialEnabled === true) {

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
        const urduWeekdays = [
            "इतवार",   // Sunday
            "पीर",      // Monday
            "मंगल",     // Tuesday
            "बुध",      // Wednesday
            "जुमेरात",   // Thursday
            "जुमा",      // Friday
            "हफ्ता"     // Saturday
        ];

        const weekday = urduWeekdays[now.getDay()];
        const day = now.getDate();
        const month = now.toLocaleDateString("hi-IN", { month: "long" });
        const year = now.getFullYear();

        dateEl.innerText = `${weekday}, ${day} ${month} ${year}`;
    }

    if (hijriEl) {

        const islamicDate = new Intl.DateTimeFormat('hi-IN-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).formatToParts(now);

        let day, month, year;

        islamicDate.forEach(part => {
            if (part.type === "day") day = parseInt(part.value);
            if (part.type === "month") month = part.value;
            if (part.type === "year") year = part.value;
        });

        day = day + HIJRI_OFFSET;

        // month will be shown as a large header, date+year beneath it
        hijriEl.innerHTML = `<span class="card-heading"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon w-4 h-4 text-gold"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg> ${month}</span> <span class="hijri-date"> ${day}, ${year} AH</span>`;
        // 🔥 Show Sahri & Iftar
        const sahriEl = document.getElementById("sahriTime");
        const iftarEl = document.getElementById("iftarTime");

        if (sahriEl && todaySahri) {
            sahriEl.innerHTML = `<div class="sahri-iftar-label">सहरी</div> ${to12Hour(todaySahri)}`;
        }

        if (iftarEl && todayMaghrib) {
            iftarEl.innerHTML = `<div class="sahri-iftar-label">इफ़्तार</div> ${to12Hour(todayMaghrib)}`;
        }
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
        return;
    }

    table.innerHTML = "";

    Object.keys(prayerData).forEach(key => {
        const row = document.createElement("tr");
        row.id = key;

        row.innerHTML = `
      <td>${prayerData[key].name}</td>
      <td>${prayerData[key].arabic}</td>
      <td>${formatDisplayTime(prayerData[key].start)}</td>
        <td>${formatDisplayTime(prayerData[key].azan)}</td>
        <td>${formatDisplayTime(prayerData[key].jamah)}</td>
        <td>${formatDisplayTime(prayerData[key].end)}</td>
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
        let prayerTime = parseTime(prayerData[key].jamah);
        if (prayerTime < now) prayerTime.setDate(prayerTime.getDate() + 1);

        const diff = prayerTime - now;
        if (diff < minDiff) {
            minDiff = diff;
            closest = key;
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

function startBeepRepeating() {
    const audio = document.getElementById("beepSound");
    if (!audio) return;

    // Prevent multiple intervals
    if (beepInterval) return;

    beepInterval = setInterval(() => {
        audio.currentTime = 0;
        audio.play().catch(() => { });
    }, 2000); // repeat every 2 seconds
}

function stopBeepRepeating() {
    if (beepInterval) {
        clearInterval(beepInterval);
        beepInterval = null;
    }
}

function updateNextPrayerCountdown() {
    try {
        const now = new Date();
        let closestPrayer = null;
        let closestType = null;
        let minDiff = Infinity;
        let shouldBeep = false;   // 🔥 Important

        Object.keys(prayerData).forEach(key => {

            const azanTime = parseTime(prayerData[key].azan);
            const jamahTime = parseTime(prayerData[key].jamah);

            if (azanTime < now) azanTime.setDate(azanTime.getDate() + 1);
            if (jamahTime < now) jamahTime.setDate(jamahTime.getDate() + 1);

            // 🔥 NOW calculate diff AFTER adjusting date
            const azanDiff = azanTime - now;
            const jamahDiff = jamahTime - now;

            // 🔔 Beep window (first 5 seconds)
            // Beep for ALL Azan
            if (azanDiff > 0 && azanDiff <= 10000) {
                shouldBeep = true;
            }

            // Beep for Jamat EXCEPT Maghrib
            if (jamahDiff > 0 && jamahDiff <= 10000 && key !== "maghrib") {
                shouldBeep = true;
            }

            // Find closest event
            if (azanDiff > 0 && azanDiff < minDiff) {
                minDiff = azanDiff;
                closestPrayer = key;
                closestType = "अज़ान";
            }

            if (jamahDiff > 0 && jamahDiff < minDiff) {
                minDiff = jamahDiff;
                closestPrayer = key;
                closestType = "जमाअत";
            }
        });

        // 🔥 Handle beep OUTSIDE loop
        if (shouldBeep) {
            startBeepRepeating();
        } else {
            stopBeepRepeating();
        }

        const nameEl = document.getElementById('nextPrayerName');
        if (!nameEl) return;

        if (closestPrayer) {
            const displayName =
                prayerData[closestPrayer].arabic +
                ' - ' +
                prayerData[closestPrayer].name;

            // split into a small prefix and larger prayer name for styling
            nameEl.innerHTML = `<span class="prefix card-heading"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock w-4 h-4 text-gold"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> अगली ${closestType}</span><span class="prayer">${displayName}</span>`;

            const hours = Math.floor(minDiff / (1000 * 60 * 60));
            const minutes = Math.floor((minDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((minDiff % (1000 * 60)) / 1000);

            document.getElementById("countHours").innerText =
                String(hours).padStart(2, "0");

            document.getElementById("countMinutes").innerText =
                String(minutes).padStart(2, "0");

            document.getElementById("countSeconds").innerText =
                String(seconds).padStart(2, "0");
        }

    } catch (e) {
        console.error('Error updating next prayer countdown', e);
    }
}

// Start countdown timer
setInterval(updateNextPrayerCountdown, 1000);
updateNextPrayerCountdown();




renderTable();
// ------------------------------------------------
// automatic view scheduler (30m index ↔ 10m surah-hadith)
// surah-hadith will not open if the next azan/jamah
// is less than 20 minutes away.
// ------------------------------------------------

const SURAH_DURATION = 10 * 60 * 1000;
const INDEX_DURATION = 30 * 60 * 1000;
let scheduleLastSwitch = Date.now();
let scheduleViewingSurah = window.location.pathname.endsWith('surah-hadith.html');

function minutesUntilNextAzanJamah() {
    const now = new Date();
    let min = Infinity;
    Object.keys(prayerData).forEach(key => {
        ['azan'].forEach(type => {
            let t = parseTime(prayerData[key][type]);
            if (t < now) t.setDate(t.getDate() + 1);
            const diff = (t - now) / 60000;
            if (diff < min) min = diff;
        });
    });
    return Math.floor(min);
}

function scheduleSwitcher() {
    const now = new Date();
    const elapsed = now - scheduleLastSwitch;

    // Check if it's Ramadan and Isha Jamat is over
    const isRamadan = checkIfRamadan(); // Assume this function determines if it's Ramadan
    const ishaJamatTime = parseTime(prayerData['isha']['jamat']); // Get Isha Jamat time
    const trabihEndTime = new Date(ishaJamatTime.getTime() + 90 * 60 * 1000); // Add 1 hour 30 minutes

    if (isRamadan && now > ishaJamatTime && now < trabihEndTime) {
        if (!window.location.pathname.endsWith('ramadan-isha.html')) {
            window.location.href = 'ramadan-isha.html';
        }
        return;
    }

    // Check if it's Friday and time is between 12:30 PM and 2:30 PM
    const isFriday = now.getDay() === 2; // 5 represents Friday
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Time in minutes since midnight
    const startJumaTime = 14 * 60 + 40; // 12:30 PM in minutes
    const endJumaTime = 14 * 60 + 43; // 2:30 PM in minutes

    if (isFriday && currentTime >= startJumaTime && currentTime < endJumaTime) {
        if (!window.location.pathname.endsWith('juma.html')) {
            window.location.href = 'juma.html';
        }
        return;
    }

    if (scheduleViewingSurah) {
        if (elapsed >= SURAH_DURATION) {
            // switch back to index
            window.location.href = 'index.html';
        }
    } else {
        if (elapsed >= INDEX_DURATION) {
            const mins = minutesUntilNextAzanJamah();
            if (mins >= 20) {
                window.location.href = 'surah-hadith.html';
            }
        }
    }
}

function checkIfRamadan() {
    const now = new Date();

    const islamicDate = new Intl.DateTimeFormat('hi-IN-u-ca-islamic').formatToParts(now);

    let month;
    islamicDate.forEach(part => {
        if (part.type === "month") month = part.value;
    });
    return month == 9
}

setInterval(scheduleSwitcher, 1000);


async function loadVerses() {
    const res = await fetch('/api/verses');
    const verses = await res.json();

    if (!verses.length) return;

    let index = 0;

    function showVerse() {
        const verse = verses[index];

        const refEl = document.getElementById('verseReference');
        const textEl = document.getElementById('verseText');

        if (!refEl || !textEl) return; // stop if elements not found

        refEl.innerText = verse.reference;
        textEl.innerText = verse.text;

        index = (index + 1) % verses.length;
    }

    showVerse();

    // Rotate every 20 seconds
    setInterval(showVerse, 20000);


}

loadVerses();


let audioUnlocked = false;

function unlockAudio() {
    const audio = document.getElementById("beepSound");
    if (!audioUnlocked && audio) {
        audio.play().then(() => {
            audio.pause();
            audio.currentTime = 0;
            audioUnlocked = true;
            console.log("Audio unlocked");
        }).catch(() => { });
    }
}

document.addEventListener("click", unlockAudio);
document.addEventListener("touchstart", unlockAudio);