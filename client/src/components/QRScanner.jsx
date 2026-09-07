import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Smartphone, RotateCcw, ShieldAlert } from 'lucide-react';

export default function QRScanner({ onScan, onClose, onError }) {
  const scannerRef = useRef(null);
  const isStoppingRef = useRef(false);
  const [cameraState, setCameraState] = useState('initializing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    let scannerInstance = null;

    const startCamera = async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader-container');
        scannerInstance = scanner;
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.333
        };

        const onScanSuccess = (decodedText) => {
          if (!mounted || isStoppingRef.current) return;
          isStoppingRef.current = true;
          setCameraState('scanned');

          if (scanner.isScanning) {
            scanner.stop()
              .catch(() => {})
              .finally(() => {
                try { scanner.clear(); } catch { /* ignore clear error */ }
                if (mounted) {
                  onScan(decodedText);
                }
              });
          } else {
            onScan(decodedText);
          }
        };

        // Try environment/rear camera first via facingMode
        try {
          await scanner.start(
            { facingMode: 'environment' },
            config,
            onScanSuccess,
            () => {} // suppress frame decode errors
          );
        } catch (facingErr) {
          // If facingMode fails on desktop or certain devices, fallback to device enumeration
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras || cameras.length === 0) {
            throw new Error('No camera devices found', { cause: facingErr });
          }
          const rearCam = cameras.find(
            (c) => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment')
          );
          const cameraId = rearCam ? rearCam.id : cameras[0].id;
          await scanner.start(
            { deviceId: { exact: cameraId } },
            config,
            onScanSuccess,
            () => {}
          );
        }

        if (mounted) {
          setCameraState('scanning');
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Camera initialization error:', err);
        const errString = (err && (err.message || err.toString())) || '';
        const lower = errString.toLowerCase();
        setErrorMessage(errString || 'Could not access the camera.');

        if (lower.includes('notallowederror') || lower.includes('permission') || lower.includes('denied')) {
          setCameraState('permission-denied');
        } else if (lower.includes('notfounderror') || lower.includes('devicesnotfound') || lower.includes('no camera')) {
          setCameraState('no-camera');
        } else {
          setCameraState('error');
        }

        if (onError) onError(errString || 'Failed to start camera');
      }
    };

    startCamera();

    return () => {
      mounted = false;
      const scanner = scannerInstance || scannerRef.current;
      if (scanner) {
        if (scanner.isScanning) {
          scanner.stop()
            .catch(() => {})
            .finally(() => {
              try { scanner.clear(); } catch { /* ignore clear error */ }
            });
        } else {
          try { scanner.clear(); } catch { /* ignore clear error */ }
        }
        scannerRef.current = null;
      }
    };
  }, [onScan, onError]);

  const handleClose = async () => {
    isStoppingRef.current = true;
    const scanner = scannerRef.current;
    if (scanner) {
      if (scanner.isScanning) {
        await scanner.stop().catch(() => {});
      }
      try { scanner.clear(); } catch { /* ignore clear error */ }
      scannerRef.current = null;
    }
    onClose();
  };

  return (
    <div className="qr-camera-scanner">
      <div className="qr-camera-header">
        <Camera size={18} />
        <span>Scan Student QR Code</span>
        <button className="qr-camera-close" onClick={handleClose}>
          <X size={18} />
        </button>
      </div>

      <div className="qr-camera-body">
        {cameraState === 'initializing' && (
          <div className="qr-camera-loading">
            <div className="spinner spinner-dark" />
            <span>Initializing camera...</span>
          </div>
        )}

        {cameraState === 'permission-denied' && (
          <div className="qr-camera-error">
            <ShieldAlert size={36} style={{ color: 'var(--warning-dark)' }} />
            <h4>Camera Permission Denied</h4>
            <p>Please grant camera permission in your browser or device settings to scan QR codes.</p>
            <p className="qr-camera-hint">You can also type or paste the QR code manually below.</p>
            <button className="btn btn-outline btn-sm" onClick={handleClose}>
              <RotateCcw size={14} /> Go Back
            </button>
          </div>
        )}

        {cameraState === 'no-camera' && (
          <div className="qr-camera-error">
            <Smartphone size={36} />
            <h4>No Camera Found</h4>
            <p>This device does not have an available camera.</p>
            <p className="qr-camera-hint">You can still type or paste the QR code manually below.</p>
            <button className="btn btn-outline btn-sm" onClick={handleClose}>
              <RotateCcw size={14} /> Go Back
            </button>
          </div>
        )}

        {cameraState === 'error' && (
          <div className="qr-camera-error">
            <Camera size={36} />
            <h4>Camera Error</h4>
            <p>{errorMessage || 'Could not access the camera. Please check your settings and try again.'}</p>
            <button className="btn btn-outline btn-sm" onClick={handleClose}>
              <RotateCcw size={14} /> Go Back
            </button>
          </div>
        )}

        <div
          className="qr-camera-view"
          style={{
            display: cameraState === 'scanning' || cameraState === 'scanned' ? 'block' : 'none'
          }}
        >
          <div id="qr-reader-container" />
          <div className="qr-camera-overlay">
            <div className="qr-camera-frame">
              <div className="qr-frame-corner tl" />
              <div className="qr-frame-corner tr" />
              <div className="qr-frame-corner bl" />
              <div className="qr-frame-corner br" />
            </div>
            <p className="qr-camera-instruction">
              {cameraState === 'scanned' ? 'QR Code detected!' : 'Point camera at the student\'s QR code'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
