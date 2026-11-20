import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How ROVIA collects, uses, stores and protects personal data.",
  alternates: { languages: { tr: "/gizlilik" } },
};

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">{CONTACT_EMAIL}</a>;

export default function PrivacyPageEn() {
  return (
    <LegalPage
      lang="en"
      title="Privacy Policy"
      alternate={{ href: "/gizlilik", label: "Türkçe" }}
      intro={
        <p>
          This policy explains what personal data ROVIA — a road trip planning, GPS trip recording and travel journal web app
          (www.roviaroad.com) — processes, why, who it is shared with, and your rights, under the Turkish Personal Data
          Protection Law No. 6698 (“KVKK”) and, where applicable, the EU General Data Protection Regulation (“GDPR”). ROVIA does not
          sell your data, does not use it for advertising, and does not use tracking or analytics cookies. The Turkish version is
          the{" "}
          <Link href="/gizlilik" className="underline">KVKK disclosure notice</Link>.
        </p>
      }
    >
      <Section title="1. Data controller and contact">
        <p>The data controller is Onur Büyükcanavar, the developer of ROVIA. Contact: <Mail />.</p>
      </Section>

      <Section title="2. Data we process">
        <ul>
          <li>
            <strong>Account data:</strong> email address, name, profile photo URL and session data. If you sign up with email, your
            password is stored only as a one-way hash by our authentication provider; we cannot see it.
          </li>
          <li>
            <strong>Sign in with Google:</strong> if you choose “Continue with Google”, ROVIA receives only your basic profile from
            Google — name, email address and profile picture (scopes: openid, email, profile). ROVIA does not request access to
            Gmail, Drive, Google Maps lists or any other Google service data.
          </li>
          <li><strong>Profile and settings:</strong> display name and preferences such as GPS retention period.</li>
          <li><strong>Trip plans:</strong> origin, destination and stops, the computed route, date, description and route options.</li>
          <li>
            <strong>Location (GPS):</strong> collected only while you have started “Trip Recording” and the app is open. No location
            is collected in the background or outside a recording. While offline, recorded points are kept temporarily in your
            browser storage (IndexedDB) and uploaded when the connection returns. The “My location” button uses your position only
            to show it on the map and centre searches.
          </li>
          <li>
            <strong>Favourites and imported places:</strong> places you save, your notes and list names. Google Takeout, KML, GPX and
            CSV files are read in your browser and are not uploaded; only the places you choose to import (name, coordinates, note,
            source link) are sent. If you paste a Google Maps share link, our server resolves its redirect with Google to find the
            place’s coordinates.
          </li>
          <li>
            <strong>Photos and journal notes:</strong> photos you upload, captions, notes, memories and places visited. Photos are
            resized on your device before upload and their EXIF metadata (GPS location, device model, etc.) is removed from the file.
            The capture time and location are read beforehand and stored only in your private record to place the photo in your
            archive and on your trip map.
          </li>
          <li><strong>Search and routing requests:</strong> place names you search for and points to route between.</li>
          <li>
            <strong>Technical and security data:</strong> per-user request counters to prevent abuse; short-lived server logs kept by
            our hosting provider (IP address, time, requested page, error details).
          </li>
        </ul>
      </Section>

      <Section title="3. Purposes and legal bases">
        <ul>
          <li>Creating your account, signing you in and providing ROVIA’s features — performance of a contract (KVKK Art. 5/2-c; GDPR Art. 6(1)(b)).</li>
          <li>Security, abuse and overload prevention, debugging — legitimate interests (KVKK Art. 5/2-f; GDPR Art. 6(1)(f)).</li>
          <li>Complying with legal obligations and protecting rights (KVKK Art. 5/2-ç and 5/2-e; GDPR Art. 6(1)(c)).</li>
        </ul>
        <p>Location data is processed only when you start a recording, at your request. Your data is not used for automated decision-making, profiling, advertising or marketing.</p>
      </Section>

      <Section title="4. Service providers">
        <ul>
          <li><strong>Supabase</strong> — database, authentication and file storage; servers in the EU (Frankfurt, Germany).</li>
          <li><strong>Vercel</strong> — hosting; server functions run in Frankfurt, static content is served via a global network.</li>
          <li><strong>Google</strong> — authentication, only if you use Sign in with Google.</li>
          <li><strong>OpenFreeMap</strong> — map tiles, downloaded by your browser directly (your IP address reaches this service).</li>
          <li><strong>FOSSGIS Valhalla</strong> (Germany) — route calculation; route points are sent from our server, without account data.</li>
          <li><strong>Photon / komoot</strong> (Germany) — address search; the search text is sent from our server, without account data.</li>
        </ul>
        <p>Some of these providers operate outside Türkiye; your data may therefore be transferred abroad in accordance with KVKK Art. 9 to provide the service. We never sell your data and do not share it with anyone else unless legally required.</p>
      </Section>

      <Section title="5. Google user data (Limited Use)">
        <p>
          ROVIA’s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline" rel="noopener noreferrer" target="_blank">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. The name, email address and profile picture received from Google are used only
          to create and identify your account and to display your name in the app. They are not used for advertising, not sold,
          not used to train AI models, and not read by humans except for security purposes, to comply with applicable law, or with
          your explicit consent.
        </p>
      </Section>

      <Section title="6. Cookies and on-device storage">
        <p>ROVIA uses only strictly necessary cookies to keep you signed in. No advertising, analytics or tracking cookies are used. During GPS recording, points may be stored in your browser until they are uploaded.</p>
      </Section>

      <Section title="7. Retention">
        <ul>
          <li>Account, plans, favourites, photos and notes are kept while your account exists and deleted when you delete them.</li>
          <li>Raw GPS points are kept for the period you choose in Settings (none, 30, 90, 365 days or indefinitely) and deleted automatically afterwards; the trip summary (distance, duration, simplified route) remains until you delete the trip.</li>
          <li>Abuse counters are kept for a few days at most; server logs for the hosting provider’s retention period.</li>
          <li>When your account is deleted, all your data and uploaded files are deleted, subject to legal retention obligations.</li>
        </ul>
      </Section>

      <Section title="8. Security">
        <p>All connections use HTTPS. Database row-level security ensures each user can access only their own data. Photos are kept in non-public storage and shown only to you through short-lived signed links.</p>
      </Section>

      <Section title="9. Your rights">
        <p>
          You may request access to, correction or deletion of your data, information about recipients, and object to processing,
          as provided by KVKK Art. 11 and, where applicable, the GDPR (including data portability and restriction). You can obtain
          a copy of your data in the app at any time via <strong>Settings → Account and data → Download my data</strong>, which
          produces a machine-readable JSON file with all records of your account (profile, trips, GPS recordings, favourites,
          notes, travelogues, shares and photo metadata). You can also send requests to
          <> </><Mail /> from the email address registered to your account; we respond free of charge within 30 days. You may also
          lodge a complaint with the Turkish Personal Data Protection Board or your local supervisory authority.
        </p>
      </Section>

      <Section title="10. Deleting your account">
        <p>You can delete plans, trips, favourites, photos and notes in the app at any time. To delete your account entirely, use <strong>Settings → Account and data → Delete my account</strong>. For your security you must have signed in within the last 15 minutes and type the confirmation phrase. All your uploaded photos are removed from storage first, then your account and all associated data (trips, GPS recordings, favourites, notes, travelogues, share links, settings) are permanently deleted and your share links stop working. This cannot be undone, so we recommend downloading your data first.</p>
        <p>If you cannot access the app, you can also request deletion by emailing <Mail /> from the email address registered to your account. Legal retention obligations remain unaffected.</p>
      </Section>

      <Section title="11. Children">
        <p>ROVIA is not directed at children under 13 and does not knowingly collect their data. Users under 18 should use ROVIA only with the permission of a parent or guardian.</p>
      </Section>

      <Section title="12. Changes">
        <p>We may update this policy; significant changes will be announced in the app or by email. See also the <Link href="/terms" className="underline">Terms of Service</Link>.</p>
      </Section>
    </LegalPage>
  );
}
