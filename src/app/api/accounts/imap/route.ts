import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertAccount } from "@/lib/accounts-store";
import { verifyImapCredentials } from "@/providers/imap-provider";
import { IMAP_SERVICES, isSupportedImapService } from "@/lib/imap-services";

/**
 * POST /api/accounts/imap
 *
 * Service-driven IMAP/SMTP setup. The client picks one of the **supported**
 * services (Yahoo / AOL) and sends only the user-facing fields. The server
 * resolves the hosts from `IMAP_SERVICES` — custom hosts are rejected.
 *
 * Body:
 *   { service: "yahoo" | "aol", email: string, password: string, displayName?: string }
 */

const Body = z.object({
  service: z.string().refine(isSupportedImapService, {
    message: "Unsupported IMAP service. Only yahoo and aol are allowed.",
  }),
  email: z.string().email(),
  password: z.string().min(1),
  displayName: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const { service, email, password, displayName } = Body.parse(await req.json());
    const cfg = IMAP_SERVICES[service as keyof typeof IMAP_SERVICES];

    // Friendly check: email domain should match the chosen service. We don't
    // hard-fail here (e.g. Yahoo accepts ymail.com), but mismatch is usually
    // user error worth surfacing.
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && !cfg.emailDomains.includes(domain)) {
      return NextResponse.json(
        {
          error: `${email} doesn't look like a ${cfg.label} address. ${cfg.label} accepts: ${cfg.emailDomains.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const creds = {
      imapHost: cfg.imapHost,
      imapPort: cfg.imapPort,
      smtpHost: cfg.smtpHost,
      smtpPort: cfg.smtpPort,
      user: email,
      pass: password,
      secure: cfg.secure,
    };

    try {
      await verifyImapCredentials(creds);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      // Common: bad app password → IMAP returns AUTHENTICATIONFAILED
      const friendly = /authent/i.test(msg)
        ? `${cfg.label} rejected the password. Make sure you used an app password (${cfg.appPasswordUrl}), not your normal sign-in password.`
        : msg;
      return NextResponse.json({ error: friendly }, { status: 400 });
    }

    const record = upsertAccount({
      provider: "imap",
      email,
      displayName: displayName ?? cfg.label,
      credentials: { kind: "imap", ...creds },
    });

    return NextResponse.json({
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      color: record.color,
      provider: record.provider,
      service,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors.map((e) => e.message).join("; ") }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
