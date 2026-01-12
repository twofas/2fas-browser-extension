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
const DotenvConfig = require('../utils/dotenvConfig');

// PACKAGES
const webpack = require('webpack');
const path = require('path');
const ESLintPlugin = require('eslint-webpack-plugin');

const backgroundDevConfig = {
  mode: 'development',
  devtool: false,
  name: 'background',
  entry: './src/background/background.js',
  output: {
    path: path.join(__dirname, '../../public/background'),
    filename: 'background.js'
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
        test: /images.*\.svg$/i,
        use: [{ loader: 'svg-inline-loader' }]
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
    new ESLintPlugin({
      configType: 'eslintrc',
      formatter: require('eslint-friendly-formatter'),
      emitError: true,
      emitWarning: true,
      failOnWarning: false,
      failOnError: false
    }),
    DotenvConfig,
    new webpack.SourceMapDevToolPlugin({})
  ]
};

module.exports = backgroundDevConfig;
