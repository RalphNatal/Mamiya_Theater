const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

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
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js'],
  },
  // @supabase/supabase-js bundles a dynamic require() (for an optional Node-only
  // websocket fallback) that webpack can't statically analyze. It's harmless on web.
  ignoreWarnings: [
    { module: /@supabase[\\/]supabase-js/, message: /Critical dependency/ },
  ],
  plugins: [
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
    client: { overlay: { warnings: false, errors: true } },
  },
};