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
        <li><strong>Emergency contacts:</strong> if you enter them on your account page, the name, relationship and phone number of up to two people. This is third-party data that you give us; please tell the person before you add them.</li>
        <li><strong>Blood type:</strong> special-category personal data, processed only if you give a separate explicit consent and enter it on your account page.</li>
        <li><strong>Motorcycle plates:</strong> optionally, the plate you enter for each motorcycle.</li>
        <li><strong>Safety logs:</strong> a record of operations on blood types and of views of emergency information (who, when, which member).</li>
        <li><strong>Images:</strong> only with your explicit consent, photos of you taken at events; and, if you have expressly consented to it, ride and meet-up photos showing you that are published on the club&apos;s public website.</li>
        <li><strong>Session cookie:</strong> a cookie that is strictly necessary for signing in.</li>
        <li><strong>Application form draft:</strong> while you fill in the form, your answers (except contact details and consents) are kept only in your own browser until you submit and don&apos;t reach us; they are deleted when you submit and expire after 7 days.</li>
        <li><strong>Language cookie and browser storage:</strong> a language cookie that remembers your language choice (1 year). Your browser also keeps, only on your device, your theme choice, your last language switch, a short code derived from your account that keeps open tabs in sync, the state of the install prompt and a note on whether to show the apply link. These are needed for the site to work, are not used to track you and, except for the language cookie, are not sent to us.</li>
      </ul>

      <h2>3. Why we process it</h2>
      <ul>
        <li>To review your membership application and contact you (via WhatsApp, phone or email),</li>
        <li>To manage your membership, plan events and rides, and ensure participation and group riding safety,</li>
        <li>To check the 18+ requirement and to celebrate your birthday,</li>
        <li>To measure which promotion channels and ads work,</li>
        <li>With your explicit consent, to share event photos in the club gallery,</li>
        <li>With your explicit consent, to publish ride and meet-up photos on our public website to promote the club,</li>
        <li>To ensure ride and event safety, reach your relatives in an emergency and inform health teams,</li>
        <li>With your explicit consent, to find blood donors within the club.</li>
      </ul>

      <h2>4. Legal bases</h2>
      <ul>
        <li>Necessity for establishing and performing the membership relationship (KVKK art. 5/2-c),</li>
        <li>The club&apos;s legitimate interest, provided it does not harm your fundamental rights (KVKK art. 5/2-f): running the club, event and club safety, measuring promotion channels,</li>
        <li>Your explicit consent for sharing photos in the gallery (KVKK art. 5/1). You can give or withdraw it at any time on your account page, without affecting your membership.</li>
        <li>Your separate explicit consent for publishing your photos on our public website (KVKK art. 5/1). You can withdraw this consent at any time by writing to us using the method in section 9 or by telling the club management (e.g. on WhatsApp); the photo is then removed from the site.</li>
        <li>Your explicit consent for your blood type (KVKK art. 6). This consent is separate from the photo consents; you can withdraw it at any time on your account page. When you withdraw it, your blood type is deleted; your membership is not affected.</li>
        <li>For your emergency contacts and plates, the club&apos;s legitimate interest (KVKK art. 5/2-f) and, in an emergency, protecting the life or bodily integrity of you or another person (KVKK art. 5/2-b).</li>
      </ul>

      <h2>5. Who we share it with; transfers abroad</h2>
      <p>
        Your data is never sold or shared with third parties for advertising.
      </p>
      <p>
        Within the club: active members can see your name, profile photo, district/side and motorcycles in the member
        directory. Your birthday (day and month only) is shown too; you can turn it off in your profile at any time. Your
        Instagram username is shown only if you turn it on in your profile. Your motorcycle plates are shown in the
        directory too; you can hide them with the &quot;Show my plates&quot; switch on your account page.
      </p>
      <p>
        Your emergency contacts and blood type are not shown to everyone in the directory. Only the club&apos;s safety
        team (active members who have been given that task) and the club&apos;s administrators can see them; the information of members whose
        membership is inactive is not shown to these people. Operations on blood types and views of emergency
        information are logged; only admins can see the log. This information is shared with health teams only in an
        emergency.
      </p>
      <p>
        To provide the service we use these service providers (data processors):
      </p>
      <ul>
        <li><strong>Supabase</strong> — database and authentication; data is stored in the European Union (Frankfurt, Germany).</li>
        <li><strong>Vercel</strong> — website hosting; server processing takes place in Frankfurt.</li>
        <li><strong>Google</strong> — &quot;Sign in with Google&quot;.</li>
        <li><strong>GitHub</strong> — storage of the source code and of the website&apos;s photos; its servers are outside Türkiye.</li>
      </ul>
      <p>
        As these providers are located outside Türkiye, transfers are based on the standard contracts announced by the
        Personal Data Protection Board under KVKK art. 9. <Placeholder>STATUS OF STANDARD CONTRACTS AND BOARD NOTIFICATION</Placeholder>
      </p>

      <p>
        Photos published on our website are visible to anyone and can be indexed by search engines.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Rejected applications: deleted <Placeholder>6 MONTHS</Placeholder> after the decision.</li>
        <li>Member data: kept during membership and for <Placeholder>1 YEAR</Placeholder> after it ends, then deleted or anonymised.</li>
        <li>Photos: gallery photos are removed from the gallery when you withdraw your consent; photos on our website are removed from the site when you withdraw that consent.</li>
        <li>Safety logs (who viewed or changed blood-type data, and when): kept for the same period as other member data.</li>
        <li>Emergency contacts, blood type and plates: kept for the same period as other member data. You can delete your emergency contacts on your account page at any time, and your plates while your membership is active; your blood type is deleted when you withdraw your consent.</li>
        <li>Account deletion: you can request deletion on your account page at any time; your account is hidden from other members and the club management at once. You can restore it by signing in again within 14 days. After that, your account, your member data and your application are permanently deleted. A rejected application is kept until the period above ends. For members whose membership has ended (who left or were suspended), the approved application is kept for 1 year from the deletion request for the club&apos;s safety, based on the club&apos;s legitimate interest (KVKK art. 5/2-f), and then deleted. Safety logs are kept with the details that identify you removed.</li>
      </ul>

      <h2>7. How we collect it</h2>
      <p>
        Electronically, through the application form, Google sign-in and your use of the site (session and language cookies), by
        automated or partly automated means. Photos to be published on the website, and your consent to publish them, are received from you in writing (e.g. via the club&apos;s WhatsApp group).
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
      <p>You can also withdraw your blood type consent and your gallery photo consent yourself on your account page at any time; you can withdraw your consent for photos on our website by writing to us using the method in section 9 or by telling the club management (e.g. on WhatsApp). You can also delete your account and your data in this app yourself on your account page (details in section 6); this does not affect your club membership.</p>

      <h2>9. How to exercise your rights</h2>
      <p>
        Send your request (including withdrawing a consent) to <Placeholder>CONTACT EMAIL</Placeholder>. Requests are handled free of charge within 30 days
        at the latest.
      </p>
    </>
  );
}
