const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");

const app = express();
const PORT = 3000;

app.use(express.static("public"));
app.use(bodyParser.json());

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

/* ===== Get Videos List ===== */
app.get("/api/videos", (req, res) => {
  const videosDir = path.join(__dirname, "public", "videos");
  console.log("Looking for videos in:", videosDir);
  try {
    const files = fs.readdirSync(videosDir);
    console.log("Files found:", files);
    const videoFiles = files.filter(file => 
      /\.(mp4|webm|ogg|mov)$/i.test(file)
    );
    console.log("Video files:", videoFiles);
    res.json(videoFiles.map(file => `/videos/${file}`));
  } catch (err) {
    console.error("Error reading videos directory:", err);
    res.json([]);
  }
});

/* ===== Video Upload ===== */
const storage = multer.diskStorage({
  destination: path.join(__dirname, "public", "videos"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

app.post("/api/upload-video", upload.single("video"), (req, res) => {
  if (req.file) {
    res.json({ status: "success", filename: req.file.filename, message: "Video uploaded successfully" });
  } else {
    res.status(400).json({ error: "No file uploaded" });
  }
});

/* ===== Delete Video ===== */
app.delete("/api/video/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "public", "videos", filename);
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ status: "success", message: "Video deleted successfully" });
    } else {
      res.status(404).json({ error: "Video not found" });
    }
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

  // Kill existing chrome first
  exec(`taskkill /IM chrome.exe /F`, () => {
    exec(`${chromePath} --start-fullscreen http://localhost:${PORT}`);
  });
});