const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const VERSES_FILE = 'verses.json';
const SETTINGS_FILE = './data/settings.json';



const app = express();
const PORT = 3000;

if (!fs.existsSync(VERSES_FILE)) {
  fs.writeFileSync(VERSES_FILE, JSON.stringify([], null, 2));
}

app.use(express.static("public"));
app.use(bodyParser.json());


// GET Hijri offset
app.get('/api/settings', (req, res) => {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE));
    res.json(data);
});

// UPDATE Hijri offset
app.post('/api/settings', (req, res) => {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(req.body, null, 2));
    res.json({ message: "Settings saved successfully" });
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

  // Kill existing chrome first
  exec(`taskkill /IM chrome.exe /F`, () => {
    exec(`${chromePath} --start-fullscreen --autoplay-policy=no-user-gesture-required http://localhost:${PORT}`);
  });
});