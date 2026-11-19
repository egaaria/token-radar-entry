# Token Radar

A no-network dashboard that ranks pre-token protocols by an implied value derived from the sealed snapshot. It separates protocols whose tokens already trade, covers the complete 40-protocol watchlist, and adds an early radar of 160 lower-floor candidates.

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/egaaria/token-radar-entry/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/egaaria/token-radar-entry/reward.svg)](https://make.fun/c/token-radar-01)

## Run

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

The program writes `board.json`, `data.js`, the static `dashboard/`, screenshots, and `dossier.json` into `out/`. The dashboard has search, category filtering, sortable columns, a live-token comparison view, and a detail panel with the model inputs and a concrete, costed farm plan.

## Model

Every row uses the same transparent model: TVL is the base, seven-day TVL change adjusts momentum, chain breadth rewards protocols present on several chains, and time since first listing supplies a maturity multiplier. Missing dates use a documented neutral age. No protocol name is special-cased, and implied value is an estimate rather than a token-price claim.

The snapshot is sealed by the competition. The dashboard reads only the generated local `data.js`; it never requests a network resource.

Each row also carries a bounded 0–100 signal score (momentum + chain breadth + date completeness), a cohort (`watchlist` or `early-radar`), three evidence strings, and explicit missing-field caveats. The signal is a triage aid, not a second price model: the ranked order remains the transparent implied-value calculation above. Detail views expose those evidence and caveat fields so a high rank cannot hide weak source coverage.

## Safety note

Farm plans are research checklists, not financial advice. Verify a protocol's official documentation, never sign an unknown transaction, and never pay to claim a reward.

## License

MIT
