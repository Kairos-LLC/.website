import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Kairos</h1>
        <p className={styles.tagline}>Know when they&apos;re free.</p>
        <p className={styles.description}>
          Kairos is a private-by-design scheduling app. Coordinate availability
          without handing over your identity — there are no accounts, no
          passwords, and no profiles to leak. Every schedule is protected by a
          recovery key that only you hold.
        </p>
        <ul className={styles.features}>
          <li>No sign-up forms, no email required</li>
          <li>Access your schedule anywhere with your recovery key</li>
          <li>Your availability, visible only to who you choose</li>
        </ul>
      </section>
    </main>
  );
}
