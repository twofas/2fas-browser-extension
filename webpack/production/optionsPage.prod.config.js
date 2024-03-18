//
//  This file is part of the 2FAS Browser Extension (https://github.com/twofas/2fas-browser-extension)
//  Copyright © 2023 Two Factor Authentication Service, Inc.
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
const BrowserRegExps = require('../utils/browserRegExps');
const DotenvConfig = require('../utils/dotenvConfig');

// PACKAGES
const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');

const optionsPageProdConfig = {
  entry: {
    optionsPage: './src/optionsPage/optionsPage.js',
    optionsPageStyles: './src/optionsPage/optionsPage.scss',
    contentPageStyles: './src/content/styles/content_script.scss'
  },
  mode: 'production',
  devtool: 'cheap-module-source-map',
  target: 'web',
  node: false,
  output: {
    path: path.join(__dirname, '../../public/optionsPage'),
    filename: '[name].bundle.js'
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
        test: /\.s?css$/,
        use: [
          { loader: MiniCssExtractPlugin.loader },
          { loader: 'css-loader', options: { importLoaders: 1 } },
          { loader: 'postcss-loader', options: { postcssOptions: { plugins: [require.resolve('autoprefixer')] } } },
          { loader: 'sass-loader' }
        ]
      },
      {
        test: /page-icons.*\.svg$/i,
        type: 'asset/source'
      },
      {
        test: /notification-logo\.svg$/i,
        type: 'asset/source'
      },
      {
        test: /images.*\.svg$/i,
        exclude: [/page-icons.*\.svg$/i, /notification-logo\.svg$/i],
        type: 'asset/resource',
        generator: {
          filename: '../images/[name][ext]'
        }
      },
      {
        test: /(jpe?g|png)$/i,
        type: 'asset/resource',
        generator: {
          filename: '../images/[name][ext]'
        }
      },
      {
        test: /\.woff2$/,
        type: 'asset/resource',
        generator: {
          filename: '../fonts/[name][ext]',
          emit: false
        }
      }
    ]
  },
  externals: {
    crypto: 'crypto',
    constants: 'constants'
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
    modules: ['node_modules']
  },
  plugins: [
    new webpack.DefinePlugin({
      OPTIONS_VIEW_FILENAME: process.env.EXT_PLATFORM === 'Safari' ? JSON.stringify('./safari.html') : process.env.EXT_PLATFORM === 'Firefox' ? JSON.stringify('./firefox.html') : JSON.stringify('./normal.html'),
      OPTIONS_VIEW_REGEXP: process.env.EXT_PLATFORM === 'Safari' ? /safari\.html$/ : process.env.EXT_PLATFORM === 'Firefox' ? /firefox\.html$/ : /normal\.html$/,
      PININFO_VIEW_FILENAME: JSON.stringify(`./${process.env.EXT_PLATFORM.toLowerCase()}.html`),
      PININFO_VIEW_REGEXP: BrowserRegExps[process.env.EXT_PLATFORM.toLowerCase()],
      MENU_VIEW_FILENAME: process.env.EXT_PLATFORM === 'Safari' ? JSON.stringify('./safari.html') : JSON.stringify('./normal.html'),
      MENU_VIEW_REGEXP: process.env.EXT_PLATFORM === 'Safari' ? /safari\.html$/ : /normal\.html$/
    }),
    new HtmlWebpackPlugin({
      chunks: ['optionsPage', 'optionsPageStyles', 'contentPageStyles'],
      title: '2FAS Browser Extension | Options',
      path: './public/optionsPage',
      filename: 'optionsPage.html',
      inject: true,
      hash: false,
      minify: config.HTMLminify,
      cache: true,
      showErrors: true,
      preload: '**/*.*',
      prefetch: '**/*.*',
      template: config.extPlatform[process.env.EXT_PLATFORM.toLowerCase()].optionsPageTemplate
    }),
    new ESLintPlugin({
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
      filename: '[name].css'
    }),
    new webpack.ProvidePlugin({
      global: require.resolve('../utils/global.js')
    }),
    DotenvConfig
  ]
};

module.exports = optionsPageProdConfig;
