'use client';
import { useEffect } from 'react';
import { checkConsumerSession, clearConsumerSession } from '@/lib/consumer-api';
import { store } from '@/lib/store';

/**
 * Asks the server, once per page load, whether the stored session is still a
 * real account — and signs the browser out when it is not.
 *
 * WHY IT EXISTS. The signed-in chrome was driven entirely by localStorage, so
 * an account deleted in admin kept rendering every signed-in option on the next
 * visit, with no call ever made to find out otherwise. That is what the
 * operator hit on 2026-10-20. The enforcement itself lives in the API
 * (JwtAuthGuard now resolves the subject and requires it to be active); this
 * component is what makes the browser find out without waiting for the user to
 * click something that happens to be authenticated.
 *
 * IT RENDERS NOTHING and never blocks paint: a session that is fine must cost
 * the page nothing, and a session that is not is corrected a tick later rather
 * than holding the whole site behind a round trip.
 *
 * IT ONLY ACTS ON AN EXPLICIT REJECTION. `checkConsumerSession` separates "the
 * server says this account is gone" from "I could not reach the server", and
 * only the first signs anyone out — see the note on that function.
 *
 * Mounted once in ChromeWrapper, which wraps every consumer page and is skipped
 * for /admin (operators have their own session in lib/operator.ts).
 */
export function SessionCheck() {
  useEffect(() => {
    let cancelled = false;
    void checkConsumerSession().then((r) => {
      if (cancelled || r !== 'gone') return;
      clearConsumerSession();
      store.signOut();
    });
    return () => { cancelled = true; };
  }, []);

  return null;
}
