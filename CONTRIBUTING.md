# Contributing to 2FAS Browser Extension

Thank you for considering contributing to the 2FAS open source project. Your support is greatly appreciated and will help us make this project even better. There are many ways you can help, from reporting bugs and improving the documentation to contributing code changes.

## Reporting Bugs

Before you submit a bug report, please search the [existing issues](https://github.com/twofas/2fas-browser-extension/issues) to see if the problem has already been reported. If it has, please add any additional information you have to the existing issue.

If you can't find an existing issue for your problem, please open a new issue and include the following information:

- A clear and descriptive title for the issue
- A description of the problem, including any error messages or logs
- Steps to reproduce the problem
- Any relevant details about your setup, such as name and version of browser you are using

## Contributing Code

We welcome meaningful code contributions to the 2FAS Browser Extension project. If you are interested in contributing, please follow these steps:

1. Fork this repository to your own GitHub account
2. Clone the repository to your local machine
3. Create a new branch for your changes (e.g. `feature/new-options-page`)
4. Make your changes
5. Commit them to your branch
6. Push your branch to your fork on GitHub
7. Open a pull request from your branch to the `develop` branch of this repository. Remember to resolve any merge conflicts

Please make sure your pull request includes the following:

- A clear and descriptive title
- A description of the changes you have made
- Any relevant issue numbers (e.g. "Fixes #123")
- A list of any dependencies your changes require

We will review your pull request and provide feedback as soon as possible. Thank you for your contribution!

By sharing ideas and code with the 2FAS community, either through GitHub or Discord, you agree that these contributions become the property of the 2FAS community and may be implemented into the 2FAS open source code.

## Project setup
### Requirements
Before you start, you should have installed:
  - NodeJS (currently used version is always available in `.nvmrc` and `package.json` files). If you have installed `nvm`, you can use `nvm use` command in project directory.
  - latest `npm` or `yarn`

### First build
1. Copy `.env.example` file and save it as `.env`
2. Run `npm install` or `yarn install`
3. Run command for chosen browser (f.e. `npm run chrome-dev` or `yarn chrome-dev` for Chrome browser)

### Useful scripts
`chrome-dev`, `opera-dev`, `firefox-dev`, `edge-dev`, `safari-dev` - These scripts build extension code for development for chosen browser (without production mode, browserlist-update etc.)

`chrome-prod`, `opera-prod`, `firefox-prod`, `edge-prod`, `safari-prod` - These scripts build production extension code.

`chrome-build`, `opera-build`, `firefox-build`, `edge-build` - These scripts build production extension code and creates zip files for it. There is no script for Safari, because Safari version is created by xCode.

`all-build` - Script that performs build for all browsers (except Safari).

`firefox-run` - Additional script for `web-ext` tool for Firefox. You can read more about `web-ext` [`here`](https://github.com/mozilla/web-ext).

Other scripts are only aliases for longer commands. You don't need to know them and you shouldn't run them separately.