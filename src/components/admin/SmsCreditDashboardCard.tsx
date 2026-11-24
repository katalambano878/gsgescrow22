import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardSmsCredit } from '@/lib/sms-credit-types';

type Props = {
  smsCredit: DashboardSmsCredit;
  buySmsHref?: string | null;
};

export function SmsCreditDashboardCard({ smsCredit, buySmsHref }: Props) {
  const blinkLow = smsCredit.status === 'ok' && smsCredit.level === 'low';
  const blinkEmpty = smsCredit.status === 'ok' && smsCredit.level === 'empty';

  let mainValue: string;
  let subline: string | null = null;

  if (smsCredit.status === 'not_connected') {
    mainValue = 'SMS is not connected';
  } else if (smsCredit.status === 'load_failed') {
    mainValue = '—';
    subline = 'The balance could not be loaded';
  } else {
    mainValue = smsCredit.sms_left.toLocaleString('en-GH');
    if (smsCredit.level === 'low') {
      subline = 'Running low, top up soon';
    } else if (smsCredit.level === 'empty') {
      subline = 'SMS credit is empty, texts are not being sent';
    } else {
      subline = 'texts left';
    }
  }

  const tone =
    smsCredit.status === 'ok' && smsCredit.level === 'empty'
      ? 'danger'
      : smsCredit.status === 'ok' && smsCredit.level === 'low'
        ? 'warning'
        : 'default';

  const showTopUp = Boolean(buySmsHref) && smsCredit.status !== 'not_connected';

  return (
    <Card
      className={cn(
        'p-4 sm:p-5',
        tone === 'danger' && 'border-[color:var(--danger)]/35',
        tone === 'warning' && 'border-[color:var(--warning)]/45',
        blinkEmpty && 'sms-credit-double-blink-empty',
        blinkLow && 'sms-credit-double-blink',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <MessageSquare
          size={20}
          className={cn(
            'shrink-0 mt-0.5',
            tone === 'danger' && 'text-[var(--danger)]',
            tone === 'warning' && 'text-[var(--warning)]',
            tone === 'default' && 'text-[var(--primary)]',
          )}
          aria-hidden
        />
        {showTopUp ? (
          <Link
            href={buySmsHref!}
            className="shrink-0 rounded-[var(--radius)] bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:opacity-95"
          >
            Top up
          </Link>
        ) : null}
      </div>
      <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)] mt-3">SMS credit</p>
      <p
        className={cn(
          'font-display font-bold tabular-nums mt-1',
          smsCredit.status === 'not_connected' ? 'text-sm leading-snug' : 'text-2xl',
        )}
      >
        {mainValue}
      </p>
      {subline ? (
        <p
          className={cn(
            'mt-2 text-xs',
            tone === 'danger' && 'text-[var(--danger)] font-semibold',
            tone === 'warning' && 'text-[var(--warning)] font-semibold',
            tone === 'default' && 'text-[var(--muted)]',
          )}
        >
          {subline}
        </p>
      ) : null}
    </Card>
  );
}