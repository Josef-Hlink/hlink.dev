// hlink.dev contact endpoint — zero-dependency Node.
//
// Serves POST /api/contact on loopback. The browser (josh's `mail` command)
// posts { email, subject, message, website }; we validate, drop honeypot hits,
// rate-limit per IP, and relay the message to mailbox.org over SMTP (implicit
// TLS, port 465) by speaking the protocol directly — no npm deps, so the Nix
// packaging stays a one-liner.
//
// The notification is sent From: contact@hlink.dev (a domain mailbox.org already
// SPF/DKIM-signs). The visitor's address goes in the body, not Reply-To: a domain
// From paired with a freemail Reply-To trips SpamAssassin's FREEMAIL_FORGED_REPLYTO
// (+2), enough to fold the notification into spam. If AUTOREPLY_FROM is set, the
// visitor also gets a short "thanks, I'll get back to you" note from that address
// (best-effort - a failure there never fails the request).
//
// Config is env-only. The SMTP password is read from the file named by
// SMTP_PASS_FILE (systemd LoadCredential) so the secret never sits in the
// environment or the Nix store; SMTP_PASS is a plaintext fallback for local dev.

import http from "node:http";
import tls from "node:tls";
import fs from "node:fs";

const PORT = Number(process.env.PORT) || 8788;
const HOST = "127.0.0.1";
const SMTP_HOST = (process.env.SMTP_HOST || "smtp.mailbox.org").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const MAIL_FROM = (process.env.MAIL_FROM || "contact@hlink.dev").trim();
const MAIL_TO = (process.env.MAIL_TO || SMTP_USER).trim();
// When set, the visitor also gets a "thanks, I'll get back to you" auto-reply
// from this address. Empty disables it. Must be an identity the account owns.
const AUTOREPLY_FROM = (process.env.AUTOREPLY_FROM || "").trim();

const SMTP_PASS = (() => {
  const f = process.env.SMTP_PASS_FILE;
  if (f) return fs.readFileSync(f, "utf8").trim();
  return process.env.SMTP_PASS || "";
})();

// Required to send. If any are missing we refuse loudly rather than emitting a
// cryptic SMTP 535 mid-conversation.
const missingConfig = Object.entries({ SMTP_USER, SMTP_PASS, MAIL_TO })
  .filter(([, v]) => !v)
  .map(([k]) => k);

const BODY_LIMIT = 16 * 1024; // bytes
const MAX_EMAIL = 200;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const RL_MAX = 5; // requests
const RL_WINDOW = 10 * 60 * 1000; // per 10 minutes per IP

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- per-IP rate limit (in-process; Cloudflare's rule is the real throttle) ---
const hits = new Map(); // ip -> number[] timestamps
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // crude unbounded-growth guard
  return recent.length > RL_MAX;
}

// --- header/body encoding helpers (RFC 2047 / MIME) ---
const oneLine = (s) => s.replace(/[\r\n]+/g, " ").trim();

// Encode an arbitrary UTF-8 string as one or more RFC 2047 "B" encoded-words,
// folded so each stays within the 75-char limit.
function encodedWord(s) {
  const bytes = Buffer.from(s, "utf8");
  const parts = [];
  for (let i = 0; i < bytes.length; i += 45) {
    parts.push("=?UTF-8?B?" + bytes.subarray(i, i + 45).toString("base64") + "?=");
  }
  return parts.length ? parts.join("\r\n ") : "=?UTF-8?B??=";
}

const isAscii = (s) => /^[\x00-\x7F]*$/.test(s);

// SMTP dot-stuffing: a line that is just "." would otherwise end DATA early.
const dotStuff = (s) => s.replace(/^\./gm, "..");

// keep any single line under the SMTP 998-char limit
function wrapLong(line, max = 990) {
  if (line.length <= max) return line;
  const out = [];
  for (let i = 0; i < line.length; i += max) out.push(line.slice(i, i + max));
  return out.join("\r\n");
}

// Build a plain-text RFC 5322 message. Plain text is sent as 7bit/8bit — base64
// or quoted-printable encoding of plain text is a known spam signal — after
// normalising to CRLF, wrapping long lines, and SMTP dot-stuffing.
function buildMime({ fromName, from, to, replyTo, subject, bodyRaw }) {
  const subj = oneLine(subject);
  const body = dotStuff(
    bodyRaw
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => wrapLong(l))
      .join("\r\n"),
  );

  const headers = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    ...(replyTo ? [`Reply-To: ${oneLine(replyTo)}`] : []),
    // only MIME encoded-word the subject when it actually has non-ASCII chars
    `Subject: ${isAscii(subj) ? subj : encodedWord(subj)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@hlink.dev>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Transfer-Encoding: ${isAscii(bodyRaw) ? "7bit" : "8bit"}`,
  ].join("\r\n");

  return headers + "\r\n\r\n" + body;
}

// The notification to Josef. The visitor's address is in the body (see above re:
// FREEMAIL_FORGED_REPLYTO) — reply by copying it.
const notificationMime = ({ email, subject, message }) =>
  buildMime({
    fromName: "hlink.dev contact",
    from: MAIL_FROM,
    to: MAIL_TO,
    subject: "[hlink] " + subject,
    bodyRaw: [
      "New message via the hlink.dev contact form.",
      "",
      `Reply to ${email} to respond.`,
      "",
      `Subject: ${subject}`,
      "",
      message,
    ].join("\n"),
  });

// The "thanks, I'll get back to you" auto-reply to the visitor.
const autoReplyMime = ({ email, subject }) =>
  buildMime({
    fromName: "Josef Hamelink",
    from: AUTOREPLY_FROM,
    to: email,
    subject: "thanks for reaching out",
    bodyRaw: [
      "Hi,",
      "",
      "Thanks for reaching out through hlink.dev.",
      `I got your message${subject !== "(no subject)" ? ` ("${subject}")` : ""} and I'll get back to you soon.`,
      "",
      "- Josef",
    ].join("\n"),
  });

// --- minimal SMTP-over-TLS client ---
function smtpSend({ from, to, data }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST });
    socket.setTimeout(15000);
    socket.on("timeout", () => socket.destroy(new Error("SMTP timeout")));
    socket.on("error", reject);

    let buf = "";
    let waiter = null; // { codes, resolve, reject }
    const drain = () => {
      if (!waiter) return;
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length; i++) {
        const m = /^(\d{3}) /.exec(lines[i]); // final line of a (possibly multiline) reply
        if (!m) continue;
        const w = waiter;
        waiter = null;
        buf = lines.slice(i + 1).join("\r\n");
        const code = Number(m[1]);
        if (w.codes.includes(code)) w.resolve(code);
        else w.reject(new Error(`SMTP: expected ${w.codes}, got "${lines[i]}"`));
        return;
      }
    };
    socket.on("data", (d) => {
      buf += d.toString("utf8");
      drain();
    });

    const expect = (...codes) =>
      new Promise((res, rej) => {
        waiter = { codes, resolve: res, reject: rej };
        drain();
      });
    const send = (line) => socket.write(line + "\r\n");

    (async () => {
      await expect(220);
      send("EHLO hlink.dev");
      await expect(250);
      // AUTH PLAIN: one round-trip, base64 of "\0<user>\0<pass>".
      send("AUTH PLAIN " + Buffer.from(`\0${SMTP_USER}\0${SMTP_PASS}`, "utf8").toString("base64"));
      await expect(235);
      send(`MAIL FROM:<${from}>`);
      await expect(250);
      send(`RCPT TO:<${to}>`);
      await expect(250, 251);
      send("DATA");
      await expect(354);
      socket.write(data + "\r\n.\r\n");
      await expect(250);
      send("QUIT");
      socket.end();
      resolve();
    })().catch((e) => {
      socket.destroy();
      reject(e);
    });
  });
}

// --- HTTP ---
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on("data", (c) => {
      if (aborted) return; // keep draining quietly so the handler can write 413
      size += c.length;
      if (size > BODY_LIMIT) {
        aborted = true;
        const err = new Error("body too large");
        err.code = "BODY_TOO_LARGE";
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => { if (!aborted) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/contact") {
    return json(res, 404, { ok: false, error: "not found" });
  }

  if (missingConfig.length) {
    console.error(`[contact] refusing to send; missing config: ${missingConfig.join(", ")}`);
    return json(res, 503, { ok: false, error: "mailer not configured" });
  }

  const ip = (req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "").toString();
  if (rateLimited(ip)) return json(res, 429, { ok: false, error: "too many requests" });

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (e) {
    if (e?.code === "BODY_TOO_LARGE") {
      json(res, 413, { ok: false, error: "body too large" });
      req.destroy();
      return;
    }
    return json(res, 400, { ok: false, error: "invalid request" });
  }

  const email = String(payload?.email ?? "").trim();
  const subject = String(payload?.subject ?? "").trim() || "(no subject)";
  const message = String(payload?.message ?? "").trim();
  const honeypot = String(payload?.website ?? "").trim();

  // honeypot: a real visitor never fills this; pretend success and drop.
  if (honeypot) return json(res, 200, { ok: true });

  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) {
    return json(res, 400, { ok: false, error: "invalid email" });
  }
  if (subject.length > MAX_SUBJECT) return json(res, 400, { ok: false, error: "subject too long" });
  if (!message) return json(res, 400, { ok: false, error: "empty message" });
  if (message.length > MAX_MESSAGE) return json(res, 400, { ok: false, error: "message too long" });

  try {
    await smtpSend({ from: MAIL_FROM, to: MAIL_TO, data: notificationMime({ email, subject, message }) });
    console.log(`[contact] sent (reply-to ${email})`);
  } catch (e) {
    console.error(`[contact] send failed: ${e.message}`);
    return json(res, 502, { ok: false, error: "could not send" });
  }

  // Best-effort auto-reply to the visitor; never fail the request over it —
  // Josef already has the message.
  if (AUTOREPLY_FROM) {
    try {
      await smtpSend({ from: AUTOREPLY_FROM, to: email, data: autoReplyMime({ email, subject }) });
      console.log(`[contact] auto-reply sent to ${email}`);
    } catch (e) {
      console.error(`[contact] auto-reply failed: ${e.message}`);
    }
  }

  return json(res, 200, { ok: true });
});

server.listen(PORT, HOST, () => {
  console.log(`[contact] listening on http://${HOST}:${PORT}`);
  console.log(
    `[contact] config: host=${SMTP_HOST}:${SMTP_PORT} user=${SMTP_USER || "(unset)"} ` +
      `from=${MAIL_FROM} to=${MAIL_TO || "(unset)"} pass=${SMTP_PASS ? "set" : "(unset)"} ` +
      `autoreply=${AUTOREPLY_FROM || "(off)"}`,
  );
  if (missingConfig.length) {
    console.warn(`[contact] WARNING: missing config: ${missingConfig.join(", ")} — sends will fail`);
  }
});
