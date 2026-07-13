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

export default function HomePage() {
  const heroRef = useScrollReveal<HTMLElement>();
  const programsRef = useScrollReveal<HTMLElement>();

  return (
    <main className={styles.main}>
      <section
        ref={heroRef}
        className={`${styles.hero} glass reveal`}
      >
        <h1 className={styles.title}>Kairos</h1>
        <p className={styles.tagline}>Know when they&apos;re free.</p>
        <p className={styles.description}>
          Kairos is a private-by-design scheduling app for people who work
          rotating shifts. There are no accounts, no passwords, and no
          profiles to leak — every schedule is protected by a recovery key
          that only you hold, so coordinating availability never means
          handing over your identity.
        </p>
        <ul className={styles.features}>
          <li>No sign-up forms, no email required</li>
          <li>Access your schedule anywhere with your recovery key</li>
          <li>Your availability, visible only to who you choose</li>
        </ul>
      </section>

      <section
        ref={programsRef}
        className={`${styles.programs} glass reveal`}
      >
        <h2 className={styles.programsTitle}>Built for shift work</h2>
        <p className={styles.programsIntro}>
          Rotating shifts don&apos;t follow a normal calendar. Kairos models
          the schedule patterns real shift workers actually use — cycles,
          overrides, and on-call — across the fields that run around the
          clock.
        </p>
        <ul className={styles.roles}>
          {JOB_ROLES.map((role) => (
            <li key={role} className={styles.role}>
              {role}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
