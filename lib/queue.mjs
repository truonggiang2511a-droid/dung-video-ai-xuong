// Hàng chờ cho việc nặng: đổi file video (cpu) và xuất MP4 (render). Nhiều khách cùng lúc thì xếp lượt, báo số thứ tự.
const LIMIT = { cpu: +process.env.XUONG_CPU || 2, render: +process.env.XUONG_RENDER || 2 };
const state = {};

export function slot(name, fn, onQueue) {
  const s = (state[name] ||= { busy: 0, wait: [] });
  return new Promise((resolve, reject) => {
    const go = () => {
      s.busy++;
      onQueue && onQueue(0);
      Promise.resolve().then(fn).then(resolve, reject).finally(() => {
        s.busy--;
        const next = s.wait.shift();
        s.wait.forEach((w, i) => w.onQueue && w.onQueue(i + 1));
        if (next) next.go();
      });
    };
    if (s.busy < (LIMIT[name] || 1)) go();
    else { s.wait.push({ go, onQueue }); onQueue && onQueue(s.wait.length); }
  });
}

export function queueInfo() {
  return Object.fromEntries(Object.entries(state).map(([k, s]) => [k, { busy: s.busy, wait: s.wait.length, limit: LIMIT[k] || 1 }]));
}
