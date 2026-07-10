import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import Icon from 'react-native-vector-icons/Ionicons';
import { createStyles } from '../../../theme';
import { B } from '../shared/brand';
import { logger } from '../../../lib/logger';

// Live QR scanner for the box-office ticket verify flow. Web-only: html5-qrcode
// drives getUserMedia + the decode loop, targeting the DOM node react-native-web
// renders for `nativeID="mt-qr-reader"`. On detect it fires onDetected(text) once
// and the parent runs the existing verify_ticket RPC. Camera is always released.
export const TicketScanner = ({ onDetected, onClose }: {
  onDetected: (text: string) => void;
  onClose: () => void;
}) => {
  const handledRef = useRef(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);

  // DOM types aren't in this project's tsconfig lib, so reach navigator via
  // globalThis and cast (mirrors SeatGrid's `(globalThis as any).window`).
  const nav = (globalThis as any).navigator;
  const canScan =
    Platform.OS === 'web' && !!nav?.mediaDevices?.getUserMedia;

  // Single guarded, idempotent teardown. Html5Qrcode.stop() throws SYNCHRONOUSLY
  // when the scanner isn't SCANNING/PAUSED (e.g. start() never ran, or we already
  // stopped after a scan), so a .catch() can't save us — we must gate on getState()
  // and only ever stop once. Every teardown path routes through here.
  const stopScanner = () => {
    const scanner = scannerRef.current;
    if (!scanner || stoppedRef.current) return; // idempotent
    stoppedRef.current = true;
    try {
      const state = scanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        scanner.stop()
          .then(() => { try { scanner.clear(); } catch { /* noop */ } })
          .catch(() => {}); // async reject — ignore
      } else {
        try { scanner.clear(); } catch { /* never started — just clear */ }
      }
    } catch {
      // stop() threw synchronously (not running) — safe to ignore
    }
  };

  useEffect(() => {
    if (!canScan) return;

    const scanner = new Html5Qrcode('mt-qr-reader', { verbose: false } as any);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (handledRef.current) return;
          handledRef.current = true;
          stopScanner();
          onDetected(decodedText);
        },
        undefined, // ignore per-frame decode misses (normal while aiming)
      )
      .catch((err) => { logger.error('QR scanner start failed:', err); });

    // On unmount/Cancel: release the camera so the indicator light never lingers.
    return () => { stopScanner(); };
  }, [canScan, onDetected]);

  if (!canScan) {
    return (
      <View style={sc.wrap}>
        <Text style={sc.fallback}>
          Camera scanning needs the web app plus camera permission. Type the guest&apos;s
          MT- reference above instead.
        </Text>
        <TouchableOpacity style={sc.cancelBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={sc.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={sc.wrap}>
      {/* html5-qrcode owns this node's insides — never render children here. */}
      <View nativeID="mt-qr-reader" style={sc.reader} />
      <Text style={sc.hint}>Point the camera at the guest&apos;s ticket QR.</Text>
      <TouchableOpacity style={sc.cancelBtn} onPress={onClose} activeOpacity={0.85}>
        <Icon name="close" size={16} color={B.txt2} style={{ marginRight: 6 }} />
        <Text style={sc.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

const sc = createStyles({
  wrap: { marginTop: 14, alignItems: 'center', gap: 12 },
  reader: {
    width: 280, height: 280, borderRadius: 12, overflow: 'hidden',
    backgroundColor: B.navy, borderWidth: 1, borderColor: B.border,
  },
  hint: { color: B.txt2, fontSize: 12, textAlign: 'center' },
  fallback: { color: B.txt2, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 320 },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: B.border, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 20, backgroundColor: B.white,
  },
  cancelText: { color: B.txt2, fontWeight: '700', fontSize: 14 },
});
