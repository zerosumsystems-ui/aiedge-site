import { redirect } from 'next/navigation'

/** /analogs is now a tab inside /history. Permanently redirect so old
 *  bookmarks and inbound links keep working. */
export default function AnalogsPage() {
  redirect('/history?tab=analogs')
}
