import {
  getGpus,
  getPrimaryGpu,
  getRenderer,
  setPrimaryGpu,
} from "./primaryGpu.js";
import GObject from "gi://GObject";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as main from "resource:///org/gnome/shell/ui/main.js";

const QuickSettingsMenu = main.panel.statusArea.quickSettings;

const FeatureMenuToggle = GObject.registerClass(
  class FeatureMenuToggle extends QuickSettings.QuickMenuToggle {
    _init() {
      super._init({
        label: "GPU",
        iconName: "video-display-symbolic",
        toggleMode: false,
      });

      this.menu.setHeader("video-display-symbolic", "Primary GPU");
      this.menu.connect("open-state-changed", (_, open) => {
        if (open) this._sync();
      });

      this._sync();
    }

    _sync() {
      const gpus = getGpus();
      const primary = getPrimaryGpu();
      if (primary) gpus.add(primary);
      const proms = [...gpus].map(async (gpu) => {
        let label = `/dev/dri/${gpu}`;

        try {
          label = await getRenderer(gpu);
        } catch (e) {
          logError(e);
        }

        if (gpu === primary) this.label = label;

        const item = new PopupMenu.PopupMenuItem(label);
        item.setOrnament(
          gpu === primary ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE
        );
        item.connect("activate", () => {
          setPrimaryGpu(gpu === primary ? null : gpu);
          this.label = label;
        });
        return item;
      });

      Promise.all(proms)
        .then((items) => {
          this.menu.removeAll();
          for (const item of items) this.menu.addMenuItem(item);
        })
        .catch(logError);
    }
  }
);

export var PrimaryGpuQuickSettings = class PrimaryGpuQuickSettings {
  constructor() {
    this._toggle = null;
  }

  enable() {
    this._toggle = new FeatureMenuToggle();
    var menu = new QuickSettings.QuickSettingsMenu();
    menu.addItem(this._toggle);
  }

  disable() {
    this._toggle.destroy();
    this._toggle = null;
  }
};
