//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2026 Two Factor Authentication Service, Inc.
//  Contributed by Grzegorz Zając. All rights reserved.
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program. If not, see <https://www.gnu.org/licenses/>
//

// UTILS
const config = require('../utils/config');
const DotenvConfig = require('../utils/dotenvConfig');
const aliases = require('../utils/aliases');

// PACKAGES
const webpack = require('webpack');
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');

const contentScriptProdConfig = {
  name: 'contentScriptGlobal',
  entry: './src/content/content_script.js',
  mode: 'production',
  node: false,
  output: {
    path: path.join(__dirname, '../../public/content'),
    filename: 'content_script.js'
  },
  module: {
    rules: [
      {
        test: /.js$/,
        exclude: [/node_modules/],
        use: [
          {
            loader: 'babel-loader',
            options: {
              babelrc: true,
              cacheDirectory: false
            }
          }
        ]
      },
      {
        test: /content_script\.s?css$/,
        use: [
          { loader: MiniCssExtractPlugin.loader },
          { loader: 'css-loader', options: { importLoaders: 1 } },
          { loader: 'postcss-loader', options: { postcssOptions: { plugins: [require.resolve('autoprefixer')] } } },
          { loader: 'sass-loader' }
        ]
      },
      {
        test: /images.*\.(svg)$/i,
        use: [{ loader: 'svg-inline-loader' }]
      }
    ]
  },
  optimization: {
    chunkIds: 'size',
    moduleIds: 'size',
    concatenateModules: true,
    mangleExports: 'size',
    removeAvailableModules: true,
    removeEmptyChunks: true,
    mergeDuplicateChunks: true,
    minimize: true,
    minimizer: [
      new TerserPlugin({
        parallel: true
      }),
      new CssMinimizerPlugin()
    ],
    nodeEnv: 'production'
  },
  resolve: {
    alias: aliases
  },
  plugins: [
    new ESLintPlugin({
      configType: 'eslintrc',
      formatter: require('eslint-friendly-formatter'),
      emitError: true,
      emitWarning: true,
      failOnWarning: false,
      failOnError: false
    }),
    new StyleLintPlugin({
      configFile: config.SCSSLintConfigFile,
      failOnError: false
    }),
    new MiniCssExtractPlugin({
      filename: '../content/content_script.css'
    }),
    new webpack.ProvidePlugin({
      global: require.resolve('../utils/global.js')
    }),
    DotenvConfig
  ]
};

module.exports = contentScriptProdConfig;
