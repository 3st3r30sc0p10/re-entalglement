yarn start

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
