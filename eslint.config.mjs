import tseslint from 'typescript-eslint';

export default [
  {
    files: ['src/app/api/**/*.{js,ts,jsx,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/core/pipelineWorker',
                '@/core/pdfRenderer',
                '@/storage/objectStore',
                '@/core/embeddings',
                '@/core/llm',
                '@/core/writer',
                '@/core/critic',
                '**/pipelineWorker*',
                '**/pdfRenderer*',
                '**/objectStore*',
                '**/embeddings*',
                '**/core/llm*'
              ],
              message: 'Vercel API routes must only enqueue work, not import the execution pipeline.'
            }
          ]
        }
      ]
    }
  }
];
