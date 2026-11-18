// وضعي المالي: تجميع ما لي وما عليّ من كل القطاعات. القطاعات الجديدة تضيف بنودها تلقائياً.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { empty, list, row, sectionTitle, stat } from '../components.js';
import { FIN_KINDS, financeOverview } from '../../core/overview.js';
import { signClass } from '../widgets.js';

export function financeScreen() {
  const fin = financeOverview(ctx.state);
  const body = h(
    'div',
    {},
    h(
      'div',
      { class: 'stats' },
      stat('الفرق العام (لي − عليّ)', F.money(fin.net), { valueClass: signClass(fin.net), cls: 'wide primary' }),
      stat('لي', F.money(fin.assets), { valueClass: 'pos' }),
      stat('عليّ', F.money(fin.liabilities), { valueClass: 'neg' }),
      fin.totals.expected ? stat('مع الدخل المتوقع', F.money(fin.netWithExpected), { valueClass: signClass(fin.netWithExpected), cls: 'wide' }) : null,
    ),
  );
  for (const kind of Object.keys(FIN_KINDS)) {
    const items = fin.items.filter((it) => it.kind === kind);
    if (!items.length) continue;
    body.append(sectionTitle(`${FIN_KINDS[kind]} — ${F.money(fin.totals[kind])}`), list(items.map((it) => row({ title: it.label, subtitle: it.section, value: F.money(it.amount), valueClass: kind === 'payable' ? 'neg' : 'pos', onclick: it.href ? () => ctx.nav(it.href) : null }))));
  }
  if (!fin.items.length) body.append(empty('لا توجد أرصدة بعد'));
  body.append(
    h('p', {
      class: 'muted small',
      text: 'الآن: أرصدة دورات الدواجن (ما يدين به المدير لناحيتك، وما تدين به لشركائك التابعين)، وقيمة العربية التقديرية لو كتبتها في إعدادها. في المرحلة الثانية: السيولة (كاش، بنك، محافظ)، السلف التي لك والتي عليك بتواريخها، الأمانات، الجمعيات، الممتلكات القابلة للبيع بسعرها التقديري، والدخل المتوقع (إيجار، جمعية، أرباح).',
    }),
  );
  return { title: 'وضعي المالي', root: true, body };
}
