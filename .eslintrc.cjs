module.exports = {
  root: true,
  ignorePatterns: [
    "**/dist/**",
    "**/node_modules/**",
    "artifacts/**",
    "cicd/**",
    "plans/**",
    "docs/**"
  ],
  extends: ["./packages/config/eslint.base.cjs"]
};
