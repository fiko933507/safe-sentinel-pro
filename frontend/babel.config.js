module.exports = function(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      './scripts/babel-supported-languages.cjs',
      './scripts/babel-play-store-policy.cjs'
    ],
  };
};
