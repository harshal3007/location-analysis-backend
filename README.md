# location-analysis-backend

### 1. Clone the Repository

```bash
git clone https://github.com/harshal3007/location-analysis-backend.git

# Install dependencies
npm install

#Start server
npm start (make sure it is running on port 5001)

## Features

- Accepts PDF uploads using `multipart/form-data`
- Extracts raw text content using `pdf-parse`
- Applies custom logic to structure the text into relevant sections like:
  - Property details
  - Supply pipeline
  - Proximity insights
  - Lease summary
  - Demographics
  - Financials
- Sends a clean, structured JSON response to front-end



## Tech Stack

- Node.js
- Express.js
- Multer (file handling middleware)
- pdf-parse (PDF text extraction)


