module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    "plugin:vue/vue3-essential",
    "eslint:recommended",
    "@vue/typescript/recommended",
    "@vue/prettier",
    "@vue/prettier/@typescript-eslint",
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "no-useless-escape": "off",
    "no-empty": "off",
    "prefer-const": "off",
    "@typescript-eslint/ban-types": "off",
    "@typescript-eslint/adjacent-overload-signatures": "off",
    "@typescript-eslint/no-empty-function": "off",
    "no-prototype-builtins": "off",
    "no-async-promise-executor": "off",
    "no-constant-condition": "off",
    "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
    "no-self-assign": "off",
    "no-case-declarations": "off",
    "prefer-rest-params": "off",
    "no-undef": "off",
    "vue/no-dupe-keys": "off",
    "vue/no-setup-props-destructure": "off",
    "use-isnan": "off",
    "react-hooks/exhaustive-deps": "off",
    "@typescript-eslint/ban-ts-comment": "off",
  },
};
