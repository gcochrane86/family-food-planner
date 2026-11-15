import Shopping from './Shopping';
import SparList from './SparList';

/** The Shop tab: the Spar list, then the approved week's shopping. */
export default function ShopList() {
  return (
    <section className="grid gap-5 py-4">
      <h1 className="text-3xl font-bold">Shopping</h1>
      <SparList />
      <Shopping />
    </section>
  );
}
