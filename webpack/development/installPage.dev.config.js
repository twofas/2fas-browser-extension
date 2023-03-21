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
const DotenvConfig = require('../utils/dotenvConfig');

// PACKAGES
const webpack = require('webpack');
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const StyleLintPlugin = require('stylelint-webpack-plugin');

const installPageDevConfig = {
  mode: 'development',
  devtool: false,
  entry: {
    installPage: './src/installPage/installPage.js',
    installPageStyles: './src/installPage/installPage.scss',
    contentPageStyles: './src/content/styles/content_script.scss'
  },
  output: {
    path: path.join(__dirname, '../../public/installPage'),
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
          { loader: 'css-loader' },
          { loader: 'postcss-loader', options: { postcssOptions: { plugins: [require.resolve('autoprefixer')] } } },
          { loader: 'sass-loader' }
        ]
      },
      {
        test: /notification-logo\.svg$/i,
        type: 'asset/source'
      },
      {
        test: /(jpe?g|png|svg)$/i,
        exclude: [/notification-logo\.svg$/i],
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
      CONFIGURE_VIEW_FILENAME: process.env.EXT_PLATFORM === 'Safari' ? JSON.stringify('./safari.html') : JSON.stringify('./normal.html'),
      CONFIGURE_VIEW_REGEXP: process.env.EXT_PLATFORM === 'Safari' ? /safari\.html$/ : /normal\.html$/
    }),
    new HtmlWebpackPlugin({
      chunks: ['installPage', 'installPageStyles', 'contentPageStyles'],
      title: '2FAS Browser Extension | Configuration',
      path: './public/installPage',
      filename: 'installPage.html',
      inject: true,
      hash: false,
      minify: config.HTMLminify,
      cache: true,
      showErrors: true,
      preload: '**/*.*',
      prefetch: '**/*.*',
      template: './src/installPage/installPage.html'
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
    new CopyWebpackPlugin(config.extPlatform[process.env.EXT_PLATFORM.toLowerCase()].filesList),
    DotenvConfig,
    new webpack.SourceMapDevToolPlugin({})
  ]
};

module.exports = installPageDevConfig;
