# Accuracy benchmark

`npm test` covers the deterministic rules for free. The benchmark runs the real pipeline and scores the output.

```bash
MOCK_AGENTS_FOR_LOCAL_TEST=true npm run eval   # free plumbing check
npm run eval -- --assets uc-il23-canary --repeats 1 --confirm-spend   # about $8
npm run eval:score
```

Before quoting any accuracy figure, delete mock runs from `evals/results/`, grow `assets.json` to about 30 assets with expert answer keys, run 3 repeats (about $720), and complete the human review in `review-sample.csv`. Anything without data prints NOT MEASURED. Rerun after any prompt or model change.
