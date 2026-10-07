# PixelShare: Cloud-Native Photo Sharing on Microsoft Azure

PixelShare is a photo-sharing web app built to learn cloud-native development on Microsoft Azure. Users can upload, browse, edit and delete photos. Images are stored in Azure Blob Storage, metadata in Azure Cosmos DB, and the app is monitored with Application Insights.


## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js, Express (REST API) |
| Frontend | HTML, CSS, JavaScript |
| Storage | Azure Blob Storage (image files) |
| Database | Azure Cosmos DB (photo metadata) |
| Monitoring | Azure Application Insights |
| Hosting / CI | Azure App Service, deployed with GitHub Actions |

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/upload` | Upload a photo (base64) to Blob Storage and save its metadata |
| GET | `/api/photos` | List all photos |
| PUT | `/api/photos/:id` | Update a photo's details |
| DELETE | `/api/photos/:id` | Delete a photo and its blob |

## Run locally
```bash
cd BackEnd
npm install
# create a .env file with:
# COSMOS_DB_ENDPOINT=...  COSMOS_DB_KEY=...
# AZURE_STORAGE_CONNECTION_STRING=...  APPLICATIONINSIGHTS_CONNECTION_STRING=...
node server.cjs
```
Then open the URL shown in the console.

## What I learned
- Using Azure SDKs (`@azure/cosmos`, `@azure/storage-blob`) from Node.js
- Keeping secrets out of code with environment variables
- Monitoring a live app with Application Insights
- Deploying automatically to Azure App Service with GitHub Actions

---
Built by [Yasintha Agampodi](https://www.linkedin.com/in/yasintha-agampodi-a416a1325)
