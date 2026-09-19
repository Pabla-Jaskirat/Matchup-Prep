"use client";

import { useEffect, useId, useRef, useState } from "react";

import Headshot from "./Headshot";
import { MIN_QUERY_LENGTH, type Pitcher } from "@/lib/search";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; pitchers: Pitcher[] }
  | { kind: "error" };

const DEBOUNCE_MS = 200;

export default function PitcherSearch({
  onSelect,
}: {
  onSelect: (pitcher: Pitcher) => void;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [active, setActive] = useState(-1);
  const listId = useId();
  const latest = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      setState({ kind: "idle" });
      setActive(-1);
      return;
    }

    const controller = new AbortController();
    const seq = ++latest.current;
    setState({ kind: "loading" });

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pitchers/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { pitchers?: Pitcher[] };
        // A slow response for an older keystroke must not overwrite a newer one.
        if (seq !== latest.current) return;
        if (!res.ok) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "results", pitchers: body.pitchers ?? [] });
        setActive(-1);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        if (seq === latest.current) setState({ kind: "error" });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const results = state.kind === "results" ? state.pitchers : [];

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      // With nothing highlighted, Enter takes the top result: the common case
      // is typing three letters and pressing return.
      event.preventDefault();
      onSelect(results[active >= 0 ? active : 0]);
    } else if (event.key === "Escape") {
      setState({ kind: "idle" });
      setActive(-1);
    }
  }

  return (
    <div className="search">
      <label htmlFor={`${listId}-input`} className="label">
        Opposing starter
      </label>
      <input
        id={`${listId}-input`}
        className="input"
        type="search"
        autoComplete="off"
        placeholder="Type a few letters — “sku”"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      />

      <p className="status" role="status" aria-live="polite">
        {state.kind === "loading" && "Searching…"}
        {state.kind === "error" && "Search is unavailable right now."}
        {state.kind === "results" &&
          (results.length === 0
            ? `No pitcher matches “${q.trim()}”.`
            : `${results.length} pitcher${results.length === 1 ? "" : "s"}`)}
      </p>

      {results.length > 0 && (
        <ul className="results" id={listId} role="listbox" aria-label="Pitchers">
          {results.map((p, i) => (
            <li key={p.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`result${i === active ? " result-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(p)}
              >
                <Headshot id={p.id} size={36} />
                <span className="result-name">{p.name}</span>
                <span className="result-meta">
                  {p.throws === "L" ? "LHP" : p.throws === "R" ? "RHP" : "—"} ·{" "}
                  {p.pitches.toLocaleString()} pitches
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
