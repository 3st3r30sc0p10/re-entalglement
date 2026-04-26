yarn start

#Regenerate the zip:
./scripts/make-portable-zip.sh

# Initialize a new npm project

npm init -y

# Install webpack and necessary dependencies

npm install --save-dev webpack webpack-cli webpack-dev-server
npm install --save-dev html-webpack-plugin style-loader css-loader
npm install --save-dev @babel/core @babel/preset-env babel-loader
npm install --save-dev mini-css-extract-plugin
npm install --save d3 # We'll use D3.js for the network visualization

# Create the basic project structure

mkdir src
mkdir src/styles
mkdir src/scripts
mkdir src/data

# Create initial files

touch src/index.js
touch src/index.html
touch src/styles/main.css
touch webpack.config.js

# Add these scripts to your package.json:

{
"scripts": {
"start": "webpack serve",
"build": "webpack",
"watch": "webpack --watch"
}
}

# Re-entanglement Project

## UI: icon rail & slide panels

After you select a node on the graph, a **narrow icon rail** appears on the left (Bolt-style):

| Icon      | Action                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| **Video** | Fullscreen YouTube for the selected **video** node (autoplay when the overlay opens; closes with ✕ or `Escape`). |
| **Info**  | Slide-in panel from the **right** with title + full description (+ optional full-screen reader overlay).         |
| **Tags**  | Slide-in from the **right**: tag chips and image-search results (same behavior as the old bottom-left panel).    |
| **Tails** | Slide-in from the **right**: tail categories for the selected video; clicks still open the chat modal.           |

Only one slide panel is open at a time; **Escape** closes the topmost overlay (fullscreen video or slide panel).

### Welcome screen

On first load, a **full-screen landing** (Charcoal & Amber gradients, JetBrains Mono title, IBM Plex Sans body) introduces the project. **Enter visualization** dismisses it and shows the graph. **Watch a demo** runs the same transition, then an **[Intro.js](https://github.com/usablica/intro.js)** step-by-step tour of the graph, zoom controls, icon rail, and footer (see `src/scripts/interfaceTour.js`; library is **AGPL-3.0**). If there is **no pointer, keyboard, or wheel activity for 60 seconds** (tab must be visible), the welcome screen returns and auxiliary UI (side rail, chat, description overlay, image gallery) is closed.

## Setup Instructions

### Initial Setup

```bash
# Initialize a new npm project
npm init -y

# Install webpack and necessary dependencies
npm install --save-dev webpack webpack-cli webpack-dev-server
npm install --save-dev html-webpack-plugin style-loader css-loader
npm install --save-dev @babel/core @babel/preset-env babel-loader
npm install --save-dev mini-css-extract-plugin
npm install --save d3 # We'll use D3.js for the network visualization

# Create the basic project structure
mkdir src
mkdir src/styles
mkdir src/scripts
mkdir src/data

# Create initial files
touch src/index.js
touch src/index.html
touch src/styles/main.css
touch webpack.config.js
```

### Dependency Management

If you encounter module-related errors (like missing `events` module), follow these steps:

```bash
# Clean up existing dependencies
rm -rf node_modules package-lock.json yarn.lock

# Install dependencies with specific versions
yarn add webpack@5.89.0 webpack-cli@5.1.4 webpack-dev-server@4.15.1 html-webpack-plugin@5.5.3 style-loader@3.3.3 css-loader@6.8.1 @babel/core@7.23.3 @babel/preset-env@7.23.3 babel-loader@9.1.3 mini-css-extract-plugin@2.7.6 d3@7.8.5 html-entities@2.4.0
```

### Scripts

Add these scripts to your package.json:

```json
{
  "scripts": {
    "start": "webpack serve",
    "build": "webpack",
    "watch": "webpack --watch"
  }
}
```

### Project Structure

```
re-entanglement/
├── src/
│   ├── scripts/
│   ├── styles/
│   ├── data/
│   ├── index.js
│   └── index.html
├── webpack.config.js
├── package.json
└── README.md
```

### Development Server

The project uses two servers:

1. Webpack dev server (port 3000) - for frontend development
2. Proxy server (port 3001/3002) - for handling API requests

To start the development environment:

```bash
yarn start
```

This will start both servers. The proxy server will automatically try alternative ports (3002, 3003, etc.) if port 3001 is busy.

## APIs Used

This application integrates with multiple external APIs to fetch images and provide AI-powered chat functionality. All API requests are handled through a proxy server (running on port 3001) to avoid CORS issues, except where APIs support direct browser access.

### Image APIs

The application searches across **eight external image repositories** plus a **local publication set** whenever a user selects a tag (graph tag node, tag chip, or bottom-panel category).

#### Publication images (`src/images-publication/`)

- **What**: Curated JPGs shipped with the app, indexed by **`images-publication.xlsx`** in the same folder.
- **Columns** (header row): `Video-name`, `Image-name`, `keywords`, `url`, `description`. Matching uses **`keywords`** against the clicked tag (case-insensitive; comma/semicolon-separated terms; substring / multi-word overlap).
- **Serving**: The proxy exposes files at `GET /publication-media/<filename>` and search at **`GET /proxy/publication?q=<tag>`** (merged in `ImageAPIs.js` via `fetchPublicationImages()`; publication hits are listed **first**). JSON uses **path-only** image URLs (`/publication-media/...`) so the browser loads them on the **same origin as the app**.
- **Dev (webpack on port 3000)**: `webpack.config.js` proxies `/proxy` and `/publication-media` to the Express server (`127.0.0.1:3001`). The client uses `window.location.origin + '/proxy'` so publication requests and thumbnails are same-origin and reliable. Open the app at **`http://localhost:3000`** (not only the API on 3001).
- **Dependency**: The `xlsx` package reads the spreadsheet on the server. If the `.xlsx` is missing or unreadable, you can optionally add **`publication-manifest.json`** in the same folder (array of objects with the same field names).
- **Implementation**: `server.js` (catalog + static + `/proxy/publication`), `fetchPublicationImages()` in `ImageAPIs.js`.

#### 1. Art Institute of Chicago

- **API Endpoint**: `https://api.artic.edu/api/v1`
- **Proxy**: No (direct API call)
- **Usage**: Searches public domain artworks
- **Implementation**: `fetchChicagoArt()` in `ImageAPIs.js`

#### 2. New York Public Library (NYPL)

- **API Endpoint**: `https://api.repo.nypl.org/api/v2`
- **Proxy**: Yes (`/proxy/nypl`)
- **Authentication**: Token-based (API key required)
- **Usage**: Searches public domain images from NYPL collections
- **Implementation**: `fetchNYPLImages()` in `ImageAPIs.js`

#### 3. Metropolitan Museum of Art (MET)

- **API Endpoint**: `https://collectionapi.metmuseum.org/public/collection/v1`
- **Proxy**: No (direct API call)
- **Usage**: Searches MET collection artworks
- **Implementation**: `fetchMetArt()` in `ImageAPIs.js`

#### 4. Openverse (Creative Commons)

- **API Endpoint**: `https://api.openverse.engineering/v1`
- **Proxy**: Yes (`/proxy/openverse`)
- **Usage**: Searches Creative Commons licensed images
- **Implementation**: `fetchOpenverseImages()` in `ImageAPIs.js`

#### 5. Europeana

- **API Endpoint**: `https://api.europeana.eu/record/v2/search.json`
- **Proxy**: Yes (`/proxy/europeana`)
- **Authentication**: API key required
- **Usage**: Searches European cultural heritage collections
- **Implementation**: `fetchEuropeanaImages()` in `ImageAPIs.js`

#### 6. Wikimedia Commons

- **API Endpoint**: `https://commons.wikimedia.org/w/api.php`
- **Proxy**: Yes (`/proxy/commons`)
- **Usage**: Searches Wikimedia Commons media files
- **Implementation**: Uses official Wikimedia API with CORS support
- **Implementation**: `fetchCommonsImages()` in `ImageAPIs.js`

#### 7. Smithsonian Institution

- **API Endpoint**: `https://api.si.edu/openaccess/api/v1.0/search`
- **Proxy**: Yes (`/proxy/smithsonian`)
- **Authentication**: API key required
- **Usage**: Searches Smithsonian Open Access collections
- **Implementation**: `fetchSmithsonianImages()` in `ImageAPIs.js`

#### 8. Cleveland Museum of Art (CMA Open Access)

- **API Endpoint**: `https://openaccess-api.clevelandart.org/api/artworks/`
- **Proxy**: Yes (`/proxy/cleveland`)
- **Authentication**: None (public CC0 Open Access dataset) [\[docs\]](https://openaccess-api.clevelandart.org/#appendix-d)
- **Usage**: Searches Cleveland Museum of Art artworks with `has_image=1` and filters to `share_license_status = "CC0"`; uses `images.web` for thumbnails and `images.print`/`images.full` when available.
- **Implementation**: `fetchClevelandImages()` in `ImageAPIs.js`

### LLM API (chat)

The app defaults to **Google Gemini** via the server-side proxy (no Gemini API key in the browser).

- **Backend**: Google AI Studio / `generativelanguage.googleapis.com` (`generateContent`)
- **Proxy**: `POST /proxy/llm` (same OpenAI-style request body the UI already sends)
- **Secrets**: `GEMINI_API_KEY` and optional `LLM_DEFAULT_MODEL` in **`.env`** (see `.env.example`)
- **Knowledge**: optional `knowledge/**/*.md` + `.txt` merged into the system context when `LLM_PROVIDER=gemini` (see `server.js`)
- **Implementation**: `LLMIntegration.js` + `server.js` (`LLM_PROVIDER`, `proxyLlmToGemini`)
- **Webpack dev (`yarn start`)**: the dev bundle calls **`http://127.0.0.1:$PORT`** (default **3001**) for `GET /api/llm-meta` and `POST /proxy/llm`, so those requests always hit Express. Relying on `http://localhost:3000/api/…` alone can return **HTML** from the dev server’s SPA shell instead of JSON.

Optional **OpenAI-compatible** backends (LiteLLM, OpenAI, etc.): set `LLM_PROVIDER=openai` with `LLM_API_URL` and `LLM_API_KEY` in `.env`.

### Proxy Server Endpoints

The Express proxy server (`server.js`) provides the following endpoints:

- `GET /proxy/nypl` - NYPL API proxy
- `GET /proxy/openverse` - Openverse API proxy
- `GET /proxy/europeana` - Europeana API proxy
- `GET /proxy/commons` - Wikimedia Commons API proxy
- `GET /proxy/smithsonian` - Smithsonian API proxy
- `GET /proxy/cleveland` - Cleveland Museum of Art Open Access API proxy
- `GET /proxy/publication?q=` - Keyword filter over `images-publication.xlsx` + local files
- `GET /publication-media/*` - Static publication images (`.xlsx` / `.json` not served)
- `POST /proxy/llm` - LLM proxy (default: Gemini; optional OpenAI-compatible URL)
- `GET /api/llm-meta` - `{ provider, defaultModel }` for the browser (no secrets)
- `GET /health` - Health check endpoint

### API Configuration

LLM and other API secrets belong in **`.env`** at the project root (loaded by `dotenv` in `server.js`). Do not commit `.env`.

Project **`.env` overrides existing environment variables** for the same keys (so a stray `LLM_PROVIDER=openai` in your shell does not defeat `LLM_PROVIDER=gemini` in the file). After changing `.env`, restart `node server.js`. On startup the server logs either `LLM: Google Gemini …` or `LLM: OpenAI-compatible proxy → …`.

**`yarn start` and port 3001 in use:** If `node server.js` exits with “Port 3001 is already in use” while webpack keeps running, the UI still proxies LLM traffic to **whatever is already on 3001** — often an **older** `server.js` still configured for LiteLLM/Duke. Free the port (`lsof -i :3001`, stop that PID) and run `yarn start` again, or set **`PORT=3002`** for both the Express process and webpack’s proxy target (`webpack.config.js` uses `process.env.PORT`).

### Troubleshooting

If you encounter module-related errors:

1. Check the webpack.config.js file for proper module resolution
2. Ensure all dependencies are properly installed
3. Try cleaning and reinstalling dependencies using the steps above
4. Check the console for specific error messages

For CORS-related issues:

1. Verify the proxy server is running
2. Check the API endpoints in the ImageAPIs.js file
3. Ensure proper headers are set in the API requests

#### Port already in use (EADDRINUSE on port 3000)

If you see an error like `Error: listen EADDRINUSE: address already in use :::3000` when running `yarn start`:

1. Check what is using port 3000:
   ```bash
   lsof -i :3000
   ```
2. Stop that process (replace `<PID>` with the process id from the previous command):
   ```bash
   kill <PID>
   ```
   If that doesn't work, you may need:
   ```bash
   kill -9 <PID>
   ```
3. Alternatively, run the dev server on a different port (for example 3004):
   ```bash
   PORT=3004 yarn start
   ```
   Then open `http://localhost:3004/` in your browser.

#### "EMFILE: too many open files, watch" from webpack-dev-server

If webpack-dev-server exits with an error like `Watchpack Error (watcher): Error: EMFILE: too many open files, watch` during initialization:

1. Close other apps or terminals that may be watching many files.
2. On macOS, you can temporarily increase the file descriptor limit in the current shell:
   ```bash
   ulimit -n 4096
   PORT=3004 yarn start
   ```
3. If the problem persists, consider excluding large or unnecessary directories from watching in `webpack.config.js` using `watchOptions.ignored`.

## Design tokens (color hierarchy)

**Definitive visual style — Option 3 “Charcoal & Amber”:** warm charcoal main, amber secondary, red tertiary. All theme colors live in **`src/styles/tokens.css`**. Adjust only the **`--color-level-*`** anchors if you need to tune the brand (the D3 graph reads `--graph-*` variables on each redraw).

| Level             | Role                                       | Hex (anchors)                     | Used for                                                                           |
| ----------------- | ------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------- |
| **1 — Main**      | `--color-level-1-main` (+ muted/soft)      | `#1c1917` / `#44403c` / `#57534e` | Header/footer, primary text emphasis, **video** nodes, main borders, structural UI |
| **2 — Secondary** | `--color-level-2-secondary` (+ light/dark) | `#d97706` / `#f59e0b` / `#b45309` | **Tag** nodes & tag chips, links/accent, interactive chrome, progress bars         |
| **3 — Tertiary**  | `--color-level-3-tertiary` (+ light/dark)  | `#b91c1c` / `#f87171` / `#991b1b` | **Tail** nodes & tail categories, tertiary emphasis, errors                        |

Semantic aliases (`--color-primary`, `--color-secondary`, `--color-tertiary`, surfaces, borders, `--graph-node-*`, etc.) are derived from these levels so components stay consistent.

## Credits

- Bottom-panel image loading animation is adapted from [Rachel Smith’s canvas demo](https://codepen.io/rachsmith/pen/kOvmKq) (points + proximity lines, diamond-oriented canvas).
