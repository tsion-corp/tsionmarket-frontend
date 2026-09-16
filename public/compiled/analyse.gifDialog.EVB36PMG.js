import {
  domDialog
} from "./lib.MYPIOGN5.js";
import "./lib.LRP46MC3.js";
import "./lib.HMFK7OOB.js";
import "./lib.AEOHBIQD.js";
import "./lib.RPQH5UYI.js";
import "./lib.XAEDCBGD.js";
import "./lib.X7H2PLEK.js";
import {
  opposite
} from "./lib.53PYQRAK.js";
import "./lib.CAO7TYYH.js";
import "./lib.PNHYIP7B.js";
import "./lib.S3TIZ2HQ.js";
import "./lib.LWF5S4ZV.js";
import "./lib.QPQZCXK2.js";
import {
  licon
} from "./lib.5I4BSVKX.js";
import {
  url
} from "./lib.TT4QSUKQ.js";
import {
  storedBooleanProp
} from "./lib.NFSQQWN5.js";
import "./lib.GMEH5BEF.js";
import "./lib.KO2KTNGK.js";

// ../analyse/src/analyse.gifDialog.ts
function initModule(ctrl) {
  let gifOrientation = ctrl.bottomColor();
  const gifPrefs = {
    players: {
      label: i18n.site.playerNames,
      prop: storedBooleanProp("analyse.gif.players", true)
    },
    ratings: {
      label: i18n.preferences.showPlayerRatings,
      prop: storedBooleanProp("analyse.gif.ratings", true)
    },
    glyphs: {
      label: i18n.site.moveAnnotations,
      prop: storedBooleanProp("analyse.gif.glyphs", false)
    },
    clocks: {
      label: i18n.preferences.chessClock,
      prop: storedBooleanProp("analyse.gif.clocks", false)
    }
  };
  const buildGifUrl = () => {
    const ds = document.body.dataset;
    return url(`${ds.assetUrl}/game/export/gif/${gifOrientation}/${ctrl.data.game.id}.gif`, {
      theme: ds.board,
      piece: ds.pieceSet,
      ...Object.fromEntries(Object.entries(gifPrefs).map(([k, { prop }]) => [k, prop()]))
    });
  };
  const makeToggle = (key) => `
    <div class="setting">
      <div class="switch">
        <input id="gif-${key}" class="cmn-toggle" type="checkbox" ${gifPrefs[key].prop() ? "checked" : ""}>
        <label for="gif-${key}"></label>
      </div>
      <label for="gif-${key}">${gifPrefs[key].label}</label>
    </div>`;
  const updateUrl = (dlg) => dlg.view.querySelector(".gif-download").href = buildGifUrl();
  const toggleAction = (key) => ({
    selector: `#gif-${key}`,
    event: "change",
    listener: (ev, dlg) => {
      gifPrefs[key].prop(ev.target.checked);
      updateUrl(dlg);
    }
  });
  domDialog({
    class: "gif-export",
    modal: true,
    show: true,
    easyClose: "clickOutside",
    htmlText: `
      <div class="gif-export-dialog">
        <strong style="font-size:1.5em">${i18n.site.gameAsGIF}</strong>
        <div class="gif-options">
          <button class="button button-empty text gif-flip" data-icon="${licon.ChasingArrows}">
            ${i18n.site[gifOrientation]}
          </button>
          ${Object.keys(gifPrefs).map(makeToggle).join("")}
        </div>
        <div class="gif-actions">
          <button class="button button-metal text gif-copy" data-icon="${licon.Clipboard}">
            ${i18n.site.copyToClipboard}
          </button>
          <a class="button button-green text gif-download" data-icon="${licon.Download}" href="${buildGifUrl()}" target="_blank">
            ${i18n.site.download}
          </a>
        </div>
      </div>`,
    actions: [
      {
        selector: ".gif-flip",
        listener: (_, dlg) => {
          gifOrientation = opposite(gifOrientation);
          dlg.view.querySelector(".gif-flip").textContent = i18n.site[gifOrientation];
          updateUrl(dlg);
        }
      },
      {
        selector: ".gif-copy",
        listener: (_, dlg) => {
          const url2 = dlg.view.querySelector(".gif-download").href;
          navigator.clipboard.writeText(url2).then(() => {
            const btn = dlg.view.querySelector(".gif-copy");
            btn.dataset.icon = licon.Checkmark;
            btn.classList.remove("button-metal");
            setTimeout(() => {
              btn.dataset.icon = licon.Clipboard;
              btn.classList.add("button-metal");
            }, 1e3);
          });
        }
      },
      {
        selector: ".gif-download",
        listener: (_, dlg) => dlg.close()
      },
      ...Object.keys(gifPrefs).map(toggleAction)
    ]
  });
}
export {
  initModule
};
//# sourceMappingURL=analyse.gifDialog.EVB36PMG.js.map
