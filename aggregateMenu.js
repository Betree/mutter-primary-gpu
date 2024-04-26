import {
  getActiveGpu,
  getGpus,
  getPrimaryGpu,
  getRenderer,
  setPrimaryGpu,
} from "./primaryGpu.js";

var Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.SystemIndicator {
    _init() {
      super._init();
      this._item = new PopupMenu.PopupSubMenuMenuItem("", true);
      getActiveGpu()
        .then((prm) => {
          this._item.label.text = prm;
        })
        .catch(logError);

      this._item.icon.icon_name = "video-display-symbolic";

      this._item.menu.connect("open-state-changed", (_, open) => {
        if (open) this._sync();
      });

      this.menu.addMenuItem(this._item);

      this._sync();
    }

    _sync() {
      const gpus = getGpus();
      const primary = getPrimaryGpu();
      if (primary) gpus.add(primary);
      const proms = [...gpus].map(async (gpu) => {
        const label = await getRenderer(gpu);
        const item = new PopupMenu.PopupMenuItem(label ?? `/dev/dri/${gpu}`);
        item.setOrnament(
          gpu === primary ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE
        );
        item.connect("activate", () => {
          setPrimaryGpu(gpu === primary ? null : gpu);
        });
        return item;
      });

      Promise.all(proms)
        .then((items) => {
          this._item.menu.removeAll();
          for (const item of items) this._item.menu.addMenuItem(item);
        })
        .catch(logError);
    }
  }
);
