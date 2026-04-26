const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const mode = argv.mode || 'development';
  const isProd = mode === 'production';
  /** Must match `PORT` for `node server.js` (see package.json `start` script). */
  const apiTarget = `http://127.0.0.1:${Number(process.env.PORT) || 3001}`;

  const plugins = [
    /** Dev: LLM + meta hit Express on PORT (default 3001); webpack’s /api route can be swallowed by SPA fallback, so the client uses this origin directly. Prod: empty → same-origin. */
    new webpack.DefinePlugin({
      __BACKEND_ORIGIN__: JSON.stringify(isProd ? '' : apiTarget),
    }),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html'
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css'
    })
  ];

  if (isProd) {
    plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'data'),
            to: 'data',
            noErrorOnMissing: true,
            globOptions: {
              ignore: ['**/.~*', '**/.DS_Store']
            }
          }
        ]
      })
    );
  }

  return {
    mode,
    entry: './src/index.js',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.js',
      clean: true
    },
    /**
     * Default webpack limits (~244 KiB) warn on this stack (D3, GSAP, app code).
     * Raise thresholds so `yarn build` only warns if the bundle grows unexpectedly.
     */
    performance: {
      hints: 'warning',
      maxAssetSize: 1.25 * 1024 * 1024,
      maxEntrypointSize: 1.5 * 1024 * 1024
    },
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    devServer: {
      static: [
        {
          directory: path.join(__dirname, 'dist')
        },
        {
          directory: path.join(__dirname, 'data'),
          publicPath: '/data'
        }
      ],
      /** Same-origin /proxy + /publication-media → Express on 3001 (avoids cross-port fetch / image issues) */
      proxy: {
        '/proxy': { target: apiTarget, changeOrigin: true },
        '/publication-media': { target: apiTarget, changeOrigin: true },
        '/api': { target: apiTarget, changeOrigin: true }
      },
      /** Avoid sending `GET /api/*` to index.html when Accept is broad (helps if proxy order changes). */
      historyApiFallback: {
        htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
      },
      compress: true,
      hot: true,
      open: true,
      port: 3000
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules\/(?!(html-entities)\/).*/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader']
        },
        {
          test: /\.(png|jpe?g|gif|webp|svg)$/i,
          type: 'asset/resource'
        },
        {
          test: /\.json$/,
          type: 'json'
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.json'],
      fallback: {
        path: false,
        fs: false,
        stream: false,
        crypto: false,
        buffer: false,
        util: false,
        events: require.resolve('events/')
      },
      alias: {
        // D3 v6 uses UMD format, point to the main bundle
        d3: path.resolve(__dirname, 'node_modules/d3/dist/d3.min.js')
      }
    },
    plugins
  };
};
