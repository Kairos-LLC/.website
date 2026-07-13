import styles from "./dashboard.module.css";

// NOTE: This is a UI shell only. All data below is hardcoded placeholder
// content to prove routing/rendering works. It is intentionally NOT wired
// to Supabase or any live data source — that is out of scope for this unit.
type PlaceholderSlot = {
  id: string;
  day: string;
  time: string;
  status: "free" | "busy" | "tentative";
};

const MOCK_SCHEDULE: PlaceholderSlot[] = [
  { id: "1", day: "Monday", time: "9:00 AM – 11:00 AM", status: "free" },
  { id: "2", day: "Monday", time: "1:00 PM – 2:30 PM", status: "busy" },
  { id: "3", day: "Tuesday", time: "10:00 AM – 12:00 PM", status: "tentative" },
  { id: "4", day: "Wednesday", time: "3:00 PM – 5:00 PM", status: "free" },
  { id: "5", day: "Thursday", time: "9:00 AM – 10:00 AM", status: "busy" },
  { id: "6", day: "Friday", time: "11:00 AM – 1:00 PM", status: "free" },
];

const STATUS_LABEL: Record<PlaceholderSlot["status"], string> = {
  free: "Free",
  busy: "Busy",
  tentative: "Tentative",
};

export default function DashboardPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p className="kicker">Preview</p>
        <h1 className={styles.title}>Your Schedule</h1>
        <p className={styles.subtitle}>
          This is a placeholder view. Sign in with your recovery key to see
          your real availability.
        </p>
      </header>

      <section aria-label="Placeholder schedule" className={styles.grid}>
        {MOCK_SCHEDULE.map((slot) => (
          <article key={slot.id} className={styles.card}>
            <p className={styles.day}>{slot.day}</p>
            <p className={styles.time}>{slot.time}</p>
            <span className={`${styles.badge} ${styles[slot.status]}`}>
              {STATUS_LABEL[slot.status]}
            </span>
          </article>
        ))}
      </section>
    </main>
  );
}
