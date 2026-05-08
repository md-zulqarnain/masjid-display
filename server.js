const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const os = require("os");
const VERSES_FILE = 'verses.json';
const SETTINGS_FILE = './data/settings.json';



const app = express();
const PORT = 3000;
const displayClients = new Set();

if (!fs.existsSync(VERSES_FILE)) {
  fs.writeFileSync(VERSES_FILE, JSON.stringify([], null, 2));
}

app.use(express.static("public"));
app.use(bodyParser.json());


function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ hijriOffset: 0, beepVolume: 1 }, null, 2));
    }

    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    return {
      hijriOffset: typeof data.hijriOffset === "number" ? data.hijriOffset : 0,
      beepVolume: typeof data.beepVolume === "number" ? data.beepVolume : 1,
      displayTheme: typeof data.displayTheme === "string" ? data.displayTheme : "auto"
    };
  } catch (err) {
    return { hijriOffset: 0, beepVolume: 1 };
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
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

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
    const settings = saveSettings(req.body || {});
    res.json({ message: "Settings saved successfully", settings });
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

  const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

  // Kill existing chrome first
  exec(`taskkill /IM chrome.exe /F`, () => {
    exec(`${chromePath} --start-fullscreen --autoplay-policy=no-user-gesture-required http://localhost:${PORT}`);
  });
});
