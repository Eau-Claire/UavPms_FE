const path = require('path');
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Custom Anti-Slop & Architecture Plugin
 * Enforces AI-native development principles:
 * 1. Ban arbitrary comments (prevent AI escape hatches/excuses; only JSDoc is allowed for public APIs)
 * 2. Directory structure as strict architectural boundary (no cross-feature imports)
 */
const antiSlopPlugin = {
  meta: {
    name: 'eslint-plugin-anti-slop',
    version: '1.0.0',
  },
  rules: {
    'no-arbitrary-comments': {
      meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
          description:
            'Ban arbitrary comments as escape hatches. Only JSDoc (/** ... */) is permitted for public API documentation.',
        },
        schema: [],
      },
      create(context) {
        return {
          Program() {
            const comments = context.sourceCode.getAllComments();
            for (const comment of comments) {
              // 1% rule: JSDoc comments are allowed for documentation
              if (comment.type === 'Block' && comment.value.startsWith('*')) {
                continue;
              }
              const trimmed = comment.value.trim();
              // Compiler & linter directives are allowed
              if (
                trimmed.startsWith('eslint-') ||
                trimmed.startsWith('@ts-') ||
                trimmed.startsWith('istanbul') ||
                trimmed.startsWith('c8') ||
                trimmed.startsWith('prettier-ignore')
              ) {
                continue;
              }

              context.report({
                loc: comment.loc,
                message:
                  'Arbitrary comments are banned to prevent AI/developer escape hatches. Fix the root cause in code or turn this into an enforceable type or lint rule. Only JSDoc (/** ... */) is permitted for public API documentation.',
                fix(fixer) {
                  const sourceCode = context.sourceCode;
                  const line = sourceCode.lines[comment.loc.start.line - 1];
                  const commentTextInLine = line.trim();
                  // If entire line is just the comment, delete the whole line
                  if (
                    commentTextInLine.startsWith('//') ||
                    (commentTextInLine.startsWith('/*') && commentTextInLine.endsWith('*/'))
                  ) {
                    const startIndex = sourceCode.getIndexFromLoc({
                      line: comment.loc.start.line,
                      column: 0,
                    });
                    const endIndex =
                      comment.loc.start.line < sourceCode.lines.length
                        ? sourceCode.getIndexFromLoc({
                          line: comment.loc.start.line + 1,
                          column: 0,
                        })
                        : sourceCode.getIndexFromLoc({
                          line: comment.loc.start.line,
                          column: line.length,
                        });
                    return fixer.removeRange([startIndex, endIndex]);
                  }
                  return fixer.removeRange(comment.range);
                },
              });
            }
          },
        };
      },
    },
    'no-cross-feature-imports': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow cross-feature imports. Features must communicate only via Core, Shared, or Models.',
        },
        schema: [],
      },
      create(context) {
        const filename = (context.filename || context.getFilename() || '').replace(/\\/g, '/');
        const featureMatch = filename.match(/\/src\/app\/features\/([^/]+)\//);
        if (!featureMatch) return {};
        const currentFeature = featureMatch[1];

        return {
          ImportDeclaration(node) {
            const importSource = node.source.value;
            if (typeof importSource !== 'string' || !importSource.startsWith('.')) return;

            const currentFile = context.filename || context.getFilename();
            const resolved = path.resolve(path.dirname(currentFile), importSource).replace(/\\/g, '/');
            const targetMatch = resolved.match(/\/src\/app\/features\/([^/]+)\//);
            if (targetMatch) {
              const targetFeature = targetMatch[1];
              if (targetFeature !== currentFeature) {
                context.report({
                  node,
                  message: `Architecture boundary violation: Feature '${currentFeature}' cannot import from sibling feature '${targetFeature}'. Features must be isolated and communicate only via Core, Shared, or Models.`,
                });
              }
            }
          },
        };
      },
    },
  },
};

module.exports = defineConfig([
  {
    plugins: {
      'anti-slop': antiSlopPlugin,
    },
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],

      // Rule 1: Ban nuanced / error-prone timer APIs (AI escape hatches for race conditions)
      'no-restricted-globals': [
        'error',
        {
          name: 'setTimeout',
          message:
            'Raw setTimeout is banned. Do not use timers as quick workarounds for race conditions or change detection. Use RxJS timer/delay with takeUntilDestroyed() or proper Angular signals.',
        },
        {
          name: 'clearTimeout',
          message: 'Raw clearTimeout is banned along with setTimeout.',
        },
        {
          name: 'setInterval',
          message:
            'Raw setInterval is banned. Use RxJS interval() with takeUntilDestroyed() to prevent memory leaks.',
        },
        {
          name: 'clearInterval',
          message: 'Raw clearInterval is banned along with setInterval.',
        },
        {
          name: 'requestAnimationFrame',
          message:
            'Raw requestAnimationFrame is banned in feature code. Encapsulate animation logic inside a dedicated core service or directive.',
        },
        {
          name: 'cancelAnimationFrame',
          message: 'Raw cancelAnimationFrame is banned.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'setTimeout',
          message: 'window.setTimeout is banned. Use reactive signals or RxJS operators.',
        },
        {
          object: 'window',
          property: 'setInterval',
          message: 'window.setInterval is banned.',
        },
        {
          object: 'window',
          property: 'requestAnimationFrame',
          message: 'window.requestAnimationFrame is banned.',
        },
      ],

      // Rule 3: Ban 99% arbitrary comments (enforce root-cause fixes, only JSDoc allowed for public API contracts)
      'anti-slop/no-arbitrary-comments': 'error',

      // Rule 4: Ban debug artifacts (no console.log or debugger left behind)
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
    },
  },

  // Directory Boundary: Core modules cannot import from Feature modules
  {
    files: ['src/app/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '../features/**', '../../features/**', '../../../features/**'],
              message: 'Architecture boundary violation: Core modules must never import from Feature modules.',
            },
          ],
        },
      ],
    },
  },

  // Directory Boundary: Shared modules cannot import from Feature modules
  {
    files: ['src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '../features/**', '../../features/**', '../../../features/**'],
              message: 'Architecture boundary violation: Shared modules must never import from Feature modules.',
            },
          ],
        },
      ],
    },
  },

  // Directory Boundary: Models must be pure contracts
  {
    files: ['src/app/models/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/**',
                '**/core/**',
                '**/shared/**',
                '../features/**',
                '../core/**',
                '../shared/**',
              ],
              message:
                'Architecture boundary violation: Models must be pure data contracts and cannot import from Core, Shared, or Features.',
            },
          ],
        },
      ],
    },
  },

  // Directory Boundary: Cross-feature isolation (Feature A cannot import Feature B)
  {
    files: ['src/app/features/**/*.ts'],
    rules: {
      'anti-slop/no-cross-feature-imports': 'error',
    },
  },

  // HTML templates
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
