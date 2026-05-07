const express = require('express');
const path = require('path');
const appInsights = require('applicationinsights');
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// 1. Azure Application Insights Setup
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
        .setAutoDependencyCorrelation(true)
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true)
        .setAutoCollectExceptions(true)
        .start();
}

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
app.use(express.static(path.join(__dirname, '../FrontEnd')));

// API Routes

// CREATE: Upload photo
app.post('/api/upload', async (req, res) => {
    const { 
        title, location, description, tags, photographer, 
        source, copyright, aiGenerated,
        img, extension, resolution, sizeMB 
    } = req.body;

    try {
        const mediaId = 'img_' + Date.now();
        const matches = img.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) return res.status(400).json({ error: "Invalid image format" });
        
        const buffer = Buffer.from(matches[2], 'base64');
        const blobName = mediaId + extension;

        const containerClient = blobServiceClient.getContainerClient(storageContainerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: `image/${extension.replace('.', '')}` }
        });

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
            ImageUrl: blockBlobClient.url,
            UploadDate: new Date().toISOString()
        };

        await cosmosContainer.items.create(metadata);
        res.json({ success: true, url: blockBlobClient.url });
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Storage error" });
    }
});

// READ: Get all photos
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

// UPDATE: Update photo metadata
app.put('/api/photos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { resources } = await cosmosContainer.items
            .query({ query: "SELECT * FROM c WHERE c.id = @id", parameters: [{ name: "@id", value: id }] })
            .fetchAll();

        if (resources.length === 0) return res.status(404).json({ error: "Photo not found" });

        const existingItem = resources[0];
        const updatedItem = { ...existingItem, ...updates };

        await cosmosContainer.items.upsert(updatedItem);

        res.json({ success: true, item: updatedItem });
    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: "Update failed" });
    }
});

// DELETE: Remove photo and metadata
app.delete('/api/photos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const { resources } = await cosmosContainer.items
            .query({ query: "SELECT * FROM c WHERE c.id = @id", parameters: [{ name: "@id", value: id }] })
            .fetchAll();
            
        if (resources.length === 0) return res.status(404).json({ error: "Photo not found" });
        const item = resources[0];

        // 1. Delete from Blob Storage
        try {
            const blobName = item.MediaID + item.FileExtension;
            const containerClient = blobServiceClient.getContainerClient(storageContainerName);
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.deleteIfExists();
        } catch (e) { console.error("Blob delete error:", e); }

        // 2. Delete from Cosmos DB
        try { await cosmosContainer.item(id, item.id).delete(); } 
        catch (e1) {
            try { await cosmosContainer.item(id, item.Photographer).delete(); } 
            catch (e2) {
                try { await cosmosContainer.item(id, item.Tags).delete(); }
                catch (e3) { await cosmosContainer.item(id, undefined).delete(); }
            }
        }

        res.json({ success: true, message: "Photo deleted from cloud" });
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ error: "Delete failed" });
    }
});

// Start Server
app.listen(port, async () => {
    console.log(`🚀 Server active on port ${port}`);
    await setupAzure();
});