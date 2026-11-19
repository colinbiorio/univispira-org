// ui.js — what is said over the picture: a question, glowing words, a hint.
export function createUI(root) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ask = root.querySelector('#ask'), words = root.querySelector('#words'), hint = root.querySelector('#hint');
  let hintTimer = 0;
  return {
    // a question with two answers; resolves true or false (and false if it is left a long while)
    ask(text, { yes = 'Allow', no = 'Not now', note = '', timeout = 45000 } = {}) {
      ask.querySelector('.q').textContent = text;
      ask.querySelector('.note').textContent = note;
      const by = ask.querySelector('.yes'), bn = ask.querySelector('.no');
      by.textContent = yes; bn.textContent = no;
      ask.hidden = false; requestAnimationFrame(() => ask.classList.add('in'));
      setTimeout(() => by.focus({ preventScroll: true }), 400);
      return new Promise((resolve) => {
        let done = false;
        const end = async (v) => {
          if (done) return; done = true;
          by.onclick = bn.onclick = null; clearTimeout(t);
          ask.classList.remove('in'); await wait(600); ask.hidden = true; resolve(v);
        };
        const t = setTimeout(() => end(false), timeout);
        by.onclick = (e) => { e.stopPropagation(); end(true); };
        bn.onclick = (e) => { e.stopPropagation(); end(false); };
      });
    },
    // lines of glowing words, one after another
    async words(lines, { gap = 1500 } = {}) {
      words.innerHTML = '';
      words.hidden = false;
      const els = lines.map((l) => { const s = document.createElement('span'); s.className = 'line'; s.textContent = l; words.appendChild(s); return s; });
      for (const s of els) { s.classList.add('in'); await wait(gap); }
      await wait(800);
    },
    async unwords() { for (const s of words.querySelectorAll('.line')) s.classList.add('out'); await wait(1600); words.hidden = true; words.innerHTML = ''; },
    hint(text, ms = 4200) {
      clearTimeout(hintTimer);
      hint.textContent = text; hint.classList.add('in');
      hintTimer = setTimeout(() => hint.classList.remove('in'), ms);
    },
    unhint() { clearTimeout(hintTimer); hint.classList.remove('in'); },
  };
}
