const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  devServer: {
    static: [
      {
        directory: path.join(__dirname, 'dist'),
      },
      {
        directory: path.join(__dirname, 'data'),
        publicPath: '/data',
      }
    ],
    compress: true,
    hot: true,
    open: true,
    port: 3000,
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
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      },
      {
        test: /\.json$/, // Add JSON loader rule (optional, for clarity)
        type: 'json'
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.json'],
    fallback: {
      "path": false,
      "fs": false,
      "stream": false,
      "crypto": false,
      "buffer": false,
      "util": false,
      "events": require.resolve("events/")
    },
    alias: {
      // D3 v6 uses UMD format, point to the main bundle
      'd3': path.resolve(__dirname, 'node_modules/d3/dist/d3.min.js')
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html'
    }),
    new MiniCssExtractPlugin({
      filename: 'styles.css'
    })
  ]
};