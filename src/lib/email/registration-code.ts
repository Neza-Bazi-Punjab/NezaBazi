// The confirmation-code email a rider receives once their registration is in.
//
// The code is the rider's ticket into the brackets: they bring it to check-in
// the day before the event, an administrator looks it up, and only riders who
// check in are drawn into a bracket. That consequence is stated plainly in the
// email because a rider who ignores it loses their place.
//
// The markup deliberately mirrors the Supabase Auth email templates (confirm
// signup, password reset) so the whole sequence reads as one system: the same
// table-based shell, Georgia headings, bronze rule under the wordmark, and
// tagline footer. Keep the two in step when either changes.
import "server-only";

import { site } from "@/lib/site";

export type RegistrationCodeEmail = {
  fullName: string;
  confirmationCode: string;
  registrationType: "solo" | "team";
  teamName?: string | null;
  /* Rider names only. Their teammates' phone numbers and email addresses are
     deliberately left out: the team leader entered those, and the riders
     themselves never agreed to have their contact details forwarded on. */
  teammateNames?: string[];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Shared with the Auth templates.
const SERIF = "Georgia, 'Times New Roman', serif";
const BODY_TEXT =
  "margin:0 0 16px; color:#5a3517; font-size:16px; line-height:1.65;";

export const buildRegistrationCodeEmail = ({
  fullName,
  confirmationCode,
  registrationType,
  teamName,
  teammateNames = [],
}: RegistrationCodeEmail) => {
  const isTeamEntry = registrationType === "team";
  const entry =
    isTeamEntry && teamName ? `your place on ${teamName}` : "your solo rider entry";

  const subject = `Your check-in code for ${site.title}: ${confirmationCode}`;

  // A team rider was entered by their leader and may not have an account here,
  // so the email doubles as their way in: signing in with this address links
  // them to the entry and lets them correct their own details.
  const accountLines = isTeamEntry
    ? [
        "Need to check your details, change them, or upload your headshot?",
        `Sign in at ${site.url}/login with this email address, or create an account with it if you do not have one yet. Either way your entry links up automatically.`,
        "",
        `Not expecting this email? Someone may have entered your address by mistake — let us know at ${site.email}.`,
        "",
      ]
    : [];

  const rosterLines =
    isTeamEntry && teammateNames.length > 0
      ? [`Team: ${teamName}`, `Riders: ${teammateNames.join(", ")}`, ""]
      : [];

  const text = [
    `${fullName}, your registration is confirmed.`,
    "",
    `Confirmation code: ${confirmationCode}`,
    "",
    `This code confirms ${entry} at the ${site.title}.`,
    "",
    ...rosterLines,
    `Check-in is on ${site.checkInDate}, the day before the event, at ${site.venue}.`,
    "Bring this code with you. An official will look it up and confirm you have arrived.",
    "",
    "Riders who do not check in are not entered into the brackets.",
    ...(isTeamEntry
      ? ["All four riders must check in for the team to enter the brackets."]
      : []),
    "",
    ...accountLines,
    `Event day: ${site.eventDate} at ${site.venue}.`,
    `Questions: ${site.email}`,
    site.url,
  ].join("\n");

  const rosterBlock =
    isTeamEntry && teammateNames.length > 0
      ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 30px;">
                <tr>
                  <td style="padding:18px 20px; background-color:#f7efe4; border-radius:7px;">
                    <p style="margin:0 0 7px; color:#b45817; font-size:11px; font-weight:bold; letter-spacing:2.5px; text-transform:uppercase;">
                      Your Team
                    </p>
                    <p style="margin:0 0 7px; color:#6e300a; font-family:${SERIF}; font-size:19px; font-weight:bold;">
                      ${escapeHtml(teamName ?? "")}
                    </p>
                    <p style="margin:0; color:#5a3517; font-size:15px; line-height:1.6;">
                      ${teammateNames.map((name) => escapeHtml(name)).join(" &middot; ")}
                    </p>
                  </td>
                </tr>
              </table>`
      : "";

  const accountBlock = isTeamEntry
    ? `
              <p style="margin:0 0 16px; color:#5a3517; font-size:16px; line-height:1.65;">
                <strong>Need to check your details, change them, or upload your
                headshot?</strong> Sign in with this email address, or create an
                account with it if you do not have one yet. Either way your entry
                links up automatically.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 30px;">
                <tr>
                  <td align="center" style="background-color:#b45817; border-radius:7px;">
                    <a href="${escapeHtml(site.url)}/login" style="display:inline-block; padding:15px 23px; color:#fdf8ef; font-size:13px; font-weight:bold; letter-spacing:1.5px; text-decoration:none; text-transform:uppercase;">
                      Sign In To My Entry
                    </a>
                  </td>
                </tr>
              </table>`
    : "";

  const misdeliveryNote = isTeamEntry
    ? `
              <p style="margin:0; color:#7b5b40; font-size:14px; line-height:1.6;">
                Not expecting this email? Someone may have entered your address by
                mistake &mdash; reply and we will remove it.
              </p>`
    : `
              <p style="margin:0; color:#7b5b40; font-size:14px; line-height:1.6;">
                Keep this code somewhere you can find it on the day. You can always
                see it again on your account page.
              </p>`;

  const html = `
<div style="margin:0; padding:32px 16px; background-color:#f7efe4; font-family:Arial, Helvetica, sans-serif; color:#2e1d0e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; background-color:#fdf8ef; border:1px solid #e4c8a8; border-radius:10px; overflow:hidden;">
          <tr>
            <td style="padding:34px 36px 22px; text-align:center; border-bottom:1px solid #e4c8a8;">
              <p style="margin:0 0 10px; color:#b45817; font-size:12px; font-weight:bold; letter-spacing:3px; text-transform:uppercase;">
                Neza Bazi Punjab
              </p>
              <h1 style="margin:0; color:#6e300a; font-family:${SERIF}; font-size:31px; font-weight:bold; line-height:1.2;">
                Championship 2026
              </h1>
              <div style="width:76px; height:3px; margin:20px auto 0; background-color:#b45817;"></div>
            </td>
          </tr>

          <tr>
            <td style="padding:38px 36px 34px;">
              <h2 style="margin:0 0 18px; color:#6e300a; font-family:${SERIF}; font-size:27px; line-height:1.25;">
                You are in. Here is your check-in code.
              </h2>

              <p style="${BODY_TEXT}">
                ${escapeHtml(fullName)}, your registration is confirmed &mdash; this
                code holds ${escapeHtml(entry)}.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 30px;">
                <tr>
                  <td align="center" style="padding:22px 18px; background-color:#f0e2cd; border:2px dashed #b45817; border-radius:7px;">
                    <p style="margin:0 0 9px; color:#b45817; font-size:11px; font-weight:bold; letter-spacing:2.5px; text-transform:uppercase;">
                      Your Check-in Code
                    </p>
                    <p style="margin:0; color:#6e300a; font-family:'Courier New', Courier, monospace; font-size:30px; font-weight:bold; letter-spacing:4px;">
                      ${escapeHtml(confirmationCode)}
                    </p>
                  </td>
                </tr>
              </table>
${rosterBlock}
              <p style="${BODY_TEXT}">
                <strong>Check-in is on ${escapeHtml(site.checkInDate)}</strong>, the
                day before the event, at ${escapeHtml(site.venue)}. Bring this code
                with you &mdash; an official will look it up and confirm you have
                arrived.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 30px;">
                <tr>
                  <td style="padding:16px 20px; background-color:#f7efe4; border-left:3px solid #b45817; border-radius:0 7px 7px 0;">
                    <p style="margin:0; color:#6e300a; font-size:15px; font-weight:bold; line-height:1.6;">
                      Riders who do not check in are not entered into the brackets.${
                        isTeamEntry
                          ? " All four riders must check in for the team to compete."
                          : ""
                      }
                    </p>
                  </td>
                </tr>
              </table>
${accountBlock}
              <p style="${BODY_TEXT}">
                Event day is <strong>${escapeHtml(site.eventDate)}</strong> at
                ${escapeHtml(site.venue)}.
              </p>
${misdeliveryNote}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 36px; background-color:#f0e2cd; border-top:1px solid #e4c8a8; text-align:center;">
              <p style="margin:0; color:#6e300a; font-size:12px; font-weight:bold; letter-spacing:1px; line-height:1.6; text-transform:uppercase;">
                Tradition &middot; Skill &middot; Competition
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`.trim();

  return { subject, text, html };
};
