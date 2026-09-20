// Jest stub — the camera scanner is DOM/getUserMedia-only.
class Html5Qrcode {
  start() { return Promise.resolve(); }
  stop() { return Promise.resolve(); }
  clear() {}
  getState() { return 0; }
}
module.exports = { Html5Qrcode, Html5QrcodeScannerState: { SCANNING: 2, PAUSED: 3 } };
