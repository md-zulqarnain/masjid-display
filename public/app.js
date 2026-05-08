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
let tomorrowSahri = null;
let tomorrowMaghrib = null;

const islamicMonths = [
    "मुहर्रम",
    "सफर",
    "रबीउल अव्वल",
    "रबीउल आखिर",
    "जुमादा अल अव्वल",
    "जुमादा अल आखिर",
    "रजब",
    "शाबान",
    "रमज़ान",
    "शव्वाल",
    "ज़िलक़ादा",
    "ज़िलहिज्जा"
];



function getDefaultJamahAfterAzan(prayer) {
    if (prayer === 'fajr') return 30;
    if (prayer === 'maghrib') return 5;
    return 15;
}

function getJamahAfterAzan(config, prayer) {
    const savedMinutes = parseInt(config?.jamahAfterAzan);
    if (!Number.isNaN(savedMinutes)) return savedMinutes;

    return getDefaultJamahAfterAzan(prayer);
}



function getQuarterHourAzanAndJamah(baseTime, jamahAfterAzan = 15) {
    const azan = roundHMUpToMinutes(addMinutesToHM(baseTime, 2), 15);
    return {
        azan,
        jamah: addMinutesToHM(azan, jamahAfterAzan)
    };
}

function getAutoFajrTimes(dayObj, fajrConfig) {
    const jamahAfterAzan = getJamahAfterAzan(fajrConfig, 'fajr');

    if (fajrConfig?.specialEnabled === true) {
        const azan = addMinutesToHM(dayObj.Sahri, fajrConfig.azanAfterSahri || 0);
        return {
            azan,
            jamah: addMinutesToHM(azan, jamahAfterAzan)
        };
    }

    const azan = roundHMDownToMinutes(addMinutesToHM(dayObj.Sunrise, -60), 5);
    return {
        azan,
        jamah: addMinutesToHM(azan, jamahAfterAzan)
    };
}

function getTimingDayFromData(data, day) {
    return Array.isArray(data)
        ? (data.find(d => d.day === day) || data[day - 1])
        : null;
}

async function getTimingDayForDate(date, currentMonth, currentMonthData) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const data = month === currentMonth
        ? currentMonthData
        : await fetch(`/api/timings/${month}`).then(res => res.ok ? res.json() : null);

    return getTimingDayFromData(data, day);
}

function samePrayerTimes(first, second) {
    return first?.azan === second?.azan && first?.jamah === second?.jamah;
}



function buildTimingChangeMessage(prefix, prayerName, times) {
    let colorClass = '';
    if (prayerName === 'फ़जर') colorClass = 'marquee-fajr';
    else if (prayerName === 'असर') colorClass = 'marquee-asr';
    else if (prayerName === 'इशा') colorClass = 'marquee-isha';

    return `<span class="${colorClass}">${prefix} इंशाअल्लाह ${prayerName} की अज़ान ${formatDisplayTime(to12Hour(times.azan))} और जमात ${formatDisplayTime(to12Hour(times.jamah))} पर होगी</span>`;
}

function updateTimingChangeMarquee(messages) {
    const marquee = document.getElementById('timingChangeMarquee');
    const text = document.getElementById('timingChangeText');
    if (!marquee || !text) return;

    if (!messages.length) {
        marquee.style.display = 'none';
        text.innerHTML = '';
        return;
    }

    text.innerHTML = messages.join('');
    marquee.style.display = 'block';
}



// ============================================
// MASJID DISPLAY BEEP SYSTEM (Stable Version)
// ============================================

let lastBeepWindow = false;
let beepAudio;
let BEEP_VOLUME = 1;
let DISPLAY_THEME = "auto";

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
    beepAudio.playbackRate = 1;
    beepAudio.volume = BEEP_VOLUME;

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

        if (typeof data.beepVolume !== "undefined") {
            const volume = Number(data.beepVolume);
            if (!Number.isNaN(volume)) {
                BEEP_VOLUME = Math.min(1, Math.max(0, volume));
                if (beepAudio) beepAudio.volume = BEEP_VOLUME;
            }
        }

        if (typeof data.displayTheme === "string") {
            DISPLAY_THEME = data.displayTheme;
            updateDynamicBackground();
        }

    } catch (e) {
        console.error("Error refreshing Hijri offset");
    }
}

loadHijriOffset();

setInterval(async () => {
    loadHijriOffset();
}, 60000);

function connectRemoteBeepEvents() {
    if (!window.EventSource) return;

    const source = new EventSource('/api/display/events');

    source.addEventListener('beep', event => {
        try {
            const data = JSON.parse(event.data || '{}');
            if (typeof data.volume !== "undefined") {
                const volume = Number(data.volume);
                if (!Number.isNaN(volume)) {
                    BEEP_VOLUME = Math.min(1, Math.max(0, volume));
                    if (beepAudio) beepAudio.volume = BEEP_VOLUME;
                }
            }
        } catch (e) {
            console.error("Error reading beep event");
        }

        startBeepSequence();
    });

    source.addEventListener('theme', event => {
        try {
            const data = JSON.parse(event.data || '{}');
            if (typeof data.displayTheme === "string") {
                DISPLAY_THEME = data.displayTheme;
                updateDynamicBackground();
            }
        } catch (e) {
            console.error("Error reading theme event");
        }
    });

    source.addEventListener('reload', () => {
        window.location.reload();
    });

    source.onerror = () => {
        console.error("Beep event connection interrupted; browser will retry automatically");
    };
}

connectRemoteBeepEvents();

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
        const dayObj = getTimingDayFromData(mdata, day);

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

        if (quickData?.fajr?.useCustomTime === true) {

            // Custom Fajr time from admin panel

            const defaultFajrAzan24 = roundHMDownToMinutes(addMinutesToHM(sunrise, -60), 5);
            const fajrAzan24 = normalizeToHM(quickData.fajr.azan) || defaultFajrAzan24;
            const fajrJamah24 = addMinutesToHM(fajrAzan24, getJamahAfterAzan(quickData.fajr, 'fajr'));

            prayerData.fajr.start = to12Hour(fajrStart24_normal);
            prayerData.fajr.azan = to12Hour(fajrAzan24);
            prayerData.fajr.jamah = to12Hour(fajrJamah24);
            prayerData.fajr.end = to12Hour(fajrEnd24);

        } else if (quickData?.fajr?.specialEnabled === true) {

            // Sahri based Fajr timing from existing admin settings

            const fajrTimes = getAutoFajrTimes(dayObj, quickData?.fajr);

            prayerData.fajr.start = to12Hour(fajrStart24_normal);
            prayerData.fajr.azan = to12Hour(fajrTimes.azan);
            prayerData.fajr.jamah = to12Hour(fajrTimes.jamah);
            prayerData.fajr.end = to12Hour(fajrEnd24);

        } else {

            // Automatic Fajr time from today's Sunrise

            const fajrTimes = getAutoFajrTimes(dayObj, quickData?.fajr);

            prayerData.fajr.start = to12Hour(fajrStart24_normal);
            prayerData.fajr.azan = to12Hour(fajrTimes.azan);
            prayerData.fajr.jamah = to12Hour(fajrTimes.jamah);
            prayerData.fajr.end = to12Hour(fajrEnd24);
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

        prayerData.dhuhr.jamah = to12Hour(addMinutesToHM(normalizeToHM(prayerData.dhuhr.azan), getJamahAfterAzan(quickData?.dhuhr, 'dhuhr')));

        // ==============================
        // ASR
        // ==============================

        const asrStart24 = asr;
        const asrEnd24 = maghrib;
        const asrAutoTimes = getQuarterHourAzanAndJamah(asrStart24, getJamahAfterAzan(quickData?.asr, 'asr'));

        prayerData.asr.start = to12Hour(asrStart24);
        prayerData.asr.end = to12Hour(asrEnd24);

        if (quickData?.asr?.useCustomTime === true && quickData?.asr?.azan) {
            prayerData.asr.azan = quickData.asr.azan;
        } else {
            prayerData.asr.azan = to12Hour(asrAutoTimes.azan);
        }

        prayerData.asr.jamah = to12Hour(addMinutesToHM(normalizeToHM(prayerData.asr.azan), getJamahAfterAzan(quickData?.asr, 'asr')));

        // ==============================
        // MAGHRIB
        // ==============================

        const maghribStart24 = maghrib; // from monthly file (HH:MM 24h)
        const maghribAzanDefault24 = addMinutesToHM(maghribStart24, 2);
        const maghribJamahAfterAzan = getJamahAfterAzan(quickData?.maghrib, 'maghrib');
        const maghribJamahDefault24 = addMinutesToHM(maghribAzanDefault24, maghribJamahAfterAzan);
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

            jamah24 = addMinutesToHM(azan24, maghribJamahAfterAzan);

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

        prayerData.isha.start = to12Hour(isha);
        prayerData.isha.end = to12Hour(sahri);

        const ishaAutoTimes = getQuarterHourAzanAndJamah(isha, getJamahAfterAzan(quickData?.isha, 'isha'));

        if (quickData?.isha?.useCustomTime === true && quickData?.isha?.azan) {
            prayerData.isha.azan = quickData.isha.azan;
        } else {
            prayerData.isha.azan = to12Hour(ishaAutoTimes.azan);
        }

        prayerData.isha.jamah = to12Hour(addMinutesToHM(normalizeToHM(prayerData.isha.azan), getJamahAfterAzan(quickData?.isha, 'isha')));

        const timingMessages = [];
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        const tomorrowObj = await getTimingDayForDate(tomorrow, month, mdata);
        const yesterdayObj = await getTimingDayForDate(yesterday, month, mdata);

        if (tomorrowObj) {
            tomorrowSahri = tomorrowObj.Sahri;
            tomorrowMaghrib = addMinutesToHM(tomorrowObj.Maghrib, 2);
        } else {
            tomorrowSahri = null;
            tomorrowMaghrib = null;
        }

        if (quickData?.fajr?.useCustomTime !== true) {
            const todayFajrTimes = getAutoFajrTimes(dayObj, quickData?.fajr);
            let fajrMessageAdded = false;

            if (yesterdayObj) {
                const yesterdayFajrTimes = getAutoFajrTimes(yesterdayObj, quickData?.fajr);
                if (!samePrayerTimes(yesterdayFajrTimes, todayFajrTimes) && isBeforeHM(fajrStart24_normal, now)) {
                    timingMessages.push(buildTimingChangeMessage('आज से', 'फ़जर', todayFajrTimes));
                    fajrMessageAdded = true;
                }
            }

            if (!fajrMessageAdded && tomorrowObj) {
                const tomorrowFajrTimes = getAutoFajrTimes(tomorrowObj, quickData?.fajr);
                if (!samePrayerTimes(todayFajrTimes, tomorrowFajrTimes)) {
                    timingMessages.push(buildTimingChangeMessage('कल से', 'फ़जर', tomorrowFajrTimes));
                }
            }
        }

        if (quickData?.asr?.useCustomTime !== true) {
            const asrJamahAfterAzan = getJamahAfterAzan(quickData?.asr, 'asr');
            const todayAsrTimes = getQuarterHourAzanAndJamah(dayObj.Asr, asrJamahAfterAzan);
            let asrMessageAdded = false;

            if (yesterdayObj) {
                const yesterdayAsrTimes = getQuarterHourAzanAndJamah(yesterdayObj.Asr, asrJamahAfterAzan);
                if (!samePrayerTimes(yesterdayAsrTimes, todayAsrTimes) && isBeforeHM(dayObj.Asr, now)) {
                    timingMessages.push(buildTimingChangeMessage('आज से', 'असर', todayAsrTimes));
                    asrMessageAdded = true;
                }
            }

            if (!asrMessageAdded && tomorrowObj) {
                const tomorrowAsrTimes = getQuarterHourAzanAndJamah(tomorrowObj.Asr, asrJamahAfterAzan);
                if (!samePrayerTimes(todayAsrTimes, tomorrowAsrTimes)) {
                    timingMessages.push(buildTimingChangeMessage('कल से', 'असर', tomorrowAsrTimes));
                }
            }
        }

        if (yesterdayObj && quickData?.isha?.useCustomTime !== true) {
            const ishaJamahAfterAzan = getJamahAfterAzan(quickData?.isha, 'isha');
            const yesterdayIshaTimes = getQuarterHourAzanAndJamah(yesterdayObj.Isha, ishaJamahAfterAzan);
            const todayIshaTimes = getQuarterHourAzanAndJamah(dayObj.Isha, ishaJamahAfterAzan);
            if (!samePrayerTimes(yesterdayIshaTimes, todayIshaTimes) && isBeforeHM(dayObj.Isha, now)) {
                timingMessages.push(buildTimingChangeMessage('आज से', 'इशा', todayIshaTimes));
            }
        }

        updateTimingChangeMarquee(timingMessages);

        // ==============================
        // EXTRA ISLAMIC TIMES (moved here to use loaded data)
        // ==============================

        // Tulu (Sunrise)
        const tuluStart = sunrise;

        // Ishraq
        const ishraqStart = addMinutesToHM(sunrise, 15);
        const ishraqEnd = addMinutesToHM(sunrise, 20);

        // Chasht (Duha)
        const chashtStart = ishraqEnd;
        const chashtEnd = addMinutesToHM(zohar, -15);

        // Tahajjud (Last 1/3 of night)
        function calculateTahajjudRange(sahriTime, maghribTime) {
            const [sh, sm] = sahriTime.split(":").map(Number);
            const [mh, mm] = maghribTime.split(":").map(Number);

            let fajrTime = new Date();
            fajrTime.setHours(sh, sm, 0, 0);

            let maghribTime_date = new Date();
            maghribTime_date.setHours(mh, mm, 0, 0);

            // adjust for next day
            if (fajrTime <= maghribTime_date) {
                fajrTime.setDate(fajrTime.getDate() + 1);
            }

            const nightDuration = fajrTime - maghribTime_date;
            const tahajjudPortion = 1 / 3;
            const tahajjudStart = new Date(fajrTime.getTime() - (nightDuration * tahajjudPortion));

            return {
                start: String(tahajjudStart.getHours()).padStart(2, "0") + ":" + String(tahajjudStart.getMinutes()).padStart(2, "0"),
                end: sahriTime
            };
        }

        const tahajjudTime = calculateTahajjudRange(sahri, maghrib);

        // Update global extraTimes object
        window.extraTimes = {
            tahajjudStart: formatDisplayTime(to12Hour(tahajjudTime.start)),
            tahajjudEnd: formatDisplayTime(to12Hour(tahajjudTime.end)),
            tulu: formatDisplayTime(to12Hour(tuluStart)),
            ishraqStart: formatDisplayTime(to12Hour(ishraqStart)),
            ishraqEnd: formatDisplayTime(to12Hour(ishraqEnd)),
            chashtStart: formatDisplayTime(to12Hour(chashtStart)),
            chashtEnd: formatDisplayTime(to12Hour(chashtEnd))
        };

        // Update UI elements
        const tahajjudEl = document.getElementById("tahajjudTime");
        const ishraqEl = document.getElementById("ishraqTime");
        const chashtEl = document.getElementById("chashtTime");

        if (tahajjudEl) tahajjudEl.innerText = `${window.extraTimes.tahajjudStart} - ${window.extraTimes.tahajjudEnd}`;
        if (ishraqEl) ishraqEl.innerText = `${window.extraTimes.ishraqStart} - ${window.extraTimes.ishraqEnd}`;
        if (chashtEl) chashtEl.innerText = `${window.extraTimes.chashtStart} - ${window.extraTimes.chashtEnd}`;

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
        let hijriNow = new Date(now);
        let jumpNextDay = false;

        if (todayMaghrib) {
            const [mh, mm] = todayMaghrib.split(":").map(Number);
            const maghribTime = new Date(now);
            maghribTime.setHours(mh, mm + 60, 0, 0); // 1 hour after Maghrib

            if (now > maghribTime) {
                jumpNextDay = true;
                hijriNow.setDate(hijriNow.getDate() + 1);
            }
        }

        const islamicDate = new Intl.DateTimeFormat('hi-IN-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).formatToParts(hijriNow);

        const formatter = new Intl.DateTimeFormat('en-u-ca-islamic', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
        });

        const parts = formatter.formatToParts(hijriNow);

        let day, month, year;

        parts.forEach(part => {
            if (part.type === "day") day = parseInt(part.value);
            if (part.type === "month") month = parseInt(part.value); // ✅ NUMBER (1–12)
            if (part.type === "year") year = parseInt(part.value);
        });

        day = day + HIJRI_OFFSET;

        if (day <= 0) {
            day = 30 + day; // fallback

            month -= 1;

            if (month <= 0) {
                month = 12;
                year -= 1;
            }
        }

        const monthName = islamicMonths[month - 1];

        // month will be shown as a large header, date+year beneath it
        hijriEl.innerHTML = `<span class="card-heading"><svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon w-4 h-4 text-gold"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg> ${monthName}</span> <span class="hijri-date"> ${day}, ${year} AH</span>`;
        // 🔥 Show Sahri & Iftar
        const sahriEl = document.getElementById("sahriTime");
        const iftarEl = document.getElementById("iftarTime");

        const displaySahri = jumpNextDay && tomorrowSahri ? tomorrowSahri : todaySahri;
        const displayMaghrib = jumpNextDay && tomorrowMaghrib ? tomorrowMaghrib : todayMaghrib;

        if (sahriEl && displaySahri) {
            sahriEl.innerHTML = `<div class="sahri-iftar-label">सहरी</div> ${formatDisplayTime(to12Hour(displaySahri))}`;
        }

        if (iftarEl && displayMaghrib) {
            iftarEl.innerHTML = `<div class="sahri-iftar-label">इफ़्तार</div> ${formatDisplayTime(to12Hour(displayMaghrib))}`;
        }
    }
}

updateClock();

// Load prayer times on page load and then render table
async function initializePage() {
    await loadPrayerTimesForToday();
    renderTable();
    updateCurrentAndNextPrayerTimes();
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
      <td>${formatDisplayTime(prayerData[key].azan)}</td>
      <td>${formatDisplayTime(prayerData[key].jamah)}</td>
    `;

        table.appendChild(row);
    });

    highlightNextPrayer();
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



let popupShown = false;

function getTrueIslamicDate(dateObj) {
    let hijriNow = new Date(dateObj);
    if (todayMaghrib) {
        const [mh, mm] = todayMaghrib.split(":").map(Number);
        const maghribTime = new Date(dateObj);
        maghribTime.setHours(mh, mm, 0, 0);
        if (dateObj >= maghribTime) {
            hijriNow.setDate(hijriNow.getDate() + 1);
        }
    }
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    });
    const parts = formatter.formatToParts(hijriNow);
    let day, month, year;
    parts.forEach(part => {
        if (part.type === "day") day = parseInt(part.value);
        if (part.type === "month") month = parseInt(part.value);
        if (part.type === "year") year = parseInt(part.value);
    });
    day = day + HIJRI_OFFSET;
    if (day <= 0) {
        day = 30 + day;
        month -= 1;
        if (month <= 0) {
            month = 12;
            year -= 1;
        }
    }
    return { day, month, year };
}

function showJamatPopup(prayerKey) {
    const popup = document.getElementById("jamatPopup");
    if (!popup) return;

    let showTakbeer = false;
    const islamicDate = getTrueIslamicDate(new Date());
    if (islamicDate.month === 12) {
        if (islamicDate.day === 9 && ['fajr', 'dhuhr', 'juma', 'asr'].includes(prayerKey)) {
            showTakbeer = true;
        } else if ([10, 11, 12].includes(islamicDate.day)) {
            showTakbeer = true;
        } else if (islamicDate.day === 13 && ['maghrib', 'isha', 'fajr', 'dhuhr', 'juma', 'asr'].includes(prayerKey)) {
            showTakbeer = true;
        }
    }

    if (!showTakbeer) {
        return;
    }

    popup.style.display = "flex";
    popupShown = true;

    // Show for 10 minutes
    setTimeout(() => {
        popup.style.display = "none";
        popupShown = false;
    }, 1000 * 60 * 10);
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
                showJamatPopup('juma');
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

            const jmdiff = now - jamatTime;
            if (jmdiff <= 0 && jmdiff > -2000 && !popupShown) {
                setTimeout(() => {
                    showJamatPopup('juma');
                }, 1000);
            }

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
    // removed updateNextPrayerCountdown() to prevent double execution
    highlightNextPrayer();
    updateCurrentAndNextPrayerTimes();
    scheduleSwitcher();
    updateDynamicBackground();
}

setInterval(mainLoop, 1000);


// ==============================
// EXTRA ISLAMIC TIMES - Updates from prayer loader above
// ==============================

// Dynamic Background
function updateDynamicBackground() {
    const now = new Date();
    const hours = now.getHours();
    let themeClass = '';

    if (DISPLAY_THEME && DISPLAY_THEME !== "auto") {
        themeClass = `theme-${DISPLAY_THEME}`;
    } else if (hours >= 5 && hours < 8) {
        themeClass = 'theme-morning';
    } else if (hours >= 8 && hours < 16) {
        themeClass = 'theme-day';
    } else if (hours >= 16 && hours < 19) {
        themeClass = 'theme-evening';
    } else {
        themeClass = 'theme-night';
    }

    if (!document.body.classList.contains(themeClass)) {
        // Remove old themes
        document.body.classList.remove('theme-morning', 'theme-day', 'theme-evening', 'theme-night');
        // Add new theme
        document.body.classList.add(themeClass);
    }
}

// Update current and next prayer times  
function updateCurrentAndNextPrayerTimes() {
    const now = new Date();
    const prayerOrder = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    let currentPrayer = null;
    let nextPrayer = null;
    let minDiff = Infinity;

    // Find next prayer
    prayerOrder.forEach(key => {
        let prayerTime = parseTime(prayerData[key].jamah);
        if (prayerTime < now) prayerTime.setDate(prayerTime.getDate() + 1);
        const diff = prayerTime - now;
        if (diff > 0 && diff < minDiff) {
            minDiff = diff;
            nextPrayer = key;
        }
    });

    // Find current prayer (the one we just passed or are in)
    if (nextPrayer) {
        const nextIndex = prayerOrder.indexOf(nextPrayer);
        currentPrayer = nextIndex > 0 ? prayerOrder[nextIndex - 1] : 'isha';
    }

    // Update display elements
    if (currentPrayer && prayerData[currentPrayer]) {
        const currentEndTime = formatDisplayTime(prayerData[currentPrayer].end);
        const currentLabel = prayerData[currentPrayer].name.trim() + " आख़िर ";
        const endEl = document.getElementById("currentPrayerEndTime");
        const labelEl = document.getElementById("currentPrayerLabel");
        if (endEl) endEl.innerText = currentEndTime;
        if (labelEl) labelEl.innerText = currentLabel;
    }

    if (nextPrayer && prayerData[nextPrayer]) {
        const nextStartTime = formatDisplayTime(prayerData[nextPrayer].start);
        const nextLabel = prayerData[nextPrayer].name.trim() + " शुरू ";
        const startEl = document.getElementById("nextPrayerStartTime");
        const labelEl = document.getElementById("nextPrayerLabel");
        if (startEl) startEl.innerText = nextStartTime;
        if (labelEl) labelEl.innerText = nextLabel;
    }
}


async function loadVerses() {
    const res = await fetch('/api/short-verses');
    const verses = await res.json();

    if (!verses.length) {
        const container = document.querySelector('.verse-slider-container');
        if (container) container.style.display = 'none';
        return;
    }

    let index = 0;
    const contentEl = document.getElementById('verseSliderContent');

    function showVerse() {
        const verse = verses[index];
        const textEl = document.getElementById('verseText');

        if (!textEl || !contentEl) return;

        contentEl.classList.remove('fade-in');
        contentEl.classList.add('fade-out');

        setTimeout(() => {
            textEl.innerText = verse.text;

            contentEl.classList.remove('fade-out');
            contentEl.classList.add('fade-in');

            index = (index + 1) % verses.length;
        }, 1000);
    }

    // Initial load
    const verse = verses[index];
    const textEl = document.getElementById('verseText');
    if (textEl && contentEl) {
        textEl.innerText = verse.text;
        contentEl.classList.add('fade-in');
        index = (index + 1) % verses.length;
    }

    // Rotate every 15 seconds
    setInterval(showVerse, 15000);
}

loadVerses();

// Function to fetch and display the device IP on screen
async function updateDeviceIpDisplay() {
    try {
        const res = await fetch('/api/ip');
        const data = await res.json();
        if (data.ips && data.ips.length > 0) {
            let ipContainer = document.getElementById('device-ip');
            if (!ipContainer) {
                ipContainer = document.createElement('div');
                ipContainer.id = 'device-ip';
                ipContainer.style.position = 'fixed';
                ipContainer.style.bottom = '5px';
                ipContainer.style.left = '5px';
                ipContainer.style.fontSize = '12px';
                ipContainer.style.color = '#fff';
                ipContainer.style.opacity = '0.3';
                ipContainer.style.zIndex = '9999';
                document.body.appendChild(ipContainer);
            }
            ipContainer.innerText = "Admin IP: " + data.ips.join(', ');
        }
    } catch (e) {
        console.error("Could not fetch IP");
    }
}
updateDeviceIpDisplay();
setInterval(updateDeviceIpDisplay, 30000);
