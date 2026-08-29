import * as React from "react";
import { useFlowStore } from "../../store/core";
import { ResultSummary } from "../../components/result/ResultSummary";

export function ResultScreen(): React.ReactElement {
  const result = useFlowStore((state) => state.lastResult);
  if (result === null) {
    return (
      <main className="result-missing" aria-labelledby="result-missing-title">
        <h1 id="result-missing-title">MATCH SUMMARY UNAVAILABLE</h1>
        <p>Match results are transient and do not survive a reload or direct link.</p>
        <nav aria-label="Result recovery"><a href="#/setup">Match setup</a> · <a href="#/build">Build zone</a></nav>
      </main>
    );
  }
  return <ResultSummary result={result} />;
}
