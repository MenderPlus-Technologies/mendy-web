"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Glyph, IconSprite } from "@/components/icons";
import { chatLanguage, currentLocation } from "@/lib/ai";
import {
  CARE_LINE_DISPLAY,
  CARE_NEEDS,
  DOCTOR_FEE,
  DOCTOR_FOR,
  DOCTOR_WHATSAPP,
  FLW_PUBLIC_KEY,
  RED_FLAGS,
  STARTERS,
  VERIFY_URL,
  VIEWS,
  WALLET_USES,
  errorCopy,
  fallbackText,
  md,
  newRef,
  parseView,
  waLink,
  type Turn,
  type ViewName,
} from "@/lib/mendy";

type MeMsg = { id: number; type: "me"; text: string };
type AlertMsg = { id: number; type: "alert" };
type MendyMsg = { id: number; type: "mendy"; html: string; pending: boolean; actions: boolean };
type ChatMsg = MeMsg | AlertMsg | MendyMsg;

type Consult = {
  ref: string;
  name: string;
  phone: string;
  email: string;
  forWho: string;
  age: string;
  problem: string;
};

type DocStep = "form" | "paying" | "done";

type MapResult = { label: string; embed: string };

type FlwModal = { close: () => void };

declare global {
  interface Window {
    FlutterwaveCheckout?: (options: Record<string, unknown>) => FlwModal;
  }
}

function loadFlutterwave() {
  return new Promise<void>((resolve, reject) => {
    if (window.FlutterwaveCheckout) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.onload = () => (window.FlutterwaveCheckout ? resolve() : reject(new Error("missing")));
    script.onerror = () => reject(new Error("load"));
    document.head.appendChild(script);
  });
}

export function MendyApp() {
  const [view, setView] = useState<ViewName>("ask");
  const [greet, setGreet] = useState("Hello");
  const [chatting, setChatting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState("");
  const [showRed, setShowRed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  const [needQ, setNeedQ] = useState(CARE_NEEDS[0].q);
  const [area, setArea] = useState("");
  const [careMsg, setCareMsg] = useState("");
  const [mapResult, setMapResult] = useState<MapResult | null>(null);

  const [docName, setDocName] = useState("");
  const [docPhone, setDocPhone] = useState("");
  const [docEmail, setDocEmail] = useState("");
  const [docFor, setDocFor] = useState<string>(DOCTOR_FOR[0]);
  const [docAge, setDocAge] = useState("");
  const [docProblem, setDocProblem] = useState("");
  const [docOk, setDocOk] = useState(false);
  const [docErr, setDocErr] = useState("");
  const [docRed, setDocRed] = useState(false);
  const [docStep, setDocStep] = useState<DocStep>("form");
  const [payTitle, setPayTitle] = useState("Waiting for your payment…");
  const [payText, setPayText] = useState("Finish paying in the payment window. Don't close this page.");
  const [payOffline, setPayOffline] = useState(false);
  const [docRefCode, setDocRefCode] = useState("-");
  const [docHref, setDocHref] = useState(`https://wa.me/${DOCTOR_WHATSAPP}`);

  const [wlName, setWlName] = useState("");
  const [wlState, setWlState] = useState("");
  const [wlUses, setWlUses] = useState<string[]>([]);
  const [wlOk, setWlOk] = useState(false);
  const [wlErr, setWlErr] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  const appRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const phoneRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const payingRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<Turn[]>([]);
  const conversationIdRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const chattingRef = useRef(false);
  const flwRef = useRef<FlwModal | null>(null);
  const paidRef = useRef(false);
  const consultRef = useRef<Consult | null>(null);
  const lastTouch = useRef(0);
  const followQueued = useRef(false);

  chattingRef.current = chatting;

  function nextId() {
    idRef.current += 1;
    return idRef.current;
  }

  function follow(force: boolean) {
    const thread = threadRef.current;
    if (!thread) return;
    if (!force && (followQueued.current || Date.now() - lastTouch.current < 1500)) return;
    followQueued.current = true;
    requestAnimationFrame(() => {
      followQueued.current = false;
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
  }

  function nearBottom() {
    const thread = threadRef.current;
    if (!thread) return true;
    return thread.scrollTop + thread.clientHeight >= thread.scrollHeight - 160;
  }

  function go(name: ViewName) {
    setView(name);
    try {
      history.replaceState(null, "", "#" + name);
    } catch {
      /* ignore */
    }
    if (screenRef.current) screenRef.current.scrollTop = 0;
    if (name === "ask" && chattingRef.current) follow(true);
  }

  useLayoutEffect(() => {
    setView(parseView(window.location.hash));
    const hour = new Date().getHours();
    setGreet(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);

  useEffect(() => {
    function onHash() {
      setView(parseView(window.location.hash));
      if (screenRef.current) screenRef.current.scrollTop = 0;
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!mapResult) return;
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [mapResult]);

  useEffect(() => {
    const body = document.body;
    body.classList.toggle("chatting", chatting);
    body.classList.toggle("typing", typing);
    for (const name of VIEWS) body.classList.toggle("view-" + name, name === view);
  }, [chatting, typing, view]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    function markTouch() {
      lastTouch.current = Date.now();
    }
    thread.addEventListener("touchstart", markTouch, { passive: true });
    thread.addEventListener("touchmove", markTouch, { passive: true });
    thread.addEventListener("wheel", markTouch, { passive: true });
    return () => {
      thread.removeEventListener("touchstart", markTouch);
      thread.removeEventListener("touchmove", markTouch);
      thread.removeEventListener("wheel", markTouch);
    };
  }, []);

  useEffect(() => {
    const box = questionRef.current;
    if (!box) return;
    if (!chatting) {
      box.rows = 3;
      box.style.height = "";
      return;
    }
    box.rows = 1;
    box.style.height = "auto";
    const height = Math.min(Math.max(box.scrollHeight, 48), 160);
    box.style.height = height + "px";
  }, [chatting, question]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (
        query.matches &&
        target instanceof Element &&
        target.matches("input:not([type=checkbox]), textarea, select")
      ) {
        setTyping(true);
      }
    }
    function onFocusOut() {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (
          !active ||
          !(active instanceof Element) ||
          !active.matches("input:not([type=checkbox]), textarea, select")
        ) {
          setTyping(false);
        }
      }, 120);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    function sizeApp() {
      const viewport = window.visualViewport;
      if (!viewport || Math.abs((viewport.scale || 1) - 1) > 0.01) return;
      const style = getComputedStyle(document.documentElement);
      const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      app!.style.height = Math.round(viewport.height - pad) + "px";
      if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      if (chattingRef.current && document.activeElement === questionRef.current) follow(true);
    }
    window.visualViewport?.addEventListener("resize", sizeApp);
    window.visualViewport?.addEventListener("scroll", sizeApp);
    window.addEventListener("resize", sizeApp);
    sizeApp();
    return () => {
      window.visualViewport?.removeEventListener("resize", sizeApp);
      window.visualViewport?.removeEventListener("scroll", sizeApp);
      window.removeEventListener("resize", sizeApp);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mendy-consult") || "null") as {
        ref?: string;
        href?: string;
        at?: number;
      } | null;
      if (saved?.ref && saved.href && saved.at && Date.now() - saved.at < 12 * 3600 * 1000) {
        setDocRefCode(saved.ref);
        setDocHref(saved.href);
        setDocStep("done");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (docStep === "paying") payingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [docStep]);

  function patchMendy(id: number, patch: Partial<MendyMsg>) {
    setMessages((items) =>
      items.map((item) => (item.type === "mendy" && item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text) {
      questionRef.current?.focus();
      return;
    }
    if (busy) return;
    setChatting(true);
    setQuestion("");
    setShowRed(false);
    const items: ChatMsg[] = [{ id: nextId(), type: "me", text }];
    if (RED_FLAGS.test(text)) items.push({ id: nextId(), type: "alert" });
    const cardId = nextId();
    items.push({ id: cardId, type: "mendy", html: "", pending: true, actions: false });
    setMessages((current) => [...current, ...items]);
    const nextTurns = [...turnsRef.current, { role: "user" as const, content: text }].slice(-16);
    turnsRef.current = nextTurns;
    setBusy(true);
    requestAnimationFrame(() => follow(true));

    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const location = await currentLocation();
      if (controller.signal.aborted) {
        const cancelled = new Error("aborted");
        cancelled.name = "AbortError";
        throw cancelled;
      }
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          language: chatLanguage(text),
          ...(location ? { location } : {}),
        }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        conversationId?: string;
        error?: string;
      };
      if (!response.ok) {
        const failed = new Error("upstream") as Error & { code?: string };
        failed.code = data.error || "upstream_error";
        throw failed;
      }
      if (data.conversationId) conversationIdRef.current = data.conversationId;
      const reply = String(data.reply || "");
      turnsRef.current = [...turnsRef.current, { role: "assistant", content: reply }];
      patchMendy(cardId, { html: md(reply), pending: false, actions: true });
    } catch (error) {
      const coded = error as { code?: string; name?: string; text?: string };
      if (coded.code === "cancelled" || coded.name === "AbortError") {
        if (coded.text) {
          turnsRef.current = [...turnsRef.current, { role: "assistant", content: coded.text }];
          patchMendy(cardId, { html: md(coded.text), pending: false, actions: false });
        } else {
          turnsRef.current = turnsRef.current.slice(0, -1);
          patchMendy(cardId, { html: '<span class="muted">Stopped.</span>', pending: false, actions: false });
        }
      } else if (coded.code === "not_configured") {
        turnsRef.current = turnsRef.current.slice(0, -1);
        patchMendy(cardId, { html: md(fallbackText()), pending: false, actions: true });
      } else {
        const message =
          coded.code === "unexpected_response"
            ? "Mendy replied, but this page could not read the answer. Please try again."
            : errorCopy(coded.code);
        const html =
          (coded.text ? md(coded.text) : "") +
          md(
            message ||
              "Something went wrong. Please try again. If it keeps happening, report it on " +
                CARE_LINE_DISPLAY +
                ".",
          );
        turnsRef.current = turnsRef.current.slice(0, -1);
        patchMendy(cardId, { html, pending: false, actions: true });
      }
    } finally {
      const stick = nearBottom();
      abortRef.current = null;
      setBusy(false);
      if (stick) follow(true);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function newChat() {
    abortRef.current?.abort();
    turnsRef.current = [];
    conversationIdRef.current = "";
    setMessages([]);
    setChatting(false);
    setQuestion("");
    setShowRed(false);
    if (screenRef.current) screenRef.current.scrollTop = 0;
    questionRef.current?.focus();
  }

  function showMaps(label: string, embed: string) {
    setMapResult({ label, embed });
  }

  function searchArea(event: React.FormEvent) {
    event.preventDefault();
    const place = area.trim();
    if (!place) {
      setCareMsg("Type your area or town, or tap Search near me.");
      return;
    }
    setCareMsg("");
    const query = needQ + " in " + place + ", Nigeria";
    showMaps(query, query);
  }

  function searchNearMe() {
    const label = needQ + " near me";
    if (!navigator.geolocation) {
      setCareMsg("The map will search for places near you.");
      showMaps(label, label);
      return;
    }
    setCareMsg("Finding your location…");
    let done = false;
    const timer = window.setTimeout(() => {
      if (!done) {
        done = true;
        setCareMsg("");
        showMaps(label, label);
      }
    }, 9000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        const ll = position.coords.latitude.toFixed(5) + "," + position.coords.longitude.toFixed(5);
        setCareMsg("");
        showMaps(label, needQ + " near " + ll);
      },
      () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        setCareMsg("We couldn't get your location. Type your area, or the map will search nearby.");
        showMaps(label, label);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  function selectPhone() {
    const node = phoneRef.current;
    if (!node) return;
    try {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch {
      /* ignore */
    }
  }

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(CARE_LINE_DISPLAY.replace(/\s/g, ""));
      setCopyMsg("Number copied.");
    } catch {
      selectPhone();
      setCopyMsg("Select the number above to copy it.");
    }
  }

  function payFailed(message: string) {
    setDocStep("form");
    setDocErr(message);
  }

  function connected(transactionId: string | number | undefined, consult: Consult) {
    const text =
      "Hello doctor, I have paid for a Mendy consultation.\nReference: " +
      consult.ref +
      (transactionId ? "\nPayment ID: " + transactionId : "") +
      "\nName: " +
      consult.name +
      "\nFor: " +
      consult.forWho +
      (consult.age ? " (age " + consult.age + ")" : "") +
      "\nWhat's going on: " +
      consult.problem;
    const href = "https://wa.me/" + DOCTOR_WHATSAPP + "?text=" + encodeURIComponent(text);
    setDocRefCode(consult.ref);
    setDocHref(href);
    setDocStep("done");
    try {
      localStorage.setItem("mendy-consult", JSON.stringify({ ref: consult.ref, href, at: Date.now() }));
    } catch {
      /* ignore */
    }
  }

  async function verifyPayment(transactionId: string | number | undefined, consult: Consult) {
    setPayTitle("Checking your payment…");
    setPayText("This takes a few seconds.");
    setPayOffline(false);
    if (!VERIFY_URL) {
      connected(transactionId, consult);
      return;
    }
    try {
      const response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: transactionId, tx_ref: consult.ref, amount: DOCTOR_FEE }),
      });
      const data = (await response.json()) as { verified?: boolean };
      if (data.verified) connected(transactionId, consult);
      else {
        payFailed(
          "We could not confirm your payment. If you were charged, call 0913 329 3575 with reference " +
            consult.ref +
            ".",
        );
      }
    } catch {
      payFailed(
        "We could not confirm your payment right now. If you were charged, call 0913 329 3575 with reference " +
          consult.ref +
          ".",
      );
    }
  }

  function startPayment(consult: Consult) {
    paidRef.current = false;
    consultRef.current = consult;
    setPayTitle("Waiting for your payment…");
    setPayText("Finish paying in the payment window. Don't close this page.");
    setPayOffline(false);
    setDocStep("paying");
    if (!FLW_PUBLIC_KEY) {
      setPayOffline(true);
      return;
    }
    loadFlutterwave()
      .then(() => {
        flwRef.current =
          window.FlutterwaveCheckout?.({
            public_key: FLW_PUBLIC_KEY,
            tx_ref: consult.ref,
            amount: DOCTOR_FEE,
            currency: "NGN",
            payment_options: "card, banktransfer, ussd",
            customer: { email: consult.email, phone_number: consult.phone, name: consult.name },
            customizations: { title: "Mendy doctor consultation", description: "Chat with a doctor on WhatsApp" },
            callback: (data: { status?: string; transaction_id?: string | number }) => {
              paidRef.current = true;
              try {
                flwRef.current?.close();
              } catch {
                /* ignore */
              }
              if (data && (data.status === "successful" || data.status === "completed")) {
                verifyPayment(data.transaction_id, consult);
              } else {
                payFailed("The payment did not go through. You have not been charged twice. Please try again.");
              }
            },
            onclose: () => {
              if (!paidRef.current) payFailed("Payment was not completed. You can try again.");
            },
          }) ?? null;
      })
      .catch(() => setPayOffline(true));
  }

  function submitDoctor(event: React.FormEvent) {
    event.preventDefault();
    const name = docName.trim();
    const phone = docPhone.replace(/[^\d+]/g, "");
    const email = docEmail.trim();
    const problem = docProblem.trim();
    const age = docAge.trim();
    let err = "";
    if (!name) err = "Please add your full name.";
    else if (phone.replace(/\D/g, "").length < 10) err = "Please add a WhatsApp number the doctor can reach.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err = "Please add an email address for your receipt.";
    else if (!problem) err = "Please tell the doctor briefly what is going on.";
    else if (RED_FLAGS.test(problem)) err = "This could be an emergency. Please call 112 or go to the nearest hospital now.";
    else if (!docOk) err = "Please tick the box to continue.";
    setDocErr(err);
    if (err) return;
    startPayment({ ref: newRef(), name, phone, email, forWho: docFor, age, problem });
  }

  function cancelPayment() {
    try {
      flwRef.current?.close();
    } catch {
      /* ignore */
    }
    setDocStep("form");
  }

  function newConsultation() {
    try {
      localStorage.removeItem("mendy-consult");
    } catch {
      /* ignore */
    }
    consultRef.current = null;
    setDocProblem("");
    setDocOk(false);
    setDocErr("");
    setDocRed(false);
    setDocStep("form");
  }

  const walletHref = waLink(
    "Hello Indura, I'd like to join the health wallet waitlist.\nName: " +
      wlName.trim() +
      (wlState.trim() ? "\nState: " + wlState.trim() : "") +
      (wlUses.length ? "\nI'd use it for: " + wlUses.join(", ") : ""),
  );

  function joinWaitlist(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!wlName.trim()) {
      event.preventDefault();
      setWlErr("Please add your name.");
      nameRef.current?.focus();
      return;
    }
    if (!wlOk) {
      event.preventDefault();
      setWlErr("Please tick the box so we can contact you about the launch.");
      return;
    }
    setWlErr("");
  }

  return (
    <>
      <IconSprite />
      <div className="backdrop" aria-hidden="true">
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>
      <div className="app" id="app" ref={appRef}>
        <header className="top glass">
          <a className="brand" href="#ask" aria-label="Mendy home" onClick={(event) => { event.preventDefault(); go("ask"); }}>
            <Glyph id="mark" width={30} height={32} />
            <span className="name">Mendy</span>
            <span className="by">by Indura Health</span>
          </a>
          <MainNav view={view} onGo={go} className="nav-top" />
          <a className="sos" href="tel:112" aria-label="Emergency: call 112">
            <Glyph id="i-phone" />
            <span className="long">Emergency</span> 112
          </a>
        </header>

        <div className="screen" id="screen" ref={screenRef}>
          <main className="wrap">
            <section id="v-ask" className="view" aria-labelledby="ask-h" hidden={view !== "ask"}>
              <div className="hero hero-only">
                <span className="hello glass">
                  <i aria-hidden="true" />
                  <span>
                    <span id="greet">{greet}</span> · Mendy is free to use
                  </span>
                </span>
                <h1 className="big" id="ask-h">How are you feeling today?</h1>
                <p className="lead">
                  Ask about your health, your cover or paying for care. Write in English, Pidgin, Hausa, Yorùbá or Igbo, and Mendy will reply in the same language.
                </p>
              </div>

              <div className="ask-col">
                <div className="chat-bar chat-only">
                  <h2 className="mid">Your chat with Mendy</h2>
                  <button type="button" className="ghost" onClick={newChat}>New chat</button>
                </div>
                <div className="thread chat-only" ref={threadRef} aria-live="polite">
                  {messages.map((message) => {
                    if (message.type === "me") {
                      return <div className="me" key={message.id}>{message.text}</div>;
                    }
                    if (message.type === "alert") {
                      return (
                        <div className="alert" key={message.id}>
                          <strong>If this is happening now, call 112 or go to the nearest hospital.</strong>
                          <span>Don&apos;t wait for an answer here.</span>
                        </div>
                      );
                    }
                    return (
                      <div className="mendy" key={message.id}>
                        <span className="avatar" aria-hidden="true">
                          <Glyph id="mark" width={20} height={21} />
                        </span>
                        <div className="answer glass">
                          {message.pending ? (
                            <div className="body">
                              <span className="thinking">
                                <span className="dots"><i /><i /><i /></span>
                                Mendy is thinking…
                              </span>
                            </div>
                          ) : (
                            <div className="body" dangerouslySetInnerHTML={{ __html: message.html }} />
                          )}
                          {message.actions ? (
                            <div className="answer-actions">
                              <a className="ghost" href="#care" onClick={(event) => { event.preventDefault(); go("care"); }}>Find care near me</a>
                              <a className="ghost" href="#doctor" onClick={(event) => { event.preventDefault(); go("doctor"); }}>Talk to a doctor · ₦2,000</a>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  className="composer glass"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!busy) void ask(question);
                  }}
                >
                  <label htmlFor="q" className="sr-only">Your question for Mendy</label>
                  <textarea
                    id="q"
                    ref={questionRef}
                    rows={3}
                    value={question}
                    placeholder={chatting ? "Message Mendy…" : "Tell Mendy what is on your mind, in any language…"}
                    onChange={(event) => {
                      setQuestion(event.target.value);
                      setShowRed(RED_FLAGS.test(event.target.value));
                    }}
                    onKeyDown={(event) => {
                      const touch = window.matchMedia("(pointer: coarse)").matches;
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !touch) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="alert" id="redflag" hidden={!showRed}>
                    <strong>If this is happening now, call 112 or go to the nearest hospital.</strong>
                    <span>Don&apos;t wait for an answer here.</span>
                  </div>
                  <div className="composer-foot">
                    <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                      Write in any language. Mendy replies in the same one.
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="ghost" id="stopBtn" hidden={!busy} onClick={stop}>Stop</button>
                      <button type="submit" className="btn" id="sendBtn" disabled={busy}>
                        Ask Mendy
                        <Glyph id="i-arrow" />
                      </button>
                    </div>
                  </div>
                </form>

                <div className="hero-only" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <span className="eyebrow" style={{ textAlign: "center" }}>Or start with one of these</span>
                  <div className="chips center">
                    {STARTERS.map((starter) => (
                      <button key={starter} type="button" className="chip" onClick={() => { if (!busy) void ask(starter); }}>
                        {starter}
                      </button>
                    ))}
                  </div>
                  <div className="promo glass">
                    <p>
                      <strong>Want a doctor&apos;s opinion?</strong>{" "}
                      <span className="muted">Chat with a qualified doctor from home for ₦2,000.</span>
                    </p>
                    <a className="btn" href="#doctor" onClick={(event) => { event.preventDefault(); go("doctor"); }}>
                      <Glyph id="i-steth" />
                      Talk to a doctor
                    </a>
                  </div>
                </div>

                <p className="note">
                  <Glyph id="i-shield" width={20} height={20} />
                  <span>
                    Mendy gives health information, not a diagnosis. If someone is seriously ill or injured, call 112 or go to the nearest hospital now. Something not working? Report it on{" "}
                    <a href="#doctor" onClick={(event) => { event.preventDefault(); go("doctor"); }}>0913 329 3575</a>.
                  </span>
                </p>
              </div>
            </section>

            <section id="v-care" className="view" aria-labelledby="care-h" hidden={view !== "care"}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
                <span className="eyebrow">Find care near you</span>
                <h1 className="big" id="care-h">Find a clinic, pharmacy or lab.</h1>
                <p className="lead">Choose what you need, then search near you or type your area. The map stays on this page.</p>
              </div>
              <div className="grid2">
                <form className="care-form glass" onSubmit={searchArea}>
                  <div className="fgroup">
                    <span className="lbl" id="needLbl">What do you need?</span>
                    <div className="seg" role="group" aria-labelledby="needLbl">
                      {CARE_NEEDS.map((need) => (
                        <button
                          key={need.q}
                          type="button"
                          className="chip"
                          aria-pressed={needQ === need.q}
                          onClick={() => setNeedQ(need.q)}
                        >
                          {need.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="care-row">
                    <div>
                      <label htmlFor="area" className="lbl">Area or town (optional)</label>
                      <input
                        id="area"
                        className="field"
                        type="text"
                        autoComplete="address-level2"
                        placeholder="e.g. Wuse, Abuja or Barnawa, Kaduna"
                        value={area}
                        onChange={(event) => setArea(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="row-btns">
                    <button type="button" className="btn" onClick={searchNearMe}>
                      <Glyph id="i-pin" />
                      Search near me
                    </button>
                    <button type="submit" className="ghost">Search this area</button>
                  </div>
                  <p className="toast" role="status">{careMsg}</p>
                </form>
                <div className="stack">
                  <div className="card glass" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <h2 className="mid" style={{ fontSize: 24 }}>Good to know</h2>
                    <p style={{ margin: 0 }}>These results come from Google Maps. Indura has not checked them yet. Our own list of verified providers is coming soon.</p>
                    <p className="muted" style={{ margin: 0, fontSize: 15 }}>Call before you go to confirm opening hours, prices and whether they accept your NHIA or HMO plan.</p>
                  </div>
                  <div className="alert">
                    <strong>Emergency?</strong>
                    <span>Call 112 or go straight to the nearest hospital emergency unit.</span>
                  </div>
                  <div className="card glass" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <h2 className="mid" style={{ fontSize: 22 }}>Not sure where to go?</h2>
                    <p className="muted" style={{ margin: 0, fontSize: 16 }}>Tell Mendy what is happening and it will help you choose the right kind of care.</p>
                    <a href="#ask" className="ghost" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={(event) => { event.preventDefault(); go("ask"); }}>Ask Mendy</a>
                  </div>
                </div>
              </div>
              <div className="map-box glass" ref={mapRef} hidden={!mapResult}>
                {mapResult ? (
                  <iframe
                    title={"Map of " + mapResult.label}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={"https://www.google.com/maps?q=" + encodeURIComponent(mapResult.embed) + "&output=embed"}
                  />
                ) : null}
              </div>
            </section>

            <section id="v-doctor" className="view" aria-labelledby="doc-h" hidden={view !== "doctor"}>
              <div className="grid2">
                <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
                  <span className="eyebrow">Talk to a doctor</span>
                  <h1 className="big" id="doc-h">Speak to a doctor from home.</h1>
                  <p className="lead">Tell a qualified doctor what is going on and get advice on what to do next, without the queue. If you need to be seen in person, the doctor will tell you.</p>
                  <div className="price glass"><b>₦2,000</b><span className="muted">per consultation</span></div>
                  <ol className="steps">
                    <li><span>1</span><div><strong>Tell us what&apos;s wrong</strong><br /><span className="muted">A few details so the doctor is ready for you.</span></div></li>
                    <li><span>2</span><div><strong>Pay ₦2,000</strong><br /><span className="muted">Card, bank transfer or USSD.</span></div></li>
                    <li><span>3</span><div><strong>Chat with a doctor</strong><br /><span className="muted">You&apos;re connected on WhatsApp as soon as you pay.</span></div></li>
                  </ol>
                  <div className="alert"><strong>Not for emergencies.</strong><span>If someone is seriously ill or injured, call 112 or go to the nearest hospital now.</span></div>
                </div>
                <div className="card glass doc-card" aria-live="polite">
                  <form hidden={docStep !== "form"} onSubmit={submitDoctor} noValidate>
                    <h2 className="mid" style={{ fontSize: 26 }}>Your details</h2>
                    <div className="fgroup">
                      <label htmlFor="docName" className="lbl">Full name</label>
                      <input id="docName" className="field" type="text" autoComplete="name" value={docName} onChange={(event) => setDocName(event.target.value)} />
                    </div>
                    <div className="fgroup">
                      <label htmlFor="docPhone" className="lbl">WhatsApp number</label>
                      <input id="docPhone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. 0803 000 0000" value={docPhone} onChange={(event) => setDocPhone(event.target.value)} />
                    </div>
                    <div className="fgroup">
                      <label htmlFor="docEmail" className="lbl">Email (for your receipt)</label>
                      <input id="docEmail" className="field" type="email" inputMode="email" autoComplete="email" value={docEmail} onChange={(event) => setDocEmail(event.target.value)} />
                    </div>
                    <div className="fgroup">
                      <span className="lbl" id="docForLbl">Who is the consultation for?</span>
                      <div className="chips" role="group" aria-labelledby="docForLbl">
                        {DOCTOR_FOR.map((who) => (
                          <button key={who} type="button" className="chip" aria-pressed={docFor === who} onClick={() => setDocFor(who)}>{who}</button>
                        ))}
                      </div>
                    </div>
                    <div className="fgroup">
                      <label htmlFor="docAge" className="lbl">Their age</label>
                      <input id="docAge" className="field" type="number" inputMode="numeric" min={0} max={120} style={{ maxWidth: 160 }} value={docAge} onChange={(event) => setDocAge(event.target.value)} />
                    </div>
                    <div className="fgroup">
                      <label htmlFor="docProblem" className="lbl">What&apos;s going on?</label>
                      <textarea
                        id="docProblem"
                        className="field"
                        placeholder="e.g. Headache and fever for 2 days. I have taken paracetamol."
                        value={docProblem}
                        onChange={(event) => {
                          setDocProblem(event.target.value);
                          setDocRed(RED_FLAGS.test(event.target.value));
                        }}
                      />
                    </div>
                    <div className="alert" hidden={!docRed}>
                      <strong>This could be an emergency.</strong>
                      <span>Please don&apos;t wait for an online consultation. Call 112 or go to the nearest hospital now.</span>
                    </div>
                    <label className="consent">
                      <input type="checkbox" checked={docOk} onChange={(event) => setDocOk(event.target.checked)} />
                      <span className="muted">I understand this is a remote consultation and not for emergencies, and I agree that Indura can share these details with the doctor.</span>
                    </label>
                    <p className="err" role="alert">{docErr}</p>
                    <button type="submit" className="btn" style={{ width: "100%" }}>Pay ₦2,000 and continue</button>
                    <span className="muted small" style={{ textAlign: "center" }}>Secure payment by Flutterwave.</span>
                  </form>

                  <div ref={payingRef} className="center-col" hidden={docStep !== "paying"}>
                    <div className="spin" aria-hidden="true" />
                    <h2 className="mid" style={{ fontSize: 24 }}>{payTitle}</h2>
                    <p className="muted" style={{ margin: 0 }} hidden={payOffline}>{payText}</p>
                    <div className="center-col" hidden={!payOffline}>
                      <p style={{ margin: 0 }}>Online payment is not available right now. Please try again later.</p>
                    </div>
                    <button type="button" className="ghost" onClick={cancelPayment}>Go back</button>
                  </div>

                  <div className="center-col" hidden={docStep !== "done"}>
                    <span className="bigtick"><Glyph id="i-check" width={32} height={32} /></span>
                    <h2 className="mid" style={{ fontSize: 28 }}>You&apos;re connected.</h2>
                    <p className="muted" style={{ margin: 0 }}>Payment received. Tap below to start chatting with a doctor now. Your details are already in the message.</p>
                    <span className="refbox">Reference <strong>{docRefCode}</strong></span>
                    <a className="btn" href={docHref} target="_blank" rel="noopener" style={{ width: "100%" }}>
                      <Glyph id="i-wa" />
                      Chat with a doctor on WhatsApp
                    </a>
                    <p className="small muted" style={{ margin: 0 }}>Keep your reference. If something goes wrong with the payment or the chat, report it on 0913 329 3575.</p>
                    <button type="button" className="ghost" onClick={newConsultation}>Start a new consultation</button>
                  </div>
                </div>
              </div>

              <div className="card glass" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>Something not working? Indura care line</span>
                <span className="phone" ref={phoneRef}>{CARE_LINE_DISPLAY}</span>
                <p className="muted" style={{ margin: 0 }}>Report a problem with the site, a payment or your doctor chat. This line is not for medical advice: for that, talk to a doctor above.</p>
                <div className="row-btns">
                  <a className="btn" href="tel:+2349133293575"><Glyph id="i-phone" />Call</a>
                  <a className="btn" href="https://wa.me/2349133293575?text=Hello%20Indura%2C%20I%20want%20to%20report%20a%20problem%20on%20Mendy%3A%20" target="_blank" rel="noopener">
                    <Glyph id="i-wa" />
                    WhatsApp
                  </a>
                  <button type="button" className="ghost" onClick={() => void copyPhone()}>Copy number</button>
                </div>
                <p className="toast" role="status">{copyMsg}</p>
              </div>
            </section>

            <section id="v-wallet" className="view" aria-labelledby="wallet-h" hidden={view !== "wallet"}>
              <div className="wallet-top">
                <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 8 }}>
                  <span className="pill-gold">Coming soon</span>
                  <h1 className="big" id="wallet-h">A wallet made for your health.</h1>
                  <p className="lead">The Indura health wallet is on its way. Join the waitlist and we&apos;ll tell you when it opens near you.</p>
                  <div className="ticks">
                    {[
                      "Save for care, a little at a time.",
                      "Let family at home and abroad help.",
                      "Pay verified clinics, pharmacies and labs.",
                      "Money in the wallet can only be spent on healthcare.",
                      "Your Indura ID and Mendy, your health assistant, in one app.",
                    ].map((item) => (
                      <div className="tick" key={item}>
                        <span><Glyph id="i-check" /></span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="stores" aria-label="App downloads, coming soon">
                    <span className="store">
                      <svg width="22" height="22" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                      <span><small>Coming soon on</small><b>Google Play</b></span>
                    </span>
                    <span className="store">
                      <svg width="22" height="22" aria-hidden="true" viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                      <span><small>Coming soon on</small><b>App Store</b></span>
                    </span>
                  </div>
                </div>
                <figure className="device-wrap">
                  <div className="device">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/indura-app.webp" width={560} height={1096} alt="The Indura app home screen: health wallet balance with Top Up and Transfer, a reminder to save, Find Provider, AI Assistant and the Indura ID card." />
                  </div>
                  <figcaption className="muted small">The Indura app</figcaption>
                </figure>
              </div>
              <div className="wl-wrap">
                <form className="card glass" noValidate onSubmit={(event) => event.preventDefault()}>
                  <h2 className="mid" style={{ fontSize: 26 }}>Join the waitlist</h2>
                  <div className="fgroup">
                    <label htmlFor="wlName" className="lbl">Your name</label>
                    <input id="wlName" ref={nameRef} className="field" type="text" autoComplete="name" value={wlName} onChange={(event) => setWlName(event.target.value)} />
                  </div>
                  <div className="fgroup">
                    <label htmlFor="wlState" className="lbl">State</label>
                    <input id="wlState" className="field" type="text" placeholder="e.g. FCT, Kaduna, Lagos" value={wlState} onChange={(event) => setWlState(event.target.value)} />
                  </div>
                  <div className="fgroup">
                    <span className="lbl" id="useLbl">What would you use it for?</span>
                    <div className="chips" role="group" aria-labelledby="useLbl">
                      {WALLET_USES.map((use) => (
                        <button
                          key={use}
                          type="button"
                          className="chip"
                          aria-pressed={wlUses.includes(use)}
                          onClick={() => setWlUses((current) => current.includes(use) ? current.filter((item) => item !== use) : [...current, use])}
                        >
                          {use}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="consent">
                    <input type="checkbox" checked={wlOk} onChange={(event) => setWlOk(event.target.checked)} />
                    <span className="muted">I agree that Indura can contact me about the wallet launch.</span>
                  </label>
                  <p className="err" role="alert">{wlErr}</p>
                  <a className="btn" href={walletHref} target="_blank" rel="noopener" onClick={joinWaitlist}>
                    <Glyph id="i-wa" />
                    Join on WhatsApp
                  </a>
                  <span className="muted" style={{ fontSize: 14 }}>This opens WhatsApp with your details ready. Tap send to join.</span>
                </form>
              </div>
            </section>

            <footer>
              <span style={{ maxWidth: 620 }}>Mendy is not a doctor and does not diagnose. Always follow the advice of a qualified health worker.</span>
              <span>Mendy by Indura Health · askmendy.ai · Report a problem: 0913 329 3575</span>
            </footer>
          </main>
        </div>
        <MainNav view={view} onGo={go} className="nav-bottom" />
      </div>
    </>
  );
}

function MainNav({
  view,
  onGo,
  className,
}: {
  view: ViewName;
  onGo: (name: ViewName) => void;
  className: string;
}) {
  return (
    <nav className={"nav " + className} aria-label="Main">
      <a href="#ask" aria-current={view === "ask" ? "page" : undefined} onClick={(event) => { event.preventDefault(); onGo("ask"); }}>
        <Glyph id="i-chat" />
        Ask Mendy
      </a>
      <a href="#care" aria-current={view === "care" ? "page" : undefined} onClick={(event) => { event.preventDefault(); onGo("care"); }}>
        <Glyph id="i-pin" />
        Find care
      </a>
      {/* <a href="#doctor" onClick={(event) => { event.preventDefault(); onGo("doctor"); }}><Glyph id="i-steth" />Doctor</a> */}
      <a href="#wallet" aria-current={view === "wallet" ? "page" : undefined} onClick={(event) => { event.preventDefault(); onGo("wallet"); }}>
        <Glyph id="i-wallet" />
        Wallet
      </a>
    </nav>
  );
}
