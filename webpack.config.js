const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Load the repo-root .env so build-time config (e.g. PAYPAL_CLIENT_ID) can be
// injected below. Only the explicitly-listed keys in DefinePlugin reach the
// bundle — the rest of .env (service-role key, etc.) is NEVER exposed.
require('dotenv').config();

const appDirectory = path.resolve(__dirname);

const babelLoaderConfiguration = {
  test: /\.(tsx|ts|jsx|js)$/,
  include: [
    path.resolve(appDirectory, 'index.web.js'),
    path.resolve(appDirectory, 'App.tsx'),
    path.resolve(appDirectory, 'src'),
    path.resolve(appDirectory, 'node_modules/react-native'),
  ],
  use: {
    loader: 'babel-loader',
    options: {
      cacheDirectory: true,
      presets: [
        '@babel/preset-env',
        '@babel/preset-react',
        '@babel/preset-typescript',
      ],
      plugins: ['react-native-web'],
    },
  },
};

const imageLoaderConfiguration = {
  test: /\.(gif|jpe?g|png|svg)$/,
  use: {
    loader: 'url-loader',
    options: { name: '[name].[ext]', esModule: false },
  },
};

module.exports = {
  entry: path.resolve(appDirectory, 'index.web.js'),
  output: {
    filename: 'bundle.web.js',
    path: path.resolve(appDirectory, 'dist'),
  },
  module: {
    rules: [babelLoaderConfiguration, imageLoaderConfiguration],
  },
  resolve: {
    alias: { 'react-native$': 'react-native-web' },
    extensions: ['.web.js', '.js', '.ts', '.tsx'],
    fallback: {
      "crypto": false,
      "stream": false,
      "path": false
    }
  },
  ignoreWarnings: [
    { module: /@supabase[\\/]supabase-js/, message: /Critical dependency/ },
  ],
  plugins: [
    // Inject the PayPal client ID at build time from process.env.PAYPAL_CLIENT_ID
    // (loaded from .env above). Empty string when unset so paypal.ts falls back
    // to its sandbox literal — client IDs are public, so this is not a secret.
    // Switching sandbox → live is now an env change, not a code edit.
    new webpack.DefinePlugin({
      'process.env.PAYPAL_CLIENT_ID': JSON.stringify(process.env.PAYPAL_CLIENT_ID || ''),
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(appDirectory, 'public/index.html'),
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: path.resolve(appDirectory, 'public/fonts'), to: 'fonts' }],
    }),
  ],
  devServer: {
    static: { directory: path.join(appDirectory, 'public') },
    compress: true,
    port: 3000,
    open: true,
    // Serve index.html for any client-side route (e.g. /shows/:id) so refreshing
    // or deep-linking in dev works the same as the Vercel SPA rewrite in prod.
    historyApiFallback: true,
    client: { overlay: { warnings: false, errors: true } },
  },
};