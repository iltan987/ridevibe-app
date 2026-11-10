import { Placeholder } from "./placeholder";

// English translation of the KVKK privacy notice — DRAFT. The Turkish text prevails.
export function PrivacyEn() {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        This is a translation for convenience. In case of any discrepancy, the Turkish version prevails.
      </p>

      <h2>1. Data controller</h2>
      <p>
        Your personal data is processed under the Turkish Personal Data Protection Law No. 6698 (&quot;KVKK&quot;) by{" "}
        <Placeholder>NAME OF THE DATA CONTROLLER</Placeholder> (&quot;Ride &amp; Vibe&quot;) as data controller, as described
        below. Contact: <Placeholder>CONTACT EMAIL</Placeholder>.
      </p>

      <h2>2. What data we process</h2>
      <ul>
        <li><strong>Identity and contact:</strong> full name, phone number, email address, date of birth, city and district, (optional) Instagram username.</li>
        <li><strong>Riding information:</strong> license class, riding experience, motorcycle details, riding style, other club memberships.</li>
        <li><strong>Application answers:</strong> events you&apos;re interested in, your expectations and answers to open questions.</li>
        <li><strong>Account data:</strong> when you sign in with Google, the name, email address and profile photo of your Google account.</li>
        <li><strong>Ad source:</strong> if you reached the application page through an ad link, the campaign information in that link (e.g. which Instagram ad).</li>
        <li><strong>Images:</strong> only with your explicit consent, photos of you taken at events.</li>
        <li><strong>Technical data:</strong> a session cookie that is strictly necessary for signing in.</li>
      </ul>

      <h2>3. Why we process it</h2>
      <ul>
        <li>To review your membership application and contact you (via WhatsApp, phone or email),</li>
        <li>To manage your membership, plan events and rides, and ensure participation and group riding safety,</li>
        <li>To check the 18+ requirement and to celebrate your birthday,</li>
        <li>To measure which promotion channels and ads work,</li>
        <li>With your explicit consent, to share event photos in the club gallery.</li>
      </ul>

      <h2>4. Legal bases</h2>
      <ul>
        <li>Necessity for establishing and performing the membership relationship (KVKK art. 5/2-c),</li>
        <li>The club&apos;s legitimate interest, provided it does not harm your fundamental rights (KVKK art. 5/2-f): running the club, event safety, measuring promotion channels,</li>
        <li>Your explicit consent for sharing photos in the gallery (KVKK art. 5/1). You can give or withdraw it at any time on your account page, without affecting your membership.</li>
      </ul>

      <h2>5. Who we share it with; transfers abroad</h2>
      <p>
        Your data is never sold or shared with third parties for advertising.
      </p>
      <p>
        Within the club: active members can see your name, profile photo, district/side and motorcycles in the member
        directory. Your birthday (day and month only) is shown too; you can turn it off in your profile at any time. Your
        Instagram username is shown only if you turn it on in your profile.
      </p>
      <p>
        To provide the service we use these service providers (data processors):
      </p>
      <ul>
        <li><strong>Supabase</strong> — database and authentication; data is stored in the European Union (Frankfurt, Germany).</li>
        <li><strong>Vercel</strong> — website hosting; server processing takes place in Frankfurt.</li>
        <li><strong>Google</strong> — &quot;Sign in with Google&quot;.</li>
      </ul>
      <p>
        As these providers are located outside Türkiye, transfers are based on the standard contracts announced by the
        Personal Data Protection Board under KVKK art. 9. <Placeholder>STATUS OF STANDARD CONTRACTS AND BOARD NOTIFICATION</Placeholder>
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Rejected applications: deleted <Placeholder>6 MONTHS</Placeholder> after the decision.</li>
        <li>Member data: kept during membership and for <Placeholder>1 YEAR</Placeholder> after it ends, then deleted or anonymised.</li>
        <li>Photos: removed from the gallery when you withdraw your consent.</li>
      </ul>

      <h2>7. How we collect it</h2>
      <p>
        Electronically, through the application form, Google sign-in and your use of the site (session cookie), by
        automated or partly automated means.
      </p>

      <h2>8. Your rights (KVKK art. 11)</h2>
      <p>You have the right to:</p>
      <ul>
        <li>learn whether your personal data is processed and request information about it,</li>
        <li>learn the purpose of processing and whether it is used accordingly,</li>
        <li>know the third parties in Türkiye or abroad to whom it is transferred,</li>
        <li>request correction if it is incomplete or inaccurate,</li>
        <li>request deletion or destruction under the conditions of KVKK art. 7,</li>
        <li>request that corrections and deletions be notified to third parties it was transferred to,</li>
        <li>object to a result against you arising solely from automated analysis,</li>
        <li>claim compensation for damages arising from unlawful processing.</li>
      </ul>

      <h2>9. How to exercise your rights</h2>
      <p>
        Send your request to <Placeholder>CONTACT EMAIL</Placeholder>. Requests are handled free of charge within 30 days
        at the latest.
      </p>
    </>
  );
}
