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
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');

const optionsPageDevConfig = {
  mode: 'development',
  devtool: false,
  entry: {
    optionsPage: './src/optionsPage/optionsPage.js',
    optionsPageStyles: './src/optionsPage/optionsPage.scss',
    contentPageStyles: './src/content/styles/content_script.scss'
  },
  output: {
    path: path.join(__dirname, '../../public/optionsPage'),
    filename: '[name].bundle.js'
  },
  module: {
    rules: [
      {
        enforce: 'pre',
        test: /\.js$/,
        exclude: /node_modules/,
        use: ['source-map-loader']
      },
      {
        test: /.js$/,
        exclude: [/node_modules/],
        use: [
          {
            loader: 'babel-loader',
            options: {
              babelrc: true,
              cacheDirectory: true
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
    constants: 'constants'
  },
  resolve: {
    modules: ['node_modules'],
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify')
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      OPTIONS_VIEW_FILENAME: process.env.EXT_PLATFORM === 'Safari' ? JSON.stringify('./safari.html') : process.env.EXT_PLATFORM === 'Firefox' ? JSON.stringify('./firefox.html') : JSON.stringify('./normal.html'),
      OPTIONS_VIEW_REGEXP: process.env.EXT_PLATFORM === 'Safari' ? /safari\.html$/ : process.env.EXT_PLATFORM === 'Firefox' ? /firefox\.html$/ : /normal\.html$/,
      PININFO_VIEW_FILENAME: JSON.stringify(`./${process.env.EXT_PLATFORM.toLowerCase()}.html`),
      PININFO_VIEW_REGEXP: BrowserRegExps[process.env.EXT_PLATFORM.toLowerCase()]
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
    new StyleLintPlugin({
      configFile: config.SCSSLintConfigFile,
      failOnError: false,
      extensions: ['scss']
    }),
    new ESLintPlugin({
      formatter: require('eslint-friendly-formatter'),
      emitError: true,
      emitWarning: true,
      failOnWarning: false,
      failOnError: false
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    DotenvConfig,
    new webpack.SourceMapDevToolPlugin({})
  ]
};

module.exports = optionsPageDevConfig;
