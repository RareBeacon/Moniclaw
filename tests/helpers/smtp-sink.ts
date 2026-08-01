import * as net from "node:net";

/**
 * Minimal real SMTP sink for tests/E2E — speaks enough RFC-5321 over TCP for
 * nodemailer: EHLO multiline caps, AUTH LOGIN + PLAIN, MAIL/RCPT/DATA capture,
 * RSET/NOOP/QUIT. No TLS/STARTTLS advertisement (loopback plaintext only).
 *
 * This is NOT a mock inside the app — the production code path opens a real
 * socket, does a real handshake and streams the message; the sink simply
 * listens instead of SES/Gmail. Delivery assertions are byte-for-byte real.
 */

export interface CapturedMessage {
  from: string;
  to: string[];
  data: string;
  authUser: string | null;
}

export class SmtpSink {
  private server: net.Server | null = null;
  private buffer = "";
  private state: "greeted" | "auth-user" | "auth-pass" | "idle" | "data" = "greeted";
  private current: { from: string; to: string[]; data: string; authUser: string | null } | null = null;

  readonly messages: CapturedMessage[] = [];
  port = 0;
  /** Behavior toggles for failure-path tests. */
  failAuth = false;
  rejectRecipient = false;
  refuseMail = false;

  async start(): Promise<number> {
    this.server = net.createServer((socket) => this.handle(socket));
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    this.port = (this.server!.address() as net.AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  private handle(socket: net.Socket) {
    socket.setEncoding("utf8");
    socket.write("220 sink.moniclaw.test ESMTP ready\r\n");
    let dataMode = false;
    let dataLines: string[] = [];

    socket.on("data", (chunk) => {
      this.buffer += chunk;
      let idx: number;
      while ((idx = this.buffer.indexOf("\r\n")) !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        if (dataMode) {
          if (line === ".") {
            // Dot-stuffed lines end the DATA block.
            dataMode = false;
            this.current!.data = dataLines.join("\r\n");
            this.messages.push({ ...this.current! });
            this.current = null;
            socket.write("250 2.0.0 Ok: queued as sink-1\r\n");
            continue;
          }
          dataLines.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }

        const [verb, ...rest] = line.split(" ");
        const arg = rest.join(" ");
        switch (verb.toUpperCase()) {
          case "EHLO":
          case "HELO": {
            this.state = "idle";
            socket.write(
              "250-sink.moniclaw.test greets you\r\n" +
                "250-SIZE 10485760\r\n" +
                "250-8BITMIME\r\n" +
                "250-SMTPUTF8\r\n" +
                "250 AUTH LOGIN PLAIN\r\n"
            );
            break;
          }
          case "AUTH": {
            const mech = arg.split(" ")[0]?.toUpperCase();
            if (this.failAuth) {
              socket.write("535 5.7.8 Authentication credentials invalid\r\n");
              break;
            }
            if (mech === "PLAIN") {
              const initial = arg.split(" ")[1];
              const decoded = initial ? Buffer.from(initial, "base64").toString("utf8") : "";
              this.current = this.current ?? { from: "", to: [], data: "", authUser: null };
              this.current.authUser = decoded.split("\0")[1] ?? decoded;
              socket.write("235 2.7.0 Authentication successful\r\n");
            } else {
              this.state = "auth-user";
              socket.write("334 VXNlcm5hbWU6\r\n");
            }
            break;
          }
          case "RSET":
            this.current = null;
            this.state = this.state === "greeted" ? "greeted" : "idle";
            socket.write("250 2.0.0 Ok\r\n");
            break;
          case "NOOP":
            socket.write("250 2.0.0 Ok\r\n");
            break;
          case "MAIL": {
            if (this.refuseMail) {
              socket.write("530 5.7.1 Sender not allowed\r\n");
              break;
            }
            this.current = { from: arg.replace(/^FROM:/i, "").trim(), to: [], data: "", authUser: this.current?.authUser ?? null };
            socket.write("250 2.1.0 Ok\r\n");
            break;
          }
          case "RCPT": {
            if (!this.current) {
              socket.write("503 5.5.1 Need MAIL first\r\n");
              break;
            }
            if (this.rejectRecipient) {
              socket.write("550 5.1.1 Recipient rejected by policy\r\n");
              break;
            }
            this.current.to.push(arg.replace(/^TO:/i, "").trim());
            socket.write("250 2.1.5 Ok\r\n");
            break;
          }
          case "DATA":
            dataMode = true;
            dataLines = [];
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
            break;
          case "QUIT":
            socket.write("221 2.0.0 Bye\r\n");
            socket.end();
            break;
          default: {
            // AUTH LOGIN two-step lines (bare base64).
            if (this.state === "auth-user") {
              this.current = this.current ?? { from: "", to: [], data: "", authUser: null };
              this.current.authUser = Buffer.from(line, "base64").toString("utf8");
              this.state = "auth-pass";
              socket.write("334 UGFzc3dvcmQ6\r\n");
            } else if (this.state === "auth-pass") {
              this.state = "idle";
              socket.write(this.failAuth ? "535 5.7.8 Bad credentials\r\n" : "235 2.7.0 Authentication successful\r\n");
            } else {
              socket.write("502 5.5.2 Command not recognized\r\n");
            }
          }
        }
      }
    });
    socket.on("error", () => {});
  }
}

/** Start a sink scoped to one test; returns sink + cleanup. */
export async function startSmtpSink(): Promise<{ sink: SmtpSink; port: number }> {
  const sink = new SmtpSink();
  const port = await sink.start();
  return { sink, port };
}
