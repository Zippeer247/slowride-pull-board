# Setting up a Pull Board monitor

About 20 minutes per monitor. You need: the monitor, a Fire TV Stick 4K Plus with its remote, the Mac with this project on it, and the store Wi-Fi password.

Do the **front** monitor with `front` and the **back** monitor with `back`. Everything else is the same.

## 1. Plug in

1. Plug the Fire Stick into the monitor's **HDMI** port. If it doesn't fit, use the short HDMI extender from the box.
2. Power the stick from the **wall adapter in the box**, not from a USB port on the monitor. Monitor USB is too weak, and the stick will restart randomly.
3. Set the monitor's input to that HDMI port.
4. Turn off the monitor's own power saving or "auto off", if it has one. The setting is usually in the monitor's buttons menu.

## 2. First-time Fire TV setup

1. Pair the remote, pick the language, and join the **store Wi-Fi**.
2. Sign in with the store's Amazon account. Skip all the app and parental-control offers.

## 3. Settings that keep the board on screen

On the remote, go to **Settings** (gear icon) and change:

- **Display & Sounds → Screensaver → Start Time → Never**
- **Preferences → Featured Content →** turn off both *Allow Video Autoplay* and *Allow Audio Autoplay*
- **Display & Sounds → Display → Video Resolution → 1080p 60Hz**, if the picture looks wrong or blurry

## 4. Allow the board app to be installed

1. **Settings → My Fire TV → About**. Click the device name (for example "Fire TV Stick 4K Plus") **7 times**, until it says you are a developer.
2. Go back one screen and open **Developer Options**:
   - **ADB Debugging → ON**
   - **Install unknown apps → ON**. If it's a list instead, there's nothing to change yet.
3. Find the stick's IP address under **Settings → My Fire TV → About → Network**. It looks like `192.168.1.57`.

## 5. Install the board (from the Mac)

The one-time tool setup and the APK build are covered in the README, under "Fire TV app". Then, from the `firetv/` folder:

```bash
./scripts/install.sh 192.168.1.57 front     # or: back
```

When the TV asks **"Allow USB debugging?"**, check **Always allow from this computer** and press **OK**.

The board opens on its own.

## 6. Check it

- [ ] The board fills the screen with nothing cut off.
- [ ] On the remote, the ◀ ▶ ▲ ▼ buttons move the white outline. **OK** asks "Pulled #…?", and **Back** cancels.
- [ ] Pull an order, then **hold OK**. The bar fills and the order comes back.
- [ ] **Unplug the stick's power, wait 10 seconds, and plug it back in.** The board comes back on its own within about a minute.
- [ ] Leave it for 30 minutes. No screensaver appears.

## Everyday use (for staff)

- **New orders pulse.** After **30 minutes** the card turns **light red**. If anything has waited over **an hour**, **"To pull" flashes red**.
- Go get the items, set them aside, then on the remote: select the order, press **OK**, then **OK** again.
- **Pulled the wrong one?** **Hold OK** until the bar fills (about 1.5 seconds). The last order you pulled comes back. This works for 15 minutes after the pull.
- **Red "Not connected" bar?** Check the Wi-Fi. The board fixes itself when the internet comes back. The ☰ button on the remote reloads it right away.
- **Someone pressed Home?** Open **Pull Board** from the apps row, or just unplug and replug the stick.

## Troubleshooting

| Problem | Fix |
|---|---|
| Board doesn't open after a power cut | Re-run `install.sh` for that stick. It re-grants the "open on boot" permission. |
| "Wrong display key" | The APK was built with an old key. Rebuild with the current `DISPLAY_KEY` and reinstall. |
| Stick restarts by itself | It's powered from monitor USB. Use the wall adapter. |
| Black bars or a blurry picture | Settings → Display → Video Resolution → 1080p. |
