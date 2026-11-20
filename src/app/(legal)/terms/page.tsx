import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "ROVIA Terms of Service.",
  alternates: { languages: { tr: "/kullanim-kosullari" } },
};

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">{CONTACT_EMAIL}</a>;

export default function TermsPageEn() {
  return (
    <LegalPage
      lang="en"
      title="Terms of Service"
      alternate={{ href: "/kullanim-kosullari", label: "Türkçe" }}
      intro={
        <p>
          These terms govern your use of the ROVIA web app (www.roviaroad.com). By creating an account or using ROVIA you
          agree to them. How personal data is processed is described in the <Link href="/privacy" className="underline">Privacy Policy</Link>.
          In case of any conflict, the <Link href="/kullanim-kosullari" className="underline">Turkish version</Link> prevails.
        </p>
      }
    >
      <Section title="1. The service">
        <p>
          ROVIA is a web app for planning road trips, discovering places along a route, recording trips with GPS, saving favourite
          places and keeping a travel journal. It is currently free of charge and under active development; features may change,
          be added or be removed. The service is provided by Onur Büyükcanavar.
        </p>
      </Section>

      <Section title="2. Your account">
        <ul>
          <li>Provide accurate information and keep your account (password, devices) secure.</li>
          <li>You are responsible for activity under your account; tell us promptly about any unauthorised use.</li>
          <li>You must be at least 13 to use ROVIA; users under 18 need a parent’s or guardian’s permission.</li>
        </ul>
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>upload unlawful, infringing, abusive or harmful content;</li>
          <li>upload other people’s personal data or photos without permission, or track others without consent;</li>
          <li>attempt to bypass security, access other users’ data or disrupt the service;</li>
          <li>send excessive automated requests to the service or its map and routing providers, or scrape data.</li>
        </ul>
      </Section>

      <Section title="4. Your content">
        <p>
          You own the photos, notes and other content you upload. You grant ROVIA a limited, non-transferable permission to store,
          process and display that content to you solely to provide the service. Your content is not made public; future sharing
          features will show it to others only when you choose to share. You can delete your content at any time.
        </p>
      </Section>

      <Section title="5. Maps, routes and location">
        <ul>
          <li>Map data © OpenStreetMap contributors (ODbL); routing by Valhalla; map tiles by OpenFreeMap.</li>
          <li>Routes, distances, durations, toll and ferry information, directions and suggested places are for information only and may be incomplete, outdated or wrong. Traffic is not taken into account.</li>
          <li>Always give priority to road signs, traffic rules and instructions from authorities. Do not handle the app while driving; start recording before you set off.</li>
          <li>Check tolls, fares and ferry schedules with the relevant operator.</li>
        </ul>
      </Section>

      <Section title="6. Third-party services">
        <p>ROVIA relies on third-party services for Google sign-in, maps, routing and address search. ROVIA is not responsible for their outages or their own terms. When you sign in with Google, Google’s terms also apply.</p>
      </Section>

      <Section title="7. Availability">
        <p>We aim to keep ROVIA available and error-free but cannot guarantee it. The service may be paused for maintenance, security or technical reasons. If the service is discontinued, reasonable advance notice will be given so you can export your data.</p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>The service is provided “as is”. To the extent permitted by law, ROVIA is not liable for decisions made in reliance on route, duration, cost or place information, for loss or damage during trips, for third-party outages, or for indirect damages. Liability for intent or gross negligence and your non-waivable consumer rights remain unaffected.</p>
      </Section>

      <Section title="9. Termination">
        <p>You may delete your account permanently at any time under Settings → Account and data, and download your data beforehand; you can also request this by emailing <Mail />. Accounts that seriously or repeatedly breach these terms may be suspended or closed, with prior notice where possible.</p>
      </Section>

      <Section title="10. Changes">
        <p>We may update these terms; significant changes will be announced in the app or by email. Continuing to use ROVIA after a change means you accept the updated terms.</p>
      </Section>

      <Section title="11. Governing law">
        <p>These terms are governed by the laws of the Republic of Türkiye. The courts and enforcement offices of İstanbul (Çağlayan) have jurisdiction, without prejudice to your right as a consumer to apply to consumer arbitration committees and consumer courts.</p>
      </Section>

      <Section title="12. Contact">
        <p>Questions and notices: <Mail />.</p>
      </Section>
    </LegalPage>
  );
}
