// The privacy policy, deliberately served without the login gate.
//
// Meta requires a publicly reachable privacy policy URL before a WhatsApp
// Business app can be published, and a policy nobody can open is not a policy.
// It is routed ahead of the authentication check in App.tsx for that reason.
//
// It describes what this CRM actually does. Anything it claims should stay
// true of the code: data is kept per owner, WhatsApp replies require human
// approval, and nothing is sold or shared for advertising.

const UPDATED = '5 October 2026';

export function PrivacyPolicy() {
  return <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
    <h1 className="font-display text-3xl font-bold tracking-[-0.04em] md:text-4xl">Privacy Policy</h1>
    <p className="mt-2 text-sm text-muted-foreground">Rollvento Automation · Standard Automatic Solutions Pvt Ltd</p>
    <p className="text-sm text-muted-foreground">Last updated {UPDATED}</p>

    <Section title="Who we are">
      <p>
        Standard Automatic Solutions Pvt Ltd, trading as Rollvento Automation, 215 Business Square Bavdhan,
        Patil Nagar Bavdhan, Pune, Maharashtra 411021, India. We manufacture and supply rolling shutter and gate
        automation products. This policy covers the customer relationship management system we use to handle
        enquiries, including messages sent to our WhatsApp business number.
      </p>
    </Section>

    <Section title="What we collect">
      <ul className="list-disc space-y-1.5 pl-5">
        <li><strong>Contact details</strong> you give us: company name, contact name, phone number, email address and location.</li>
        <li><strong>Your enquiry</strong>: the requirement you describe, and notes our team adds while working on it.</li>
        <li><strong>WhatsApp messages</strong> you send to our business number, and our replies, including the message text and the time it was sent.</li>
        <li><strong>Commercial documents</strong> raised for you: quotations, sales orders and invoices, and the GST registration number you provide for them.</li>
        <li><strong>Business information already published publicly</strong>, such as a company name, address, phone number or website listed on a public business directory, where we are researching potential suppliers or partners.</li>
      </ul>
      <p className="mt-2">
        We do not collect payment card details, and we do not use tracking cookies or advertising pixels.
      </p>
    </Section>

    <Section title="Why we use it">
      <p>
        To answer your enquiry, prepare and send quotations, fulfil orders, and keep a record of our dealings with
        you as a business customer. We use it for no other purpose.
      </p>
    </Section>

    <Section title="WhatsApp messages">
      <p>
        If you message our WhatsApp business number, your message and phone number are stored in our CRM so our team
        can respond and keep the conversation in one place.
      </p>
      <p>
        Replies are drafted in the system but are <strong>only sent after a member of our team reviews and approves
        them</strong>, with one exception: if you enquire about a specific product without telling us how many you
        need, we send back an automatic menu asking for the quantity. That menu is fixed text, is sent only in reply
        to your own message, and is the only message you will ever receive from us without a person having approved
        it.
      </p>
      <p>
        WhatsApp messages are delivered through the WhatsApp Business Platform operated by Meta, and Meta&rsquo;s own
        terms and privacy policy apply to that delivery.
      </p>
    </Section>

    <Section title="Who we share it with">
      <p>
        We do not sell your information, and we do not share it for advertising. We share it only with the service
        providers that run our systems on our behalf, and only so far as they need it:
      </p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li><strong>Meta Platforms</strong> — delivery of WhatsApp messages.</li>
        <li><strong>Vercel</strong> — hosting of the CRM application.</li>
        <li><strong>Supabase</strong> — the database the records are stored in.</li>
        <li><strong>Resend</strong> — delivery of email we send you, where email is used.</li>
      </ul>
      <p className="mt-2">We will also disclose information where the law requires it.</p>
    </Section>

    <Section title="How long we keep it">
      <p>
        Enquiry and message records are kept while the relationship is active and afterwards for as long as we need
        them for accounting, tax and warranty purposes. Commercial documents such as invoices are kept for the period
        Indian tax law requires. When a record is no longer needed, it is deleted.
      </p>
    </Section>

    <Section title="Your choices">
      <p>
        You can ask us what we hold about you, ask us to correct it, or ask us to delete it. You can stop receiving
        messages from us at any time by replying <strong>STOP</strong>, or by telling us by phone or email. If you ask
        us to stop contacting you, we keep the minimum record needed to honour that request.
      </p>
    </Section>

    <Section title="Security">
      <p>
        Access to the CRM requires a password, records are separated per account, and data is transmitted over
        encrypted connections. No system is perfectly secure, but we take reasonable steps to protect what we hold.
      </p>
    </Section>

    <Section title="Contact us">
      <p>
        To make any request under this policy, or to ask a question about it, contact us at{' '}
        <a href="tel:+919309841322" className="font-semibold text-primary hover:underline">+91 93098 41322</a>{' '}
        or through{' '}
        <a href="https://www.standardautomations.in/" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
          standardautomations.in
        </a>.
      </p>
    </Section>

    <p className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
      If we change this policy, we will update the date at the top of this page.
    </p>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-8">
    <h2 className="font-display text-lg font-bold tracking-[-0.03em]">{title}</h2>
    <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>;
}
