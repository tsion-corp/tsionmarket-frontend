import {
  formatClockTimeVerbal,
  updateElements
} from "./lib.5Q3MW527.js";
import {
  ShowClockTenths
} from "./lib.CHCAIC5O.js";

// ../lib/src/game/clock/clockCtrl.ts
var ClockCtrl = class {
  constructor(data, pref, ticking, opts) {
    this.opts = opts;
    this.emergSound = {
      play: () => site.sound.play("lowTime"),
      delay: 2e4,
      playable: {
        white: true,
        black: true
      }
    };
    this.elements = { white: {}, black: {} };
    this.timeRatio = (millis) => Math.min(1, millis * this.timeRatioDivisor);
    this.setClock = (d) => {
      const delayMs = (d.delay || 0) * 10;
      this.times = {
        white: d.white * 1e3,
        black: d.black * 1e3,
        activeColor: d.ticking,
        lastUpdate: performance.now() + delayMs
      };
      if (d.ticking) this.scheduleTick(this.times[d.ticking], delayMs);
    };
    this.addTime = (color, time) => {
      this.times[color] += time * 10;
    };
    this.stopClock = () => {
      const color = this.times.activeColor;
      if (color) {
        const curElapse = this.elapsed();
        this.times[color] = Math.max(0, this.times[color] - curElapse);
        this.times.activeColor = void 0;
        return curElapse;
      }
    };
    this.hardStopClock = () => this.times.activeColor = void 0;
    this.scheduleTick = (time, extraDelay) => {
      if (this.tickTimeout !== void 0) clearTimeout(this.tickTimeout);
      const tickInterval = site.blindMode ? 1e3 : this.showTenths(time) ? 100 : 500;
      this.tickTimeout = setTimeout(this.tick, time % tickInterval + 1 + extraDelay);
    };
    // Should only be invoked by scheduleTick.
    this.tick = () => {
      this.tickTimeout = void 0;
      const color = this.times.activeColor;
      if (color === void 0) return;
      const now = performance.now();
      const millis = Math.max(0, this.times[color] - this.elapsed(now));
      this.scheduleTick(millis, 0);
      if (millis === 0) this.opts.onFlag();
      else updateElements(this, this.elements[color], millis);
      if (this.opts.alarmColor === color) {
        if (this.alarmAction && millis < this.alarmAction.seconds * 1e3) {
          this.alarmAction.fire();
          this.alarmAction = void 0;
        }
        if (this.emergSound.playable[color]) {
          if (millis < this.emergMs && !(now < this.emergSound.next)) {
            this.emergSound.play();
            this.emergSound.next = now + this.emergSound.delay;
            this.emergSound.playable[color] = false;
          }
        } else if (millis > 1.5 * this.emergMs) {
          this.emergSound.playable[color] = true;
        }
      }
    };
    this.elapsed = (now = performance.now()) => Math.max(0, now - this.times.lastUpdate);
    this.millisOf = (color) => this.times.activeColor === color ? Math.max(0, this.times[color] - this.elapsed()) : this.times[color];
    this.isRunning = () => this.times.activeColor !== void 0;
    this.speak = () => {
      const msgs = [
        { key: "white", i18nName: i18n.site.white },
        { key: "black", i18nName: i18n.site.black }
      ].map((color) => {
        const time = this.millisOf(color.key);
        const msg = formatClockTimeVerbal(time);
        return `${color.i18nName} - ${msg}`;
      });
      site.sound.say(msgs.join(". "), false, true, true);
    };
    this.config = data;
    this.showTenths = pref.clockTenths === ShowClockTenths.Never ? () => false : pref.clockTenths === ShowClockTenths.Below10Secs ? (time) => time < 1e4 : (time) => time < 36e5;
    this.showBar = pref.clockBar && !site.blindMode;
    this.barTime = 1e3 * (Math.max(data.initial, 2) + 5 * data.increment);
    this.timeRatioDivisor = 1 / this.barTime;
    this.emergMs = 1e3 * Math.min(60, data.initial < 60 ? Math.max(2, data.initial * 0.2) : Math.max(10, data.initial * 0.125));
    this.setClock({
      white: data.white,
      black: data.black,
      ticking
    });
  }
};

export {
  ClockCtrl
};
//# sourceMappingURL=lib.QZCV27CJ.js.map
