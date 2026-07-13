"use client";

import styles from "./page.module.css";
import { useScrollReveal } from "../lib/ui/useScrollReveal";

const JOB_ROLES = [
  "Firefighter",
  "Medical",
  "Law Enforcement",
  "Industrial",
  "Transportation",
  "Hospitality",
];

// Numbered because this is the product's actual flow: you build a private
// schedule, model your rotation on it, then hand out a code to share it.
const FEATURES = [
  {
    number: "01",
    kicker: "Private",
    title: "No accounts. No leaks.",
    body: "There is nothing to sign up for and nothing to breach. Your schedule belongs to a recovery key that only you hold — no email, no password, no profile.",
  },
  {
    number: "02",
    kicker: "Shift-native",
    title: "Built for the rotation.",
    body: "48-on, 96-off. Kelly days. On-call weeks. Kairos models repeating cycles, overrides, and extra shifts directly — not squeezed into a 9-to-5 calendar.",
  },
  {
    number: "03",
    kicker: "Shareable",
    title: "Share with a code.",
    body: "Hand someone a six-character code and they can see when you're free — nothing else. Codes are single-use and expire on their own.",
  },
];

function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`${className ?? ""} reveal`}>
      {children}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <Reveal>
          <p className="kicker">Private by design · No accounts</p>
          <h1 className={styles.title}>
            Know when
            <br />
            they&apos;re <em>free.</em>
          </h1>
          <p className={styles.lede}>
            Kairos is a schedule-sharing app for people who work rotating
            shifts — coming to iPhone. Coordinate availability without
            surrendering your identity: no sign-ups, no passwords, just a
            recovery key that only you hold.
          </p>
          <div className={styles.ctaRow}>
            <span className={styles.ctaPill}>Coming soon to the App Store</span>
            <span className="kicker">Designed for iPhone</span>
          </div>
        </Reveal>
      </section>

      <section className={styles.features} aria-label="What Kairos does">
        {FEATURES.map((feature) => (
          <Reveal key={feature.number} className={styles.feature}>
            <p className="kicker">
              #{feature.number} {feature.kicker}
            </p>
            <h2 className={styles.featureTitle}>{feature.title}</h2>
            <p className={styles.featureBody}>{feature.body}</p>
          </Reveal>
        ))}
      </section>

      <section className={styles.missionBand}>
        <Reveal>
          <p className={`kicker ${styles.missionKicker}`}>The mission</p>
          <p className={styles.missionLine}>
            Your availability, visible only to who you choose —{" "}
            <em>and to no one else.</em>
          </p>
        </Reveal>
      </section>

      <section className={styles.roles} aria-label="Who Kairos is built for">
        <Reveal>
          <p className="kicker">Built for shift work</p>
          <p className={styles.rolesIntro}>
            Rotating shifts don&apos;t follow a normal calendar. Kairos is
            built for the fields that run around the clock.
          </p>
          <ul className={styles.roleList}>
            {JOB_ROLES.map((role) => (
              <li key={role} className={styles.roleChip}>
                {role}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        <span className="kicker">Kairos</span>
        <span className={styles.footerNote}>
          An iPhone app. This site is its front door.
        </span>
      </footer>
    </main>
  );
}
