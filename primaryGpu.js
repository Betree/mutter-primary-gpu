import GLib from "gi://GLib";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { messageTray } from "resource:///org/gnome/shell/ui/main.js";
import Meta from "gi://Meta";
import Gio from "gi://Gio";

const UDEV_RULE_PATH = "/etc/udev/rules.d/61-mutter-primary-gpu.rules";

function exec(command, envVars = {}) {
  return new Promise((resolve, reject) => {
    const [, strArr] = GLib.shell_parse_argv(command);
    const launcher = new Gio.SubprocessLauncher({
      flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });

    for (const [key, value] of Object.entries(envVars)) {
      launcher.setenv(key, value, true);
    }

    const proc = launcher.spawnv(strArr);

    proc.communicate_utf8_async(null, null, (proc, res) => {
      const [arg, stdout, stderr] = proc.communicate_utf8_finish(res);
      if (proc.get_successful()) resolve(stdout);
      else reject(new Error(stderr.trim()));
    });
  });
}

export function getActiveGpu() {
  const cmd = getPrintRendererPath();
  return exec(cmd);
}

export async function getRenderer(device) {
  const file = Gio.File.new_for_path(`/dev/dri/${device}`);
  if (!file.query_exists(null)) return null;
  const property = await exec(
    `udevadm info --query=property --property=ID_PATH_TAG /dev/dri/${device}`
  );
  const regex = /^ID_PATH_TAG=([a-z0-9_-]+)\n?$/;
  const r = regex.exec(property);
  if (!r) return null;
  return exec(getPrintRendererPath(), {
    DRI_PRIME: r[1],
  });
}

export function getPrintRendererPath() {
  const knownPaths = [
    "/usr/libexec/gnome-control-center-print-renderer",
    "/usr/lib/gnome-control-center-print-renderer",
  ];

  for (const path of knownPaths) {
    if (Gio.File.new_for_path(path).query_exists(null)) {
      return path;
    }
  }

  throw new Error(
    "Unable to find `gnome-control-center-print-renderer` in any known location."
  );
}

export function getGpus() {
  const path = Gio.File.new_for_path("/dev/dri/");
  const enumerator = path.enumerate_children("standard::name", 0, null);

  const gpus = new Set();

  let f;
  while ((f = enumerator.next_file(null))) {
    const name = f.get_name();
    if (name.startsWith("card")) gpus.add(name);
  }

  return gpus;
}

export function getPrimaryGpu() {
  const file = Gio.File.new_for_path(UDEV_RULE_PATH);
  if (!file.query_exists(null)) return null;
  const [, contents] = file.load_contents(null);
  const decoder = new TextDecoder();
  const c = decoder.decode(contents).trim();
  const regex =
    /^ENV{DEVNAME}=="\/dev\/dri\/(card[\d+])", TAG\+="mutter-device-preferred-primary"$/;
  const r = regex.exec(c);
  if (!r) return null;
  return r[1];
}

export function notify(message) {
  const source = new MessageTray.Source();
  messageTray.add(source);
  const notification = new MessageTray.Notification(
    source,
    "Mutter Primary GPU",
    message,
    {
      gicon: new Gio.ThemedIcon({ name: "video-display-symbolic" }),
    }
  );
  notification.setTransient(true);
  source.showNotification(notification);
}

export function notifyError(err) {
  logError(err);
  const source = new MessageTray.Source();
  messageTray.add(source);
  const notification = new MessageTray.Notification(
    source,
    "Mutter Primary GPU",
    err.message,
    { gicon: new Gio.ThemedIcon({ name: "video-display-symbolic" }) }
  );
  notification.setTransient(true);
  notification.setUrgency(MessageTray.Urgency.CRITICAL);
  source.showNotification(notification);
}

export function setPrimaryGpu(primary) {
  const commands = [];

  // Only way to remove mutter-device-preferred-primary tag that might have been set previosly
  const untagUdevRule = `ENV{DEVNAME}=="/dev/dri/card*", TAG="dummytag"`;
  commands.push(`echo ${GLib.shell_quote(untagUdevRule)} > ${UDEV_RULE_PATH}`);
  commands.push(`udevadm control --reload-rules`);
  commands.push(`udevadm trigger`);

  if (primary) {
    // Add mutter-device-preferred-primary tag
    const tagUdevRule = `ENV{DEVNAME}=="/dev/dri/${primary}", TAG+="mutter-device-preferred-primary"`;
    commands.push(`echo ${GLib.shell_quote(tagUdevRule)} > ${UDEV_RULE_PATH}`);
  } else {
    commands.push(`rm ${UDEV_RULE_PATH}`);
  }

  commands.push(`udevadm control --reload-rules`);
  commands.push(`udevadm trigger`);

  exec(`pkexec sh -c ${GLib.shell_quote(commands.join(" && "))}`)
    .then(() => {
      if (!Meta.is_wayland_compositor())
        notify("Primary GPU selection is only supported on Wayland.");
      else if (primary)
        notify(
          "The selected GPU has been tagged as primary. This change will take effect after the next login."
        );
      else
        notify(
          "The selected GPU is no longer tagged as primary. This change will take effect after the next login."
        );
    })
    .catch(notifyError);
}
