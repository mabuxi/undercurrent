import { useApp } from '../context.jsx';
import { Icon } from '../icons.jsx';
import { Shape } from '../shapes.jsx';
import { t } from '../i18n.js';

// How the app looks. The original look, Cutout (deep black, flat saturated colours, windows with a round cut-out for
// their button) or Signal (a club poster: outlines, hard shadows in colour, patterns inside the shapes). The Mac keeps
// the choice, so the iPhone looks the same.
const LOOKS = [
  { id: 'original', name: t('Original'), text: t('Soft and warm, with a serif for the big titles.'), font: t('Instrument Serif and Manrope') },
  { id: 'cutout', name: t('Cutout'), text: t('Deep black, flat saturated colours and bold shapes; every window has a round cut-out for its button.'), font: t('Unbounded and Manrope') },
  { id: 'signal', name: t('Signal'), text: t('Like a club poster: outlines, hard shadows in colour and a pattern inside every shape.'), font: t('Big Shoulders Display and Space Mono') }
];
const SAMPLE = [['circle', '#E07A9A', 'dots'], ['arch', '#7FA7D9', 'stripes'], ['pill', '#B8D86B', 'checker']];

export function LookCard() {
  const { theme, setTheme } = useApp();
  return (
    <div className="card2" id="look">
      <h3>{t('Look')}</h3>
      <p className="wtext">{t('How Undercurrent looks, on this Mac and on your iPhone. Every kink has its own shape, and each look draws them in its own way.')}</p>
      <div className="looks" role="radiogroup" aria-label={t('Look')}>
        {LOOKS.map((l) => (
          <button type="button" key={l.id} role="radio" aria-checked={theme === l.id} className={`lookopt look-${l.id}${theme === l.id ? ' on' : ''}`} onClick={() => { if (theme !== l.id) setTheme(l.id); }}>
            <span className="look-prev" aria-hidden="true">
              <span className="look-title">{l.name}</span>
              <span className="look-shapes">{SAMPLE.map(([s, c, p]) => <Shape key={s} shape={s} color={c} pattern={p} size={30} look={l.id} />)}</span>
            </span>
            <span className="look-txt"><b>{l.name}{theme === l.id ? <Icon name="check" /> : null}</b><span>{l.text}</span><em>{l.font}</em></span>
          </button>
        ))}
      </div>
    </div>
  );
}
