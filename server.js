const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = 5001;

app.use(cors());

app.get("/test", (req, res) => {
  res.json({ status: "working", message: "Server is running!" });
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

const parsePdfText = require("./utils/parsePDFText");

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const data = await pdfParse(req.file.buffer);
    const structured = parsePdfText(data.text);
    res.json({ text: data.text, structured });
  } catch (err) {
    console.error("PDF parse error:", err);
    res.status(500).json({ error: "Failed to process PDF" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
