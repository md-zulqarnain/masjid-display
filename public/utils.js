// ============================================
// UTILITY FUNCTIONS (Time Math & Formatting)
// ============================================

function parseHM(timeStr) {
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

function normalizeToHM(timeStr) {
    if (!timeStr) return null;
    if (timeStr.includes('AM') || timeStr.includes('PM')) return to24Hour(timeStr);
    return timeStr;
}

function hmToMinutes(timeStr) {
    const { h, m } = parseHM(normalizeToHM(timeStr));
    return h * 60 + m;
}

function minutesBetweenHM(startTime, endTime) {
    return (hmToMinutes(endTime) - hmToMinutes(startTime) + 24 * 60) % (24 * 60);
}

function roundHMDownToMinutes(timeStr, intervalMinutes) {
    const { h, m } = parseHM(timeStr);
    const roundedMinutes = Math.floor(m / intervalMinutes) * intervalMinutes;
    return String(h).padStart(2, '0') + ':' + String(roundedMinutes).padStart(2, '0');
}

function roundHMUpToMinutes(timeStr, intervalMinutes) {
    const { h, m } = parseHM(timeStr);
    const totalMinutes = h * 60 + m;
    const roundedTotal = Math.ceil(totalMinutes / intervalMinutes) * intervalMinutes;
    const hh = Math.floor(roundedTotal / 60) % 24;
    const mm = roundedTotal % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function to12Hour(time24) {
    if (time24.includes('AM') || time24.includes('PM')) return time24;
    const [h, m] = time24.split(':').map(s => parseInt(s, 10));
    const ampm = h >= 12 ? 'PM' : 'AM';
    let hh = h % 12;
    if (hh === 0) hh = 12;
    return String(hh).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + ampm;
}

function formatDisplayTime(timeStr) {
    return timeStr.replace(" AM", "").replace(" PM", "");
}

function to24Hour(timeStr) {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":");
    hours = parseInt(hours);
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    return String(hours).padStart(2, '0') + ":" + minutes;
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

function toMinutes(timeStr) {
    const d = parseTime(timeStr);
    return d.getHours() * 60 + d.getMinutes();
}

function formatDiff(ms) {
    if (ms <= 0) return '00:00:00';
    let total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    total %= 3600;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function isBeforeHM(timeStr, date = new Date()) {
    const { h, m } = parseHM(timeStr);
    const targetMinutes = h * 60 + m;
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    return currentMinutes < targetMinutes;
}
