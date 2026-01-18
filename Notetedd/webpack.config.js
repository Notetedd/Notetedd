const createExpoWebpackConfigAsync = require('@expo/webpack-config');
const { InjectManifest } = require('workbox-webpack-plugin');
const path = require('path');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: {
        dangerouslyAddModulePathsToTranspile: ['@expo/html-elements']
      }
    },
    argv
  );

  // Add manifest.json to public assets
  config.plugins.push(
    new (require('copy-webpack-plugin'))({
      patterns: [
        {
          from: path.resolve(__dirname, 'public'),
          to: path.resolve(__dirname, 'web-build'),
        },
      ],
    })
  );

  return config;
};