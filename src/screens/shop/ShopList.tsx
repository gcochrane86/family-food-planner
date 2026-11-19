import { useAdhoc } from '../../lib/adhoc';
import AdhocShop from '../adhoc/AdhocShop';
import Shopping from './Shopping';
import SparList from './SparList';

/** The Shop tab: the Spar list, then the approved week's shopping (or, on a phone in ad-hoc, the ad-hoc shop). */
export default function ShopList() {
  const adhoc = useAdhoc();
  return (
    <section className="grid gap-5 py-4">
      <h1 className="text-3xl font-bold">{adhoc ? 'Ad-hoc shopping' : 'Shopping'}</h1>
      <SparList />
      {adhoc ? <AdhocShop /> : <Shopping />}
    </section>
  );
}
