const prayerData = {
    fajr: { name: "फ़जर ", arabic: "فجر", start: "04:30 AM", azan: "05:00 AM", jamah: "05:15 AM", end: "06:15 AM" },
    dhuhr: { name: "ज़ोहर ", arabic: "ظهر", start: "12:00 PM", azan: "12:30 PM", jamah: "12:45 PM", end: "03:30 PM" },
    asr: { name: "असर ", arabic: "عصر", start: "03:30 PM", azan: "04:00 PM", jamah: "04:15 PM", end: "05:45 PM" },
    maghrib: { name: "मग़रिब ", arabic: "مغرب", start: "05:50 PM", azan: "05:55 PM", jamah: "06:00 PM", end: "07:15 PM" },
    isha: { name: "इशा ", arabic: "عشاء", start: "07:15 PM", azan: "07:45 PM", jamah: "08:07 PM", end: "10:30 PM" },
};

// default Juma times (can be updated dynamically if needed)
const jumaData = {
    azan: "01:00 PM",
    khutba: "01:45 PM",
    jamat: "02:00 PM"
};

// Load prayer times from timings.json with cache-busting and change detection
let lastTimingJSON = null;

let lastRenderedData = JSON.stringify(prayerData);

let azanBeeped = {};
let jamahBeeped = {};
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

// ============================================
// MASJID DISPLAY BEEP SYSTEM (Stable Version)
// ============================================

let lastBeepWindow = false;
let beepAudio;

window.addEventListener("DOMContentLoaded", () => {
    beepAudio = document.getElementById("beepSound");

    // Unlock audio automatically
    const unlockAudio = () => {

        beepAudio.muted = false;

        beepAudio.play()
            .then(() => {
                beepAudio.pause();
                beepAudio.currentTime = 0;
                console.log("Audio unlocked");
            })
            .catch(() => { });

        document.removeEventListener("click", unlockAudio);
        document.removeEventListener("touchstart", unlockAudio);
        document.removeEventListener("keydown", unlockAudio);
    };

    document.addEventListener("click", unlockAudio);
    document.addEventListener("touchstart", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
});


function playLongBeep() {

    if (!beepAudio) return;

    beepAudio.pause();
    beepAudio.currentTime = 0;
    beepAudio.volume = 1;

    beepAudio.play().catch(err => {
        console.log("Beep blocked", err);
    });

}

function startBeepSequence() {

    playLongBeep();

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

// setInterval(async () => {
//     loadHijriOffset();
// }, 5000);

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

        // quickData may carry overrides for juma times
        if (quickData?.juma) {
            if (quickData.juma.azan) jumaData.azan = quickData.juma.azan;
            if (quickData.juma.khutba) jumaData.khutba = quickData.juma.khutba;
            if (quickData.juma.jamat) jumaData.jamat = quickData.juma.jamat;
        }

        let changed = false;

        // ==============================
        // FAJR
        // ==============================

        const fajrStart24_normal = addMinutesToHM(sahri, 11);
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
}, 60 * 1000);

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
            "सनीचर"     // Saturday
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
        hijriEl.innerHTML = `<span class="card-heading"><svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon w-4 h-4 text-gold"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg> ${month}</span> <span class="hijri-date"> ${day}, ${year} AH</span>`;
        // 🔥 Show Sahri & Iftar
        const sahriEl = document.getElementById("sahriTime");
        const iftarEl = document.getElementById("iftarTime");

        if (sahriEl && todaySahri) {
            sahriEl.innerHTML = `<div class="sahri-iftar-label">सहरी</div> ${formatDisplayTime(to12Hour(todaySahri))}`;
        }

        if (iftarEl && todayMaghrib) {
            iftarEl.innerHTML = `<div class="sahri-iftar-label">इफ़्तार</div> ${formatDisplayTime(to12Hour(todayMaghrib))}`;
        }
    }
}

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
      <td>${formatDisplayTime(prayerData[key].azan)}</td>
      <td>${formatDisplayTime(prayerData[key].jamah)}</td>
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

function to24Hour(timeStr) {

    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");

    hours = parseInt(hours);

    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;

    return String(hours).padStart(2, '0') + ":" + minutes;

}

// helper: convert a 12‑hour string to minutes-since-midnight
function toMinutes(timeStr) {
    const d = parseTime(timeStr);
    return d.getHours() * 60 + d.getMinutes();
}

function highlightNextPrayer() {
    const now = new Date();
    const isFriday = now.getDay() === 5;
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const endJumaTime = 14 * 60 + 40;
    const fajrJamahMinutes = toMinutes(prayerData.fajr.jamah);
    let closest = null;
    let minDiff = Infinity;

    // clear previous active rows
    document.querySelectorAll('tbody tr').forEach(r => r.classList.remove('active-row'));
    // clear any juma highlights
    document.querySelectorAll('.juma-time-box').forEach(el => el.classList.remove('active-row'));

    // if friday & after fajr jamah & before juma end, highlight juma event instead of normal rows
    if (isFriday && currentTime >= fajrJamahMinutes && currentTime < endJumaTime) {
        const jamatTime = parseTime(jumaData.jamat);

        // If Jamat time has passed, keep highlighting Jamat box
        if (now >= jamatTime) {
            const box = document.querySelector('#jumaJamatTime')?.closest('.juma-time-box');
            if (box) box.classList.add('active-row');
        } else {
            // Otherwise, find the next upcoming event (Azan, Khutba, or Jamat)
            const events = [
                { type: 'अज़ान', time: parseTime(jumaData.azan), selector: '#jumaAzanTime' },
                { type: 'ख़ुत्बा', time: parseTime(jumaData.khutba), selector: '#jumaKhutbaTime' },
                { type: 'जमाअत', time: parseTime(jumaData.jamat), selector: '#jumaJamatTime' }
            ];
            events.forEach(ev => {
                let t = new Date(ev.time);
                if (t < now) t.setDate(t.getDate() + 1);
                const diff = t - now;
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = ev;
                }
            });
            if (closest && closest.selector) {
                const box = document.querySelector(closest.selector)?.closest('.juma-time-box');
                if (box) box.classList.add('active-row');
            }
        }
        return;
    }

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


let popupShown = false;

function showJamatPopup(prayerKey) {

    const popup = document.getElementById("jamatPopup");
    if (!popup) return;


    document.getElementById("popupClock").innerText = formatDisplayTime(prayerData[prayerKey].jamah);

    const prayerName =
        prayerData[prayerKey].arabic + " - " + prayerData[prayerKey].name;

    document.getElementById("popupPrayerName").innerText =
        prayerName + " जमाअत";

    popup.style.display = "flex";

    popupShown = true;

    // Hide after 2 minutes
    setTimeout(() => {
        popup.style.display = "none";
        popupShown = false;
    }, 1000 * 60 * 5);
}


function getUpcomingEvents() {

    const now = new Date();
    const events = [];

    // Sahri
    if (todaySahri) {
        let t = parseTime(to12Hour(todaySahri));
        if (t < now) t.setDate(t.getDate() + 1);

        events.push({
            name: "सहरी खत्म",
            type: "सहरी",
            time: t
        });
    }

    // Prayer Azan + Jamat
    Object.keys(prayerData).forEach(key => {

        let az = parseTime(prayerData[key].azan);
        let jm = parseTime(prayerData[key].jamah);

        if (az < now) az.setDate(az.getDate() + 1);
        if (jm < now) jm.setDate(jm.getDate() + 1);

        const jmdiff = now - jm;

        if (jmdiff <= 0 && jmdiff > -2000 && !popupShown) {
            setTimeout(() => {
                showJamatPopup(key);
            }, 1000); // slight delay to ensure it doesn't clash with the beep
        }


        events.push({
            name: prayerData[key].arabic + " - " + prayerData[key].name,
            type: "अज़ान",
            prayer: key,
            time: az
        });

        if (key !== "maghrib") {
            events.push({
                name: prayerData[key].arabic + " - " + prayerData[key].name,
                type: "जमाअत",
                prayer: key,
                time: jm
            });
        }
    });

    // Friday Juma events
    const nowDay = now.getDay();

    if (nowDay === 5) {

        let az = parseTime(jumaData.azan);
        let kh = parseTime(jumaData.khutba);
        let jm = parseTime(jumaData.jamat);

        const jmdiff = now - jm;

        if (jmdiff <= 0 && jmdiff > -2000 && !popupShown) {
            setTimeout(() => {
                showJamatPopup(key);
            }, 1000); // slight delay to ensure it doesn't clash with the beep
        }

        if (az < now) az.setDate(az.getDate() + 7);
        if (kh < now) kh.setDate(kh.getDate() + 7);
        if (jm < now) jm.setDate(jm.getDate() + 7);

        events.push({ name: "जुमा", type: "अज़ान", time: az });
        events.push({ name: "जुमा", type: "ख़ुत्बा", time: kh });
        events.push({ name: "जुमा", type: "जमाअत", time: jm });
    }

    return events;
}

function updateNextPrayerCountdown() {
    try {
        const now = new Date();
        const isFriday = now.getDay() === 5; // keep same logic as scheduleSwitcher
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const endJumaTime = 14 * 60 + 40;
        const fajrJamahMinutes = toMinutes(prayerData.fajr.jamah);

        // always refresh displayed juma section values
        const azEl = document.getElementById("jumaAzanTime");
        const khEl = document.getElementById("jumaKhutbaTime");
        const jmEl = document.getElementById("jumaJamatTime");
        if (azEl) azEl.innerText = formatDisplayTime(to12Hour(jumaData.azan));
        if (khEl) khEl.innerText = formatDisplayTime(to12Hour(jumaData.khutba));
        if (jmEl) jmEl.innerText = formatDisplayTime(to12Hour(jumaData.jamat));
        // also update boxes on juma.html (same ids) if present
        document.querySelectorAll('#jumaAzanTime,#jumaKhutbaTime,#jumaJamatTime').forEach(el => {
            if (el.id === 'jumaAzanTime') el.innerText = formatDisplayTime(to12Hour(jumaData.azan));
            if (el.id === 'jumaKhutbaTime') el.innerText = formatDisplayTime(to12Hour(jumaData.khutba));
            if (el.id === 'jumaJamatTime') el.innerText = formatDisplayTime(to12Hour(jumaData.jamat));
        });

        // handle friday/juma countdown separately until endJumaTime
        if (isFriday && currentTime >= fajrJamahMinutes && currentTime < endJumaTime) {
            let closestType = null;
            let minDiff = Infinity;
            let shouldBeep = false;

            const jamatTime = parseTime(jumaData.jamat);
            
            // If Jamat time has passed, keep the Jamat event highlighted
            if (now >= jamatTime) {
                closestType = "जमाअत";
                const diff = now - jamatTime; // Time since jamat started
                minDiff = 0; // Keep it at 0 so countdown shows 00:00:00
            } else {
                // Otherwise find the next upcoming event
                const events = [
                    { type: "अज़ान", time: parseTime(jumaData.azan) },
                    { type: "ख़ुत्बा", time: parseTime(jumaData.khutba) },
                    { type: "जमाअत", time: parseTime(jumaData.jamat) }
                ];

                events.forEach(ev => {
                    let t = new Date(ev.time);
                    if (t < now) t.setDate(t.getDate() + 1);
                    const diff = t - now;
                    if (diff > 0 && diff < minDiff) {
                        minDiff = diff;
                        closestType = ev.type;
                    }
                    if (diff > 0 && diff <= 1000) {
                        shouldBeep = true;
                    }
                });
            }

            if (shouldBeep && !lastBeepWindow) {
                startBeepSequence();
                lastBeepWindow = true;
            }

            if (!shouldBeep) {
                lastBeepWindow = false;
            }
            const nameEl = document.getElementById('nextPrayerName');
            if (nameEl && closestType) {
                nameEl.innerHTML = `<span class="prefix card-heading"><svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock w-4 h-4 text-gold"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> अगली ${closestType}</span><span class="prayer">जुमा</span>`;

                const hours = Math.floor(Math.max(0, minDiff) / (1000 * 60 * 60));
                const minutes = Math.floor((Math.max(0, minDiff) % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((Math.max(0, minDiff) % (1000 * 60)) / 1000);

                document.getElementById("countHours").innerText =
                    String(hours).padStart(2, "0");
                document.getElementById("countMinutes").innerText =
                    String(minutes).padStart(2, "0");
                document.getElementById("countSeconds").innerText =
                    String(seconds).padStart(2, "0");

                // highlight the corresponding juma box
                document.querySelectorAll('.juma-time-box').forEach(el => el.classList.remove('active-row'));
                let selector = null;
                if (closestType === 'अज़ान') selector = '#jumaAzanTime';
                else if (closestType === 'ख़ुत्बा') selector = '#jumaKhutbaTime';
                else if (closestType === 'जमाअत') selector = '#jumaJamatTime';
                if (selector) {
                    const box = document.querySelector(selector)?.closest('.juma-time-box');
                    if (box) box.classList.add('active-row');
                }
            }
            return;
        }

        // fallback to normal prayer countdown
        let minDiff = Infinity;
        let shouldBeep = false;   // 🔥 Important

        const events = getUpcomingEvents();

        let closest = null;

        events.forEach(ev => {

            const diff = ev.time - now;

            if (diff > 0 && diff < minDiff) {
                minDiff = diff;
                closest = ev;
            }

            if (diff > 500 && diff <= 1500) {
                shouldBeep = true;
            }
        });


        if (closest) {

            const nameEl = document.getElementById("nextPrayerName");

            nameEl.innerHTML =
                `<span class="prefix card-heading">
        <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round"
        class="lucide lucide-clock w-4 h-4 text-gold">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
        </svg> अगली ${closest.type}</span>
        <span class="prayer">${closest.name}</span>`;

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



        if (shouldBeep && !lastBeepWindow) {
            startBeepSequence();
            lastBeepWindow = true;
        }

        if (!shouldBeep) {
            lastBeepWindow = false;
        }

    } catch (e) {
        console.error('Error updating next prayer countdown', e);
    }
}

// Start countdown timer and highlight events
setInterval(() => {
    updateNextPrayerCountdown();
}, 500);

updateNextPrayerCountdown();
highlightNextPrayer();






renderTable();

// ------------------------------------------------
// automatic view scheduler (30m index ↔ 10m surah-hadith)
// surah-hadith will not open if the next azan/jamah
// is less than 20 minutes away.
// ------------------------------------------------

const SURAH_DURATION = 3 * 60 * 1000;
const INDEX_DURATION = 15 * 60 * 1000;
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
    const ishaJamatTime = parseTime(prayerData['isha']['jamah']) // Get Isha Jamat time
    const trabihEndTime = new Date(ishaJamatTime.getTime() + 90 * 60 * 1000); // Add 1 hour 30 minutes

    if (isRamadan && (now > ishaJamatTime) && (now < trabihEndTime)) {
        if (!window.location.pathname.endsWith('ramadan-isha.html')) {
            window.location.href = 'ramadan-isha.html';
        }
        return;
    }

    // Check if it's Friday and time is between 12:30 PM and 2:30 PM
    const isFriday = now.getDay() === 5; // 5 represents Friday
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Time in minutes since midnight
    const startJumaTime = 12 * 60 + 30; // 12:30 PM in minutes
    const endJumaTime = 14 * 60 + 40; // 2:30 PM in minutes

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


function mainLoop() {

    updateClock();
    updateNextPrayerCountdown();
    highlightNextPrayer();
    scheduleSwitcher();

}

setInterval(mainLoop, 1000);


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
