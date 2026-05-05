const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
const port = process.env.PORT || 8080;

// Azure Configurations
const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const databaseId = process.env.COSMOS_DB_DATABASE || "PixelShareDB";
const containerId = process.env.COSMOS_DB_CONTAINER || "Images";
const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const storageContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "images";

// Initialize Azure Clients
const cosmosClient = new CosmosClient({ endpoint, key });
const blobServiceClient = BlobServiceClient.fromConnectionString(storageConnectionString);
let cosmosContainer;

async function setupAzure() {
    try {
        const { database } = await cosmosClient.databases.createIfNotExists({ id: databaseId });
        const { container } = await database.containers.createIfNotExists({ id: containerId });
        cosmosContainer = container;
        console.log("✅ Connected to Cosmos DB");

        const containerClient = blobServiceClient.getContainerClient(storageContainerName);
        await containerClient.createIfNotExists({ access: 'blob' });
        console.log("✅ Connected to Azure Blob Storage");
    } catch (err) {
        console.error("❌ Azure initialization failed:", err);
    }
}

// Middleware
app.use(express.json({ limit: '50mb' }));
// Serve frontend static files
app.use(express.static(path.join(__dirname, '../FrontEnd')));
// Fallback for local uploads (during transition)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.post('/api/upload', async (req, res) => {
    const { 
        title, location, description, tags, photographer, 
        source, copyright, aiGenerated, img, extension, 
        resolution, sizeMB 
    } = req.body;

    try {
        const mediaId = 'img_' + Date.now();
        const matches = img.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) return res.status(400).json({ error: "Invalid image format" });
        
        const buffer = Buffer.from(matches[2], 'base64');
        const blobName = mediaId + extension;

        // 1. Upload to Blob Storage
        const containerClient = blobServiceClient.getContainerClient(storageContainerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: `image/${extension.replace('.', '')}` }
        });

        // 2. Save Metadata to Cosmos DB
        const metadata = {
            id: mediaId,
            MediaID: mediaId,
            Title: title,
            Location: location,
            Description: description,
            Tags: tags,
            Photographer: photographer,
            Source: source,
            Copyright: copyright,
            AiGenerated: aiGenerated,
            FileExtension: extension,
            Resolution: resolution,
            FileSize_MB: sizeMB,
            ImageUrl: blockBlobClient.url, // Store the public URL
            UploadDate: new Date().toISOString()
        };

        await cosmosContainer.items.create(metadata);
        res.json({ success: true, url: blockBlobClient.url });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Storage error" });
    }
});

app.get('/api/photos', async (req, res) => {
    try {
        const { resources } = await cosmosContainer.items
            .query("SELECT * FROM c ORDER BY c.UploadDate DESC")
            .fetchAll();
        res.json(resources);
    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Start Server
app.listen(port, async () => {
    console.log(`🚀 Server active on port ${port}`);
    await setupAzure();
});