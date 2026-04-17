const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Handle large image data (up to 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const db = new sqlite3.Database('./pixel.db');

// Initialize database with all 8 Descriptive & Administrative fields 
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS ImageMetadata (
        MediaID VARCHAR(50) PRIMARY KEY,
        Title TEXT,
        Location TEXT,
        Description TEXT,
        Tags TEXT,
        Photographer TEXT,
        Source TEXT,
        Copyright TEXT,
        AiGenerated TEXT,
        FileExtension TEXT,
        Resolution TEXT,
        FileSize_MB TEXT,
        UploadDate DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }

app.post('/api/upload', (req, res) => {
    const { 
        title, location, description, tags, photographer, 
        source, copyright, aiGenerated, img, extension, 
        resolution, sizeMB 
    } = req.body;

    const mediaId = 'img_' + Date.now();
    // Regex to handle both JPG and PNG base64 strings
    const matches = img.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    
    if (!matches) return res.status(400).json({ error: "Invalid image format" });
    
    const buffer = Buffer.from(matches[2], 'base64');
    const filePath = path.join(uploadDir, mediaId + extension);
    
    try {
        fs.writeFileSync(filePath, buffer);

        // Prepare the SQL statement for all metadata fields [cite: 73]
        const stmt = db.prepare(`
            INSERT INTO ImageMetadata 
            (MediaID, Title, Location, Description, Tags, Photographer, Source, Copyright, AiGenerated, FileExtension, Resolution, FileSize_MB) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(mediaId, title, location, description, tags, photographer, source, copyright, aiGenerated, extension, resolution, sizeMB, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
        stmt.finalize();
    } catch (e) {
        res.status(500).json({ error: "Storage error" });
    }
});

app.get('/api/photos', (req, res) => {
    db.all(`SELECT * FROM ImageMetadata ORDER BY UploadDate DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(port, () => {
    console.log(`🚀 Server active: http://localhost:3000`);
});