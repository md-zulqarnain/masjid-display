const express = require("express");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const os = require("os");
const VERSES_FILE = 'verses.json';
const SETTINGS_FILE = './data/settings.json';
const CEC_CTL_PATH = process.env.CEC_CTL_PATH || '/usr/bin/cec-ctl';



const app = express();
const PORT = 3000;
const displayClients = new Set();
const DEFAULT_DISPLAY_RESOLUTION = '1920x1080@60Hz';
const ALLOWED_DISPLAY_RESOLUTIONS = new Set([
  DEFAULT_DISPLAY_RESOLUTION,
  '3840x2160@30Hz',
  '1280x720@60Hz',
  '1024x768@60Hz'
]);
const ALLOWED_PAGES = ['normal', 'index', 'home', 'surah-hadith', 'juma', 'ramadan-isha', 'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6'];
const ALLOWED_THEMES = ['index', 'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5', 'theme-6'];
const ALLOWED_DIALOGS = ['message', 'black', 'welcome', 'announcement', 'takbir', 'tashrik', 'takbir-e-tashrik'];

if (!fs.existsSync(VERSES_FILE)) {
  fs.writeFileSync(VERSES_FILE, JSON.stringify([], null, 2));
}

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 }
}));

function normalizeDisplayResolution(resolution) {
  return ALLOWED_DISPLAY_RESOLUTIONS.has(resolution) ? resolution : DEFAULT_DISPLAY_RESOLUTION;
}

function requireSuperAdmin(req, res, next) {
  if (req.session?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin login required' });
  }
  next();
}

function applyDisplayResolution(resolution, callback) {
  if (process.platform === 'win32') {
    callback(new Error('Display resolution can only be changed on the Raspberry Pi'));
    return;
  }

  const mode = normalizeDisplayResolution(resolution);
  exec(`wlr-randr --output HDMI-A-2 --mode ${mode}`, callback);
}

function applySavedDisplayResolution() {
  const resolution = readSettings().displayResolution;
  applyDisplayResolution(resolution, error => {
    if (error) console.error('Could not set display resolution:', error.message);
    else console.log(`Display resolution set to ${resolution}`);
  });
}

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minutes > 59) return null;

  if (period) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (period === 'PM' ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

function normalizeDisplayPowerSlots(slots) {
  if (!Array.isArray(slots)) return [];

  return slots.slice(0, 12).map(slot => {
    const on = typeof slot?.on === 'string' ? slot.on.trim() : '';
    const off = typeof slot?.off === 'string' ? slot.off.trim() : '';
    if (!/^\d{2}:\d{2}$/.test(on) || !/^\d{2}:\d{2}$/.test(off)) return null;

    const onMinutes = parseTimeToMinutes(on);
    const offMinutes = parseTimeToMinutes(off);
    if (onMinutes === null || offMinutes === null || onMinutes === offMinutes) return null;

    return { on, off };
  }).filter(Boolean);
}

function readTimingDay(date) {
  const filePath = path.join(__dirname, `timing-data-${date.getMonth() + 1}.json`);
  try {
    const days = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(days)
      ? (days.find(day => day.day === date.getDate()) || days[date.getDate() - 1] || null)
      : null;
  } catch (error) {
    console.error(`Could not read timing data for ${date.toLocaleDateString()}:`, error.message);
    return null;
  }
}

function readQuickTimingSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'timings.json'), 'utf8'));
  } catch {
    return {};
  }
}

function getIshaJamatMinutes(dayData, quickTimes) {
  const ishaConfig = quickTimes?.isha || {};
  let azanMinutes;

  if (ishaConfig.useCustomTime === true && ishaConfig.azan) {
    azanMinutes = parseTimeToMinutes(ishaConfig.azan);
  } else {
    const ishaMinutes = parseTimeToMinutes(dayData?.Isha);
    if (ishaMinutes === null) return null;
    azanMinutes = Math.ceil((ishaMinutes + 15) / 15) * 15;
  }

  if (azanMinutes === null || azanMinutes === undefined) return null;
  const configuredDelay = Number.parseInt(ishaConfig.jamahAfterAzan, 10);
  const jamatDelay = Number.isNaN(configuredDelay) ? 15 : configuredDelay;
  return ((azanMinutes + jamatDelay) % 1440 + 1440) % 1440;
}

function shouldSamsungDisplayBeOn(now = new Date(), quickTimes = readQuickTimingSettings(), timingDayReader = readTimingDay, powerSlots = readSettings().displayPowerSlots) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isInCustomPowerSlot = normalizeDisplayPowerSlots(powerSlots).some(slot => {
    const on = parseTimeToMinutes(slot.on);
    const off = parseTimeToMinutes(slot.off);
    return on < off
      ? currentMinutes >= on && currentMinutes < off
      : currentMinutes >= on || currentMinutes < off;
  });
  if (isInCustomPowerSlot) return true;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayData = timingDayReader(today);
  const sahriMinutes = parseTimeToMinutes(todayData?.Sahri);
  const sahriWakeMinutes = sahriMinutes === null ? null : Math.max(0, sahriMinutes - 45);
  const ishaJamatMinutes = getIshaJamatMinutes(todayData, quickTimes);
  if (sahriWakeMinutes === null || ishaJamatMinutes === null) return false;

  const sahriPowerOn = new Date(today);
  sahriPowerOn.setMinutes(sahriWakeMinutes);
  const morningPowerOff = new Date(today);
  morningPowerOff.setHours(7, 30, 0, 0);
  if (now >= sahriPowerOn && now < morningPowerOff) return true;

  const daytimePowerOn = new Date(today);
  daytimePowerOn.setHours(11, 30, 0, 0);
  const ishaJamat = new Date(today);
  ishaJamat.setMinutes(ishaJamatMinutes);
  const ishaPowerOff = new Date(ishaJamat.getTime() + 60 * 60 * 1000);
  if (now >= daytimePowerOn && now < ishaPowerOff) return true;

  return false;
}

function getSamsungDisplayPowerArgs(isOn) {
  return isOn
    ? ['-d', '1', '--playback', '-o', 'Raspberry Pi', '-t', '0', '--image-view-on']
    : ['-d', '1', '--standby', '-t', '0'];
}

function getSamsungDisplayCommandArgs(isOn) {
  return ['-n', CEC_CTL_PATH, ...getSamsungDisplayPowerArgs(isOn)];
}

function setSamsungDisplayPower(isOn, callback) {
  if (process.platform === 'win32') {
    callback(new Error('HDMI-CEC power control is only available on the Raspberry Pi'));
    return;
  }

  const client = spawn('sudo', getSamsungDisplayCommandArgs(isOn), { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let completed = false;
  const timeout = setTimeout(() => {
    client.kill('SIGTERM');
    finish(new Error('CEC command timed out'));
  }, 10000);

  function finish(error) {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    callback(error, { stdout: stdout.trim(), stderr: stderr.trim() });
  }

  client.stdout.on('data', chunk => { stdout += chunk.toString(); });
  client.stderr.on('data', chunk => { stderr += chunk.toString(); });
  client.on('error', finish);
  client.on('close', code => {
    finish(code === 0 ? null : new Error(stderr.trim() || `cec-ctl exited with code ${code}`));
  });
}

let lastSamsungPowerState = null;
let samsungPowerCommandInProgress = false;
let lastSamsungPowerCommand = { powerOn: null, at: null, error: null, output: '' };

function updateSamsungDisplayPower() {
  if (process.platform === 'win32' || samsungPowerCommandInProgress) return;

  const desiredState = shouldSamsungDisplayBeOn();
  if (lastSamsungPowerState === desiredState) return;

  samsungPowerCommandInProgress = true;
  setSamsungDisplayPower(desiredState, (error, result = {}) => {
    samsungPowerCommandInProgress = false;
    lastSamsungPowerCommand = {
      powerOn: desiredState,
      at: new Date().toISOString(),
      error: error?.message || null,
      output: result.stdout || result.stderr || ''
    };
    if (error) {
      console.error(`Could not turn Samsung display ${desiredState ? 'on' : 'off'} via HDMI-CEC:`, error.message);
      return;
    }

    lastSamsungPowerState = desiredState;
    console.log(`Samsung display powered ${desiredState ? 'on' : 'off'} via HDMI-CEC`);
  });
}

function normalizeDisplayPage(page, fallback = 'normal') {
  const normalized = typeof page === 'string' ? page.trim().toLowerCase() : '';
  return ALLOWED_PAGES.includes(normalized) ? normalized : fallback;
}

function normalizeDisplayDialogType(dialog, fallback = 'message') {
  const normalized = typeof dialog === 'string' ? dialog.trim().toLowerCase() : '';
  return ALLOWED_DIALOGS.includes(normalized) ? normalized : fallback;
}

function normalizeTheme(theme) {
  return ALLOWED_THEMES.includes(theme) ? theme : 'index';
}

function normalizeDisplayOverride(override, fallback = { mode: 'normal', page: null, dialog: null, message: '' }) {
  const safeOverride = override && typeof override === 'object' ? override : {};
  const mode = safeOverride.mode === 'page' || safeOverride.mode === 'dialog' ? safeOverride.mode : 'normal';
  const page = normalizeDisplayPage(safeOverride.page, 'index');
  const dialog = normalizeDisplayDialogType(safeOverride.dialog, 'message');
  const message = typeof safeOverride.message === 'string' ? safeOverride.message.trim() : '';

  if (mode === 'page') {
    return { mode: 'page', page: page === 'normal' ? 'index' : page, dialog: null, message: '' };
  }

  if (mode === 'dialog') {
    return {
      mode: 'dialog',
      page: null,
      dialog: dialog || 'message',
      message: message || 'Testing mode'
    };
  }

  return { mode: 'normal', page: null, dialog: null, message: '' };
}

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ hijriOffset: 0, beepVolume: 1, theme: 'index', displayOverride: { mode: 'normal', page: null, dialog: null, message: '' } }, null, 2));
    }

    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return {
      hijriOffset: typeof data.hijriOffset === "number" ? data.hijriOffset : 0,
      beepVolume: typeof data.beepVolume === "number" ? data.beepVolume : 1,
      displayTheme: typeof data.displayTheme === "string" ? data.displayTheme : "auto",
      displayResolution: normalizeDisplayResolution(data.displayResolution),
      displayPowerSlots: normalizeDisplayPowerSlots(data.displayPowerSlots),
      theme: normalizeTheme(data.theme),
      displayOverride: normalizeDisplayOverride(data.displayOverride)
    };
  } catch (err) {
    return { hijriOffset: 0, beepVolume: 1, displayTheme: 'auto', displayResolution: DEFAULT_DISPLAY_RESOLUTION, displayPowerSlots: [], theme: 'index', displayOverride: { mode: 'normal', page: null, dialog: null, message: '' } };
  }
}

function saveSettings(updates) {
  const current = readSettings();
  const next = { ...current, ...updates };
  next.hijriOffset = Number.isFinite(Number(next.hijriOffset)) ? Number(next.hijriOffset) : 0;
  next.beepVolume = Math.min(1, Math.max(0, Number(next.beepVolume) || 0));
  if (!["auto", "morning", "day", "evening", "night"].includes(next.displayTheme)) {
    next.displayTheme = "auto";
  }
  next.displayResolution = normalizeDisplayResolution(next.displayResolution);
  next.displayPowerSlots = normalizeDisplayPowerSlots(next.displayPowerSlots);
  next.theme = normalizeTheme(next.theme);
  next.displayOverride = normalizeDisplayOverride(next.displayOverride || updates?.displayOverride);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const superAdminUsername = process.env.SUPERADMIN_USERNAME || 'superadmin';
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'superpassword';

  let role = null;
  if (username === superAdminUsername && password === superAdminPassword) {
    role = 'superadmin';
  } else if (username === adminUsername && password === adminPassword) {
    role = 'admin';
  }

  if (!role) return res.status(401).json({ error: 'Invalid username or password' });

  req.session.role = role;
  return res.json({ role });
});

app.get('/api/auth/session', (req, res) => {
  res.json({ role: req.session?.role || null });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

function sendDisplayEvent(eventName, payload = {}) {
  const data = JSON.stringify({ ...payload, at: Date.now() });

  displayClients.forEach(client => {
    client.write(`event: ${eventName}\n`);
    client.write(`data: ${data}\n\n`);
  });
}

// GET settings
app.get('/api/settings', (req, res) => {
  res.json(readSettings());
});

// UPDATE settings
app.post('/api/settings', (req, res) => {
  if (Object.hasOwn(req.body || {}, 'displayResolution') && req.session?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin login required to change display resolution' });
  }
  const settings = saveSettings(req.body || {});
  res.json({ message: "Settings saved successfully", settings });
});

app.post('/api/display/power-schedule', requireSuperAdmin, (req, res) => {
  const slots = req.body?.slots;
  if (!Array.isArray(slots) || slots.length > 12) {
    return res.status(400).json({ error: 'Provide between 0 and 12 power schedule slots' });
  }

  const normalizedSlots = normalizeDisplayPowerSlots(slots);
  if (normalizedSlots.length !== slots.length) {
    return res.status(400).json({ error: 'Each slot needs valid, different power-on and power-off times' });
  }

  const settings = saveSettings({ displayPowerSlots: normalizedSlots });
  updateSamsungDisplayPower();
  res.json({ message: 'Display power schedule saved', slots: settings.displayPowerSlots });
});

app.get('/api/display/power-status', requireSuperAdmin, (req, res) => {
  res.json({
    available: process.platform !== 'win32' && fs.existsSync(CEC_CTL_PATH),
    cecCtlPath: CEC_CTL_PATH,
    desiredPowerOn: shouldSamsungDisplayBeOn(),
    lastSuccessfulPowerOn: lastSamsungPowerState,
    commandInProgress: samsungPowerCommandInProgress,
    lastCommand: lastSamsungPowerCommand
  });
});

app.post('/api/display/power-test', requireSuperAdmin, (req, res) => {
  const powerOn = req.body?.powerOn;
  if (typeof powerOn !== 'boolean') {
    return res.status(400).json({ error: 'powerOn must be true or false' });
  }
  if (samsungPowerCommandInProgress) {
    return res.status(409).json({ error: 'A Samsung power command is already running' });
  }
  if (process.platform === 'win32') {
    return res.status(400).json({ error: 'HDMI-CEC power control is only available on the Raspberry Pi' });
  }

  samsungPowerCommandInProgress = true;
  setSamsungDisplayPower(powerOn, (error, result = {}) => {
    samsungPowerCommandInProgress = false;
    lastSamsungPowerCommand = {
      powerOn,
      at: new Date().toISOString(),
      error: error?.message || null,
      output: result.stdout || result.stderr || ''
    };
    if (error) {
      console.error(`Samsung HDMI-CEC test (${powerOn ? 'on' : 'standby'}) failed:`, error.message, result.stderr || '');
      return res.status(500).json({ error: error.message, output: result.stdout || result.stderr || '' });
    }

    lastSamsungPowerState = powerOn;
    console.log(`Samsung HDMI-CEC test command completed: ${powerOn ? 'on' : 'standby'}`, result.stdout || '');
    return res.json({ message: `CEC ${powerOn ? 'power-on' : 'standby'} command completed`, output: result.stdout || result.stderr || '' });
  });
});

app.post('/api/display/resolution', requireSuperAdmin, (req, res) => {
  const resolution = req.body?.displayResolution;
  if (!ALLOWED_DISPLAY_RESOLUTIONS.has(resolution)) {
    return res.status(400).json({ error: 'Unsupported display resolution' });
  }

  applyDisplayResolution(resolution, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: (stderr || error.message).trim() });
    }

    const settings = saveSettings({ displayResolution: resolution });
    return res.json({ message: `Display resolution set to ${resolution}`, settings });
  });
});

app.post('/api/beep/test', (req, res) => {
  sendDisplayEvent("beep", { type: "test", volume: readSettings().beepVolume });

  res.json({ message: "Beep test sent to display", clients: displayClients.size });
});

app.post('/api/display/theme', (req, res) => {
  const settings = saveSettings({ displayTheme: req.body?.displayTheme });
  sendDisplayEvent("theme", { displayTheme: settings.displayTheme });
  res.json({ message: "Display theme updated", settings, clients: displayClients.size });
});

app.post('/api/display/reload', (req, res) => {
  sendDisplayEvent("reload", { reason: "admin" });
  res.json({ message: "Display reload sent", clients: displayClients.size });
});

app.get('/api/display/override', (req, res) => {
  res.json({ override: readSettings().displayOverride });
});

app.post('/api/display/override', (req, res) => {
  const settings = saveSettings({ displayOverride: req.body?.displayOverride || { mode: 'normal' } });
  sendDisplayEvent('display-override', { override: settings.displayOverride });
  res.json({ message: 'Display override updated', override: settings.displayOverride, clients: displayClients.size });
});

app.post('/api/theme', (req, res) => {
  const theme = req.body?.theme;
  if (!ALLOWED_THEMES.includes(theme)) {
    return res.status(400).json({ error: 'Unsupported display theme' });
  }

  const settings = saveSettings({ theme });
  sendDisplayEvent("theme-change", { theme: settings.theme });
  res.json({ message: "Theme saved successfully", settings });
});

app.get('/api/display/events', (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  res.write(`event: ready\n`);
  res.write(`data: ${JSON.stringify({ at: Date.now() })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, 30000);

  displayClients.add(res);

  req.on("close", () => {
    clearInterval(keepAlive);
    displayClients.delete(res);
  });
});

/* ===== Get Quick Prayer Times ===== */
app.get("/api/quick-times", (req, res) => {
  try {
    const data = fs.readFileSync("timings.json");
    res.json(JSON.parse(data));
  } catch (err) {
    res.json({});
  }
});

/* ===== Save Quick Prayer Times ===== */
app.post("/api/quick-times", (req, res) => {
  try {
    fs.writeFileSync("timings.json", JSON.stringify(req.body, null, 2));
    res.json({ status: "success", message: "Prayer times saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Get Prayer Times by Month ===== */
app.get("/api/timings/:month", (req, res) => {
  const month = req.params.month;
  const filePath = `timing-data-${month}.json`;

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      res.json(JSON.parse(data));
    } else {
      res.status(404).json({ error: "Month data not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Get All Available Months ===== */
app.get("/api/available-months", (req, res) => {
  try {
    const files = fs.readdirSync(".");
    const months = files
      .filter(f => f.match(/^timing-data-\d+\.json$/))
      .map(f => parseInt(f.match(/\d+/)[0]))
      .sort((a, b) => a - b);
    res.json(months);
  } catch (err) {
    res.json([]);
  }
});

/* ===== Update Prayer Times ===== */
app.post("/api/timings/:month", (req, res) => {
  const month = req.params.month;
  const filePath = `timing-data-${month}.json`;

  try {
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
    res.json({ status: "saved", message: "Prayer times updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===== Load Timings (legacy) ===== */
app.get("/api/timings", (req, res) => {
  try {
    const data = fs.readFileSync("timings.json");
    res.json(JSON.parse(data));
  } catch (err) {
    res.json({});
  }
});

/* ===== Save Timings from Mobile (legacy) ===== */
app.post("/api/timings", (req, res) => {
  fs.writeFileSync("timings.json", JSON.stringify(req.body, null, 2));
  res.json({ status: "saved" });
});



function readVersesFile() {
  try {
    if (!fs.existsSync(VERSES_FILE)) {
      fs.writeFileSync(VERSES_FILE, JSON.stringify([], null, 2));
      return [];
    }

    const data = fs.readFileSync(VERSES_FILE, "utf8");

    if (!data.trim()) {
      return [];
    }

    try {
      return JSON.parse(data);
    } catch (parseError) {
      console.error("Corrupted JSON. Resetting file.");
      fs.writeFileSync(VERSES_FILE, JSON.stringify([], null, 2));
      return [];
    }

  } catch (err) {
    console.error("File read error:", err);
    return [];
  }
}

app.get('/api/verses', (req, res) => {
  const verses = readVersesFile();
  res.json(verses);
});

app.get('/api/short-verses', (req, res) => {
  try {
    const data = fs.readFileSync('short-verses.json', "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.json([]);
  }
});
// ADD new verse
app.post('/api/verses', (req, res) => {
  try {
    const { reference, text, type } = req.body;

    if (!reference || !text || !type) {
      return res.status(400).json({ error: "All fields required" });
    }

    const verses = readVersesFile();

    verses.push({ reference, text, type });

    fs.writeFileSync(VERSES_FILE, JSON.stringify(verses, null, 2));

    res.json({ success: true });

  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/verses/:index', (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const verses = readVersesFile();

    if (index < 0 || index >= verses.length) {
      return res.status(400).json({ error: "Invalid index" });
    }

    verses.splice(index, 1);

    fs.writeFileSync(VERSES_FILE, JSON.stringify(verses, null, 2));

    res.json({ success: true });

  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE verse by index
app.put('/api/verses/:index', (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const { reference, text, type } = req.body;

    const verses = readVersesFile();

    if (index < 0 || index >= verses.length) {
      return res.status(400).json({ error: "Invalid index" });
    }

    verses[index] = { reference, text, type };

    fs.writeFileSync(VERSES_FILE, JSON.stringify(verses, null, 2));

    res.json({ success: true });

  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- MAINTENANCE ENDPOINTS ---
app.post('/api/maintenance/pull', (req, res) => {
  exec('git pull', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    res.json({ message: "Pulled successfully", stdout });
  });
});

app.post('/api/maintenance/stash-pull', (req, res) => {
  exec('git stash && git pull', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    res.json({ message: "Stashed and pulled successfully", stdout });
  });
});

app.post('/api/maintenance/reboot', (req, res) => {
  exec('sudo reboot', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    res.json({ message: "Rebooting..." });
  });
});

app.post('/api/maintenance/shutdown', (req, res) => {
  exec('sudo shutdown now', (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: error.message, stderr });
    }
    res.json({ message: "Shutting down..." });
  });
});

app.post('/api/terminal/exec', (req, res) => {
  try {
    const command = req.body && req.body.command;
    if (!command || typeof command !== 'string' || !command.trim()) {
      return res.status(400).json({ error: 'Missing command string in body' });
    }

    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      if (error) {
        console.error('Terminal command failed:', command, error.message, stderr);
        return res.status(500).json({
          error: stderr ? stderr.trim() : error.message,
          output: stdout ? stdout.trim() : '',
          exitCode: error.code ?? 1
        });
      }

      return res.json({
        output: output || 'Command executed successfully with no output.',
        exitCode: 0
      });
    });
  } catch (err) {
    console.error('Terminal execution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Sync system time - accepts { iso: '2026-12-31T23:59:00' }
app.post('/api/maintenance/sync-time', (req, res) => {
  try {
    const iso = req.body && req.body.iso;
    if (!iso || typeof iso !== 'string') {
      return res.status(400).json({ error: 'Missing iso time string in body' });
    }

    let dateStr = null;
    const normalized = iso.trim();

    // Accept both local wall-clock ISO strings and timezone-aware ISO strings.
    const localMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    if (localMatch) {
      dateStr = `${localMatch[1]} ${localMatch[2]}`;
    } else {
      const date = new Date(normalized);
      if (!Number.isNaN(date.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
      }
    }

    if (!dateStr) {
      return res.status(400).json({ error: 'Invalid ISO format. Expect YYYY-MM-DDTHH:MM:SS or ISO with timezone' });
    }

    // Only allow this on non-Windows platforms
    if (process.platform === 'win32') {
      return res.status(400).json({ error: 'Sync time not supported on Windows host' });
    }

    // Update both the system clock and the hardware clock so the Pi keeps the same
    // time after a reboot or power loss.
    const cmd = `sudo date -s "${dateStr}" && sudo hwclock --systohc`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('Sync time failed:', error, stderr);
        return res.status(500).json({ error: error.message, stderr });
      }
      return res.json({ message: 'System time and hardware clock updated', stdout });
    });
  } catch (err) {
    console.error('Sync time error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  let ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  const hostname = os.hostname();
  res.json({ ips, hostname });
});

// BME280 sensor read endpoint - runs bme280_read.py if present
app.get('/api/sensor', (req, res) => {
  try {
    const scriptPath = path.join(__dirname, 'bme280_read.py');

    if (fs.existsSync(scriptPath)) {
      const py = (process.env.PYTHON || 'python3');
      exec(`${py} "${scriptPath}"`, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('Sensor script error:', error, stderr);
          return res.status(500).json({ error: 'Sensor read failed', detail: stderr || error.message });
        }

        try {
          const data = JSON.parse(stdout.toString());
          data.at = Date.now();
          return res.json(data);
        } catch (err) {
          console.error('Sensor parse error:', err);
          return res.status(500).json({ error: 'Invalid sensor output', raw: stdout.toString() });
        }
      });
    } else {
      return res.json({ temperature: null, humidity: null, pressure: null, at: Date.now(), note: 'bme280_read.py not found' });
    }
  } catch (err) {
    console.error('Sensor endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running locally on http://localhost:${PORT}`);

    // Get and log local network IPs
    const interfaces = os.networkInterfaces();
    console.log("App is also accessible on your network at:");
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`  http://${iface.address}:${PORT}`);
        }
      }
    }

    if (process.platform !== 'win32') {
      applySavedDisplayResolution();
      setInterval(applySavedDisplayResolution, 10 * 60 * 1000);
      updateSamsungDisplayPower();
      setInterval(updateSamsungDisplayPower, 30 * 1000);
    }

    const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

    // Kill existing chrome first
    exec(`taskkill /IM chrome.exe /F`, () => {
      exec(`${chromePath} --start-fullscreen --autoplay-policy=no-user-gesture-required http://localhost:${PORT}`);
    });
  });
}

module.exports = {
  app,
  normalizeDisplayOverride,
  normalizeDisplayPage,
  normalizeDisplayDialogType,
  normalizeTheme,
  normalizeDisplayResolution,
  normalizeDisplayPowerSlots,
  getSamsungDisplayPowerArgs,
  getSamsungDisplayCommandArgs,
  parseTimeToMinutes,
  getIshaJamatMinutes,
  shouldSamsungDisplayBeOn,
  readSettings,
  saveSettings
};
