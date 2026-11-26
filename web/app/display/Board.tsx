"use client";

// The board shown on the Fire TV monitors. Driven entirely by the remote:
//   D-pad = move, OK (Enter) = pulled / undo, Back = cancel.
// The Fire TV app forwards Back to window.pullboardBack(); in a browser use Esc.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardResponse, Card, PulledInfo } from "@/lib/types";

const POLL_MS = 15_000;
const STALE_MS = 120_000;
const COLS = 3;
const HOLD_MS = 1500; // hold OK this long to bring back the last pulled order
const HOLD_SHOW_MS = 300; // shorter than this is a normal tap
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? ""; // the build this page came from
const RELOAD_GAP_MS = 120_000; // never auto-reload more often than this

/** A newer version was deployed: reload to pick it up. The sticks have no refresh button. */
function reloadForNewBuild() {
  try {
    const last = Number(sessionStorage.getItem("pullboard:reloaded") || 0);
    if (Date.now() - last < RELOAD_GAP_MS) return; // guard against a reload loop
    sessionStorage.setItem("pullboard:reloaded", String(Date.now()));
  } catch {}
  window.location.reload();
}

type Pulled = Card & { pulled: PulledInfo };
type Confirm = { action: "pull" | "undo"; card: Card } | null;

interface Params {
  screen: string;
  key: string;
  chime: boolean;
}

// The board is laid out at exactly 1920x1080 and scaled to fit any screen, like a TV picture.
// Fire TV WebViews can report 960x540 or 1920x1080; laptops anything. Same look everywhere.
const STAGE_W = 1920;
const STAGE_H = 1080;

function useFit(): React.CSSProperties {
  const [fit, setFit] = useState<React.CSSProperties>({ visibility: "hidden" });
  useEffect(() => {
    // Measure the part of the page that is really on screen. visualViewport stays right even
    // if a TV WebView zooms the page or ignores the viewport tag; innerWidth alone does not.
    const vv = window.visualViewport;
    const update = () => {
      const w = vv?.width || window.innerWidth;
      const h = vv?.height || window.innerHeight;
      if (!w || !h) return; // not laid out yet: a later measure will catch it
      const s = Math.min(w / STAGE_W, h / STAGE_H);
      setFit({
        transform: `scale(${s})`,
        left: (vv?.offsetLeft ?? 0) + (w - STAGE_W * s) / 2,
        top: (vv?.offsetTop ?? 0) + (h - STAGE_H * s) / 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    // Some WebViews settle their size shortly after load without firing "resize".
    const timers = [100, 500, 1500, 4000].map((ms) => setTimeout(update, ms));
    return () => {
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      timers.forEach(clearTimeout);
    };
  }, []);
  return fit;
}

// The display key rides in the URL fragment (/display?screen=front#key=...). Browsers never
// send the fragment to a server, so the key stays out of request logs and Referer headers.
// Older installs pass ?key= instead: still read, then moved into the fragment.
function readParams(): Params {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.slice(1));
  const key = h.get("key") || q.get("key") || "";
  if (q.has("key")) {
    q.delete("key");
    const rest = q.toString();
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}#key=${encodeURIComponent(key)}`);
    } catch {}
  }
  return { screen: q.get("screen") || "front", key, chime: q.get("chime") === "1" };
}

function ageText(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

function pulledAgo(ms: number): string {
  const t = ageText(ms);
  return t === "just now" ? t : `${t} ago`;
}

function ageLevel(ms: number, amber: number, red: number) {
  const min = ms / 60000;
  if (min >= red) return "red";
  if (min >= amber) return "amber";
  if (min < 2) return "new";
  return "ok";
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {}
}

export default function Board() {
  const [params, setParams] = useState<Params | null>(null);
  const [data, setData] = useState<BoardResponse | null>(null);
  const [lastOk, setLastOk] = useState<number>(0);
  const [clockOffset, setClockOffset] = useState(0); // server time - device time
  const [tick, setTick] = useState(Date.now());
  const fit = useFit();
  const cardsRef = useRef<HTMLElement | null>(null);
  const [hiddenBelow, setHiddenBelow] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const confirmOpen = useRef(false);
  confirmOpen.current = confirm !== null;
  const [toast, setToast] = useState<string | null>(null);
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const zone = useRef<"grid" | "strip">("grid");
  const lastGridIdx = useRef(0);

  useEffect(() => setParams(readParams()), []);

  const load = useCallback(async () => {
    if (!params) return;
    try {
      const res = await fetch(`/api/board?screen=${encodeURIComponent(params.screen)}`, {
        headers: { "x-display-key": params.key },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Wrong display key" : `Server error ${res.status}`);
      const j = (await res.json()) as BoardResponse;
      // Not while a "Pulled?" dialog is open: the next poll will do it.
      if (BUILD && j.build && j.build !== BUILD && !confirmOpen.current) return reloadForNewBuild();
      setClockOffset(Date.parse(j.now) - Date.now());
      setData(j);
      setLastOk(Date.now());
      setFailMsg(null);

      // Announce orders we haven't seen before (not on first load).
      const keys = j.toPull.map((c) => c.key);
      if (seen.current) {
        const fresh = j.toPull.filter((c) => !seen.current!.has(c.key));
        if (fresh.length) {
          setToast(fresh.length === 1 ? `New order ${fresh[0].number}` : `${fresh.length} new orders`);
          if (params.chime) beep();
          setTimeout(() => setToast(null), 8000);
        }
        keys.forEach((k) => seen.current!.add(k));
      } else {
        seen.current = new Set(keys);
      }
    } catch (e) {
      setFailMsg(e instanceof Error ? e.message : "Connection problem");
    }
  }, [params]);

  useEffect(() => {
    if (!params) return;
    load();
    const id = setInterval(load, POLL_MS);
    // The Fire TV app fires "focus" when it comes back to the front: refresh right away.
    window.addEventListener("focus", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [params, load]);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const now = tick + clockOffset;
  const toPull = data?.toPull ?? [];
  const justPulled = data?.justPulled ?? [];
  const order = useMemo(() => [...toPull.map((c) => c.key), ...justPulled.map((c) => c.key)], [toPull, justPulled]);

  // Keep focus valid as the list changes. If the focused card disappears (pulled on the
  // other screen, or here), stay in the grid on the card that took its place.
  useEffect(() => {
    if (!order.length) return setFocusKey(null);
    const gridIdx = toPull.findIndex((c) => c.key === focusKey);
    if (gridIdx >= 0) {
      lastGridIdx.current = gridIdx;
      if (zone.current === "grid") return;
    }
    if (zone.current === "strip" && justPulled.some((c) => c.key === focusKey)) return;
    zone.current = "grid";
    const fallback = toPull[Math.min(lastGridIdx.current, toPull.length - 1)] ?? justPulled[0];
    if (fallback && fallback.key !== focusKey) {
      if (!toPull.length) zone.current = "strip";
      setFocusKey(fallback.key);
    }
  }, [order, focusKey, toPull, justPulled]);

  useEffect(() => {
    if (focusKey) cardRefs.current.get(focusKey)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusKey]);

  // Count cards that don't fit on screen, so staff know to scroll down with the remote.
  useEffect(() => {
    const box = cardsRef.current;
    if (!box) return;
    const measure = () => {
      const bottom = box.getBoundingClientRect().bottom;
      let n = 0;
      box.querySelectorAll(".card").forEach((el) => {
        if (el.getBoundingClientRect().bottom > bottom + 2) n++;
      });
      setHiddenBelow(n);
    };
    measure();
    box.addEventListener("scroll", measure);
    return () => box.removeEventListener("scroll", measure);
  }, [data, focusKey, fit]);

  const send = useCallback(
    async (key: string, undo: boolean) => {
      if (!params || !data) return;
      // Optimistic update so the screen reacts instantly.
      setData((d) => {
        if (!d) return d;
        if (undo) {
          const c = d.justPulled.find((x) => x.key === key);
          if (!c) return d;
          const { pulled: _p, ...card } = c;
          void _p;
          const toPull = [...d.toPull, card].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          return { ...d, toPull, justPulled: d.justPulled.filter((x) => x.key !== key) };
        }
        const c = d.toPull.find((x) => x.key === key);
        if (!c) return d;
        const p: Pulled = { ...c, pulled: { at: new Date(now).toISOString(), screen: params.screen } };
        return { ...d, toPull: d.toPull.filter((x) => x.key !== key), justPulled: [p, ...d.justPulled] };
      });
      try {
        const res = await fetch("/api/pull", {
          method: "POST",
          headers: { "content-type": "application/json", "x-display-key": params.key },
          body: JSON.stringify({ key, screen: params.screen, undo }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setToast(`Couldn't save: ${j.error ?? res.status}`);
          setTimeout(() => setToast(null), 6000);
        }
      } catch {
        setToast("Couldn't save: no connection");
        setTimeout(() => setToast(null), 6000);
      }
      load();
    },
    [params, data, now, load],
  );

  // Latest state for timers (the hold-to-undo interval outlives a render).
  const latest = useRef({ confirm, justPulled, send });
  latest.current = { confirm, justPulled, send };

  // Hold OK to bring back the last pulled order.
  const hold = useRef<{ start: number; done: boolean; timer: ReturnType<typeof setInterval> } | null>(null);
  const [holdProgress, setHoldProgress] = useState<number | null>(null);

  const undoLast = useCallback(() => {
    const last = latest.current.justPulled[0];
    if (!last) {
      showToast("Nothing to bring back");
      return;
    }
    latest.current.send(last.key, true);
    setFocusKey(last.key);
    zone.current = "grid";
    showToast(`${last.number} is back`);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 5000);
  };

  const startHold = useCallback(() => {
    if (hold.current) return;
    const h = {
      start: performance.now(),
      done: false,
      timer: setInterval(() => {
        const elapsed = performance.now() - h.start;
        if (latest.current.confirm || h.done) return;
        if (elapsed >= HOLD_SHOW_MS) setHoldProgress(Math.min(1, (elapsed - HOLD_SHOW_MS) / (HOLD_MS - HOLD_SHOW_MS)));
        if (elapsed >= HOLD_MS) {
          h.done = true;
          undoLast();
          setTimeout(() => setHoldProgress(null), 250);
        }
      }, 30),
    };
    hold.current = h;
  }, [undoLast]);

  /** Ends a hold. Returns "tap" for a short press, otherwise null (hold finished or let go early). */
  const endHold = useCallback((): "tap" | null => {
    const h = hold.current;
    if (!h) return null;
    clearInterval(h.timer);
    hold.current = null;
    setHoldProgress(null);
    if (h.done) return null;
    return performance.now() - h.start < HOLD_SHOW_MS ? "tap" : null;
  }, []);

  // Remote / keyboard handling.
  // OK acts on release, so a press can be told apart from a hold:
  //   tap = open / confirm the dialog, hold ~1.5 s = bring back the last pulled order.
  useEffect(() => {
    const back = () => setConfirm(null);
    (window as unknown as { pullboardBack?: () => boolean }).pullboardBack = () => {
      const had = confirm !== null;
      back();
      return had;
    };
    const isOkKey = (e: KeyboardEvent) => e.key === "Enter" || e.key === " " || e.keyCode === 23;

    const onOk = () => {
      if (confirm) {
        if (confirm.action === "pull") {
          // Keep focus in the grid: move to the card that takes this one's place.
          const idx = toPull.findIndex((c) => c.key === confirm.card.key);
          const rest = toPull.filter((c) => c.key !== confirm.card.key);
          const nextCard = rest[Math.min(idx, rest.length - 1)];
          if (nextCard) setFocusKey(nextCard.key);
        }
        send(confirm.card.key, confirm.action === "undo");
        setConfirm(null);
        return;
      }
      if (!focusKey) return;
      const i = order.indexOf(focusKey);
      if (i < 0) return;
      if (i >= toPull.length) setConfirm({ action: "undo", card: justPulled[i - toPull.length] });
      else setConfirm({ action: "pull", card: toPull[i] });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (isOkKey(e)) {
        e.preventDefault();
        if (!e.repeat) startHold();
        return;
      }
      const isBack = k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack";
      if (confirm) {
        e.preventDefault();
        if (isBack) back();
        return;
      }
      if (!focusKey) return;
      const i = order.indexOf(focusKey);
      const nPull = toPull.length;
      const inStrip = i >= nPull;
      let next = i;
      if (k === "ArrowRight") next = Math.min(order.length - 1, i + 1);
      else if (k === "ArrowLeft") next = Math.max(0, i - 1);
      else if (k === "ArrowDown") next = inStrip ? i : i + COLS < nPull ? i + COLS : nPull < order.length ? nPull : i;
      else if (k === "ArrowUp") next = inStrip ? Math.max(0, nPull - 1) : Math.max(0, i - COLS);
      else return;
      e.preventDefault();
      if (next >= 0 && order[next]) {
        zone.current = next >= nPull ? "strip" : "grid";
        setFocusKey(order[next]);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isOkKey(e)) return;
      e.preventDefault();
      if (endHold() === "tap") onOk();
    };
    const onBlur = () => endHold();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [confirm, focusKey, order, toPull, justPulled, send, startHold, endHold]);

  const stale = (lastOk === 0 && !!failMsg) || (lastOk > 0 && tick - lastOk > STALE_MS);
  const alarm = !!data && toPull.some((c) => now - Date.parse(c.createdAt) >= data.alarmMin * 60000);
  const setRef = (key: string) => (el: HTMLElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  };

  return (
    <div className="stage" style={fit}>
      <div className="board">
        <header className="top">
          <h1 className={alarm ? "alarm" : ""}>
            To pull <span className="count">{data ? toPull.length : ""}</span>
          </h1>
          <div className="top-right">
            {data?.source === "mock" && <span className="dim small">Test data</span>}
            {data?.mode === "rehearsal" && <span className="dim small">Rehearsal</span>}
          </div>
        </header>

        {stale && <div className="banner">Not connected. Orders may be missing.</div>}
        {!stale && data && data.errors.length > 0 && (
          <div className="banner soft">Can’t reach Shopify. Showing the last orders received.</div>
        )}

        <main className="cards" ref={cardsRef}>
          {data && toPull.length === 0 && <div className="clear">All clear</div>}
          {toPull.map((c) => {
            const ms = now - Date.parse(c.createdAt);
            const lvl = data ? ageLevel(ms, data.amberMin, data.redMin) : "ok";
            return (
              <article key={c.key} ref={setRef(c.key)} className={`card lvl-${lvl} ${focusKey === c.key ? "focus" : ""}`}>
                <div className="card-head">
                  <span className="num">{c.number}</span>
                  {c.kind === "pickup" && <span className="dim">Pickup</span>}
                  <span className="age">{ageText(ms)}</span>
                </div>
                <ul className="items">
                  {c.items.slice(0, 4).map((it, i) => (
                    <li key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {it.image ? <img src={it.image} alt="" /> : <div className="noimg" />}
                      <div className="it">
                        <div className="it-title">{it.title}</div>
                        {it.variant && <div className="it-var">{it.variant}</div>}
                      </div>
                      {it.qty > 1 && <div className="qty">×{it.qty}</div>}
                    </li>
                  ))}
                  {c.items.length > 4 && <li className="dim">+{c.items.length - 4} more</li>}
                </ul>
              </article>
            );
          })}
        </main>

        {hiddenBelow > 0 && <div className="more-below">{hiddenBelow} more below</div>}

        {justPulled.length > 0 && (
          <footer className="strip">
            <span className="dim">Pulled</span>
            {justPulled.map((c) => (
              <span key={c.key} ref={setRef(c.key)} className={`chip ${focusKey === c.key ? "focus" : ""}`}>
                {c.number} <span className="dim">{pulledAgo(now - Date.parse(c.pulled.at))}</span>
              </span>
            ))}
          </footer>
        )}

        {confirm && (
          <div className="modal">
            <div className="dialog">
              <div className="q">
                {confirm.action === "pull" ? "Pulled" : "Put back"} <span className="dim">{confirm.card.number}?</span>
              </div>
              <div className="keys">
                <span className="key yes">OK</span>
                <span className="key no">Back</span>
              </div>
            </div>
          </div>
        )}

        {holdProgress !== null && (
          <div className="hold">
            <div className="hold-label">
              {justPulled[0] ? (
                <>
                  Bring back <span className="dim">{justPulled[0].number}</span>
                </>
              ) : (
                "Nothing to bring back"
              )}
            </div>
            {justPulled[0] && (
              <div className="hold-track">
                <div className="hold-fill" style={{ transform: `scaleX(${holdProgress})` }} />
              </div>
            )}
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
