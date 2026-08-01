/**
 * Phase 6 — email connections: transport layer unit tests.
 *
 * The transport is exercised against a REAL SMTP sink over a real socket —
 * handshake, AUTH and DATA streaming all happen through nodemailer exactly
 * as they would against SES/Gmail; only the listener is local.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { startSmtpSink, SmtpSink } from "./helpers/smtp-sink";
import { formatFrom, htmlToText, sendSmtp, verifySmtp } from "../lib/email/smtp";

test("smtp: verify completes the handshake against a live server", async () => {
  const { sink, port } = await startSmtpSink();
  try {
    await verifySmtp({ host: "127.0.0.1", port, secure: false, username: "u", password: "p" });
    assert.ok(true, "handshake succeeded");
  } finally {
    await sink.stop();
  }
});

test("smtp: verify fails honestly with bad credentials", async () => {
  const sink = new SmtpSink();
  sink.failAuth = true;
  const port = await sink.start();
  try {
    await assert.rejects(
      verifySmtp({ host: "127.0.0.1", port, secure: false, username: "u", password: "wrong" }),
      /credentials invalid|535/i
    );
  } finally {
    await sink.stop();
  }
});

test("smtp: verify fails fast against an unreachable host (no hanging tick)", async () => {
  await assert.rejects(
    verifySmtp({ host: "127.0.0.1", port: 1, secure: false }),
    /ECONNREFUSED|timeout/i
  );
});

test("smtp: sendSmtp streams subject/body and reports message id", async () => {
  const { sink, port } = await startSmtpSink();
  try {
    const result = await sendSmtp(
      { host: "127.0.0.1", port, secure: false, username: "sales@acme.test", password: "secret" },
      {
        from: "Ada <sales@acme.test>",
        to: "prospect@bigco.test",
        subject: "Quick question about dispatch",
        html: "<p>Hello <strong>Grace</strong>,</p><p>Following up on our call.</p>",
        text: "Hello Grace,\n\nFollowing up on our call.",
      }
    );
    assert.ok(result.messageId, "message id present");
    assert.deepEqual(result.rejected, []);
    assert.equal(sink.messages.length, 1);
    const msg = sink.messages[0];
    assert.match(msg.from, /sales@acme\.test/);
    assert.equal(msg.to.length, 1);
    assert.match(msg.to[0], /prospect@bigco\.test/);
    assert.equal(msg.authUser, "sales@acme.test");
    assert.match(msg.data, /Subject: Quick question about dispatch/);
    assert.match(msg.data, /Following up on our call/);
  } finally {
    await sink.stop();
  }
});

test("smtp: provider rejection surfaces in the rejected list", async () => {
  const sink = new SmtpSink();
  sink.rejectRecipient = true;
  const port = await sink.start();
  try {
    await assert.rejects(
      sendSmtp(
        { host: "127.0.0.1", port, secure: false },
        { from: "a@b.test", to: "no@such.test", subject: "x", html: "<p>x</p>", text: "x" }
      ),
      /rejected|550/i
    );
  } finally {
    await sink.stop();
  }
});

test("smtp: htmlToText strips markup into readable plain text", () => {
  const text = htmlToText(
    `<div><style>.x{color:red}</style><p>Hello <b>Ada</b>,</p><p>Next Tuesday works.<br/>— Grace</p></div>`
  );
  assert.match(text, /Hello Ada/);
  assert.match(text, /Next Tuesday works\./);
  assert.match(text, /— Grace/);
  assert.doesNotMatch(text, /color:red/);
  assert.doesNotMatch(text, /<\/?[a-z]+>/i);
});

test("smtp: formatFrom renders RFC-safe From headers and strips injection", () => {
  assert.equal(formatFrom(null, "a@b.test"), "a@b.test");
  assert.equal(formatFrom("Ada Lovelace", "a@b.test"), "Ada Lovelace <a@b.test>");
  assert.equal(formatFrom("Lovelace, Ada", "a@b.test"), '"Lovelace, Ada" <a@b.test>');
  // Header injection is neutralized at the CRLF level — the header can never
  // split into a second line (quoted-string content itself stays intact).
  const hostile = formatFrom("Ada\r\nBCC: all@evil.test", "a@b.test");
  assert.doesNotMatch(hostile, /[\r\n]/);
  assert.equal(hostile.split(/\r?\n/).length, 1);
});
