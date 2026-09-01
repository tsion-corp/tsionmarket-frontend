import { cn } from "@/lib/utils";

/**
 * The card the Invite Friends comp calls "balcard", used four times on the
 * screen: Referral Eligibility, How it works, Progress, and the referral list.
 *
 * One component rather than four copies of the same class string, because the
 * comp treats it as one thing. Its numbers: a rgba(60,60,60,0.21) fill on a
 * 0.75px rgba(0,0,0,0.07) hairline, 16.54px radius, 16px inset.
 */
export function ReferralCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[16.54px] border-[0.75px] border-black/7 bg-[#3C3C3C]/21 p-4",
        className
      )}
    >
      {children}
    </section>
  );
}

/**
 * A card's heading row. The icon slot is optional because only the eligibility
 * card carries one, and the comp draws it 8px ahead of the title.
 */
export function ReferralCardTitle({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-[16px] leading-5 font-semibold text-[#DCDCDC]">
      {icon}
      {children}
    </h3>
  );
}

/** Body copy inside a card: the comp's #7A7A7A at 12px on a 15.6px line. */
export function ReferralCardBody({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[12px] leading-[15.6px] font-normal text-[#7A7A7A]">{children}</p>;
}
