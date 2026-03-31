module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: ["../../packages/config/eslint.base.cjs", "next/core-web-vitals"],
  ignorePatterns: [".next", "node_modules"]
};
